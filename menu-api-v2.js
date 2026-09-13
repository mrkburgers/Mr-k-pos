const crypto = require("crypto");
const registerInventoryV2 = require("./inventory-api-v2");
const { consumeOrderInventory } = require("./inventory-service-v2");

function makeId(prefix,name){
  const slug=String(name||"")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9]+/g,"-")
    .replace(/^-+|-+$/g,"")
    .slice(0,40) || "item";
  return `${prefix}-${slug}-${crypto.randomBytes(3).toString("hex")}`;
}

module.exports=function registerMenuAdminV2(app,io,db){
  registerInventoryV2(app,io,db);

  const ensureRecipeQuantities=db.transaction(()=>{
    const bun=db.prepare("SELECT id FROM menu_ingredients WHERE name='Burger bun' COLLATE NOCASE LIMIT 1").get();
    const burgers=db.prepare("SELECT id FROM menu_items WHERE category_id='burgers'").all();
    if(bun){
      const addBun=db.prepare(`
        INSERT OR IGNORE INTO menu_item_ingredients
        (menu_item_id,ingredient_id,removable,sort_order,quantity)
        VALUES (?,?,0,99,1)
      `);
      burgers.forEach(item=>addBun.run(item.id,bun.id));
    }

    const brave=db.prepare("SELECT id FROM menu_items WHERE name='Only The Brave' COLLATE NOCASE LIMIT 1").get();
    if(brave){
      const setQty=db.prepare(`
        UPDATE menu_item_ingredients SET quantity=?
        WHERE menu_item_id=? AND ingredient_id=(
          SELECT id FROM menu_ingredients WHERE name=? COLLATE NOCASE LIMIT 1
        )
      `);
      setQty.run(3,brave.id,"Beef patty 120g");
      setQty.run(3,brave.id,"Cheddar cheese");
    }
  });
  ensureRecipeQuantities();

  app.get("/api/menu-v2",(req,res)=>{
    const categories=db.prepare(`
      SELECT id,name,icon,active,sort_order,created_at,updated_at
      FROM menu_categories ORDER BY sort_order ASC,name ASC
    `).all().map(row=>({...row,active:Boolean(row.active)}));

    const ingredients=db.prepare(`
      SELECT id,name,active,created_at,updated_at
      FROM menu_ingredients ORDER BY name ASC
    `).all().map(row=>({...row,active:Boolean(row.active)}));

    const ingredientRows=db.prepare(`
      SELECT i.id,i.name,mii.removable,mii.sort_order,COALESCE(mii.quantity,1) AS quantity
      FROM menu_item_ingredients mii
      JOIN menu_ingredients i ON i.id=mii.ingredient_id
      WHERE mii.menu_item_id=?
      ORDER BY mii.sort_order ASC,i.name ASC
    `);
    const extraRows=db.prepare(`
      SELECT mi.id,mi.name,mi.price,mi.active
      FROM menu_item_extras mie
      JOIN menu_items mi ON mi.id=mie.extra_item_id
      WHERE mie.menu_item_id=?
      ORDER BY mi.sort_order ASC,mi.name ASC
    `);

    const items=db.prepare(`
      SELECT id,name,category_id,price,active,sort_order,created_at,updated_at
      FROM menu_items ORDER BY category_id ASC,sort_order ASC,name ASC
    `).all().map(item=>({
      ...item,
      active:Boolean(item.active),
      ingredients:ingredientRows.all(item.id).map(ingredient=>({
        ...ingredient,
        removable:Boolean(ingredient.removable),
        quantity:Number(ingredient.quantity||1)
      })),
      extras:extraRows.all(item.id).map(extra=>({...extra,active:Boolean(extra.active)}))
    }));

    res.json({categories,items,ingredients});
  });

  app.post("/api/orders-with-inventory",(req,res)=>{
    const {order_uuid,order_type,payment_status="PENDING",payment_method=null,customer_name=null,customer_phone=null,total_amount=0,items=[]}=req.body;
    if(!order_uuid||!order_type)return res.status(400).json({error:"order_uuid and order_type are required"});
    if(!Array.isArray(items))return res.status(400).json({error:"items must be an array"});

    const createOrder=db.transaction(()=>{
      const nextOrderNumber=db.prepare(`
        SELECT COALESCE(MAX(order_number),0)+1 AS next_number
        FROM orders WHERE date(created_at,'localtime')=date('now','localtime')
      `).get().next_number;
      const result=db.prepare(`
        INSERT INTO orders (
          order_uuid,order_number,order_type,payment_status,payment_method,
          customer_name,customer_phone,total_amount
        ) VALUES (?,?,?,?,?,?,?,?)
      `).run(order_uuid,nextOrderNumber,order_type,payment_status,payment_method,customer_name,customer_phone,total_amount);
      const orderId=result.lastInsertRowid;
      const insertItem=db.prepare(`
        INSERT INTO order_items (order_id,item_name,quantity,unit_price,notes)
        VALUES (?,?,?,?,?)
      `);
      items.forEach(item=>insertItem.run(orderId,item.item_name,item.quantity??1,item.unit_price??0,item.notes??null));
      const consumed=payment_status==="PAID"
        ?consumeOrderInventory(db,items,`#${String(nextOrderNumber).padStart(3,"0")}`,"cashier")
        :[];
      return {orderId,orderNumber:nextOrderNumber,consumed};
    });

    let created;
    try{created=createOrder();}
    catch(error){
      if(error.code==="SQLITE_CONSTRAINT_UNIQUE")return res.status(409).json({error:"order_uuid already exists"});
      if(error.message==="INSUFFICIENT_INVENTORY")return res.status(409).json({error:"insufficient inventory",shortages:error.shortages||[]});
      throw error;
    }

    io.emit("order-created",{id:created.orderId,order_number:created.orderNumber,order_uuid,status:"NEW",order_type,total_amount,items});
    if(created.consumed.length)io.emit("inventory-changed",{reason:"sale",order_number:created.orderNumber});
    res.status(201).json({id:created.orderId,order_number:created.orderNumber,order_uuid,status:"NEW",items,inventory_consumed:created.consumed});
  });

  app.patch("/api/menu/categories/:id",(req,res)=>{
    const id=req.params.id;
    const current=db.prepare("SELECT * FROM menu_categories WHERE id=?").get(id);
    if(!current)return res.status(404).json({error:"category not found"});
    const name=String(req.body?.name??current.name).trim();
    const icon=String(req.body?.icon??current.icon).trim()||"🍽️";
    const active=typeof req.body?.active==="boolean"?req.body.active:Boolean(current.active);
    if(!name)return res.status(400).json({error:"category name is required"});
    db.prepare(`UPDATE menu_categories SET name=?,icon=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(name,icon,active?1:0,id);
    io.emit("menu-changed",{type:"category",id});
    res.json({id,name,icon,active});
  });

  app.post("/api/menu/items",(req,res)=>{
    const name=String(req.body?.name??"").trim();
    const categoryId=String(req.body?.category_id??"").trim();
    const price=Number(req.body?.price);
    const active=req.body?.active!==false;
    const ingredientIds=Array.isArray(req.body?.ingredient_ids)?req.body.ingredient_ids:[];
    const quantities=req.body?.ingredient_quantities&&typeof req.body.ingredient_quantities==="object"?req.body.ingredient_quantities:{};
    const removableIds=new Set(Array.isArray(req.body?.removable_ingredient_ids)?req.body.removable_ingredient_ids:[]);
    const extraIds=Array.isArray(req.body?.extra_ids)?req.body.extra_ids:[];
    if(!name||!categoryId||!Number.isFinite(price)||price<0)return res.status(400).json({error:"valid name, category_id and price are required"});
    if(!db.prepare("SELECT id FROM menu_categories WHERE id=?").get(categoryId))return res.status(400).json({error:"invalid category"});

    const id=makeId("menu",name);
    const save=db.transaction(()=>{
      const nextSort=db.prepare("SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM menu_items WHERE category_id=?").get(categoryId).n;
      db.prepare(`INSERT INTO menu_items(id,name,category_id,price,active,sort_order) VALUES(?,?,?,?,?,?)`).run(id,name,categoryId,Math.round(price),active?1:0,nextSort);
      const addIngredient=db.prepare(`
        INSERT OR IGNORE INTO menu_item_ingredients
        (menu_item_id,ingredient_id,removable,sort_order,quantity) VALUES(?,?,?,?,?)
      `);
      ingredientIds.forEach((ingredientId,index)=>{
        if(db.prepare("SELECT id FROM menu_ingredients WHERE id=?").get(ingredientId)){
          const quantity=Math.max(0.01,Number(quantities[ingredientId]??1)||1);
          addIngredient.run(id,ingredientId,removableIds.has(ingredientId)?1:0,index+1,quantity);
        }
      });
      const addExtra=db.prepare(`INSERT OR IGNORE INTO menu_item_extras(menu_item_id,extra_item_id) VALUES(?,?)`);
      extraIds.forEach(extraId=>{if(extraId!==id&&db.prepare("SELECT id FROM menu_items WHERE id=?").get(extraId))addExtra.run(id,extraId);});
    });
    try{save();}catch(error){if(String(error.code||"").includes("CONSTRAINT"))return res.status(409).json({error:"menu item name already exists"});throw error;}
    io.emit("menu-changed",{type:"item-created",id});
    res.status(201).json({id,name,category_id:categoryId,price:Math.round(price),active});
  });

  app.patch("/api/menu/items/:id",(req,res)=>{
    const id=req.params.id;
    const current=db.prepare("SELECT * FROM menu_items WHERE id=?").get(id);
    if(!current)return res.status(404).json({error:"menu item not found"});
    const name=String(req.body?.name??current.name).trim();
    const categoryId=String(req.body?.category_id??current.category_id).trim();
    const price=Number(req.body?.price??current.price);
    const active=typeof req.body?.active==="boolean"?req.body.active:Boolean(current.active);
    const ingredientIds=Array.isArray(req.body?.ingredient_ids)?req.body.ingredient_ids:[];
    const quantities=req.body?.ingredient_quantities&&typeof req.body.ingredient_quantities==="object"?req.body.ingredient_quantities:{};
    const removableIds=new Set(Array.isArray(req.body?.removable_ingredient_ids)?req.body.removable_ingredient_ids:[]);
    const extraIds=Array.isArray(req.body?.extra_ids)?req.body.extra_ids:[];
    if(!name||!categoryId||!Number.isFinite(price)||price<0)return res.status(400).json({error:"invalid menu item data"});
    if(!db.prepare("SELECT id FROM menu_categories WHERE id=?").get(categoryId))return res.status(400).json({error:"invalid category"});

    const save=db.transaction(()=>{
      db.prepare(`UPDATE menu_items SET name=?,category_id=?,price=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(name,categoryId,Math.round(price),active?1:0,id);
      db.prepare("DELETE FROM menu_item_ingredients WHERE menu_item_id=?").run(id);
      const addIngredient=db.prepare(`
        INSERT INTO menu_item_ingredients
        (menu_item_id,ingredient_id,removable,sort_order,quantity) VALUES(?,?,?,?,?)
      `);
      ingredientIds.forEach((ingredientId,index)=>{
        if(db.prepare("SELECT id FROM menu_ingredients WHERE id=?").get(ingredientId)){
          const quantity=Math.max(0.01,Number(quantities[ingredientId]??1)||1);
          addIngredient.run(id,ingredientId,removableIds.has(ingredientId)?1:0,index+1,quantity);
        }
      });
      db.prepare("DELETE FROM menu_item_extras WHERE menu_item_id=?").run(id);
      const addExtra=db.prepare(`INSERT OR IGNORE INTO menu_item_extras(menu_item_id,extra_item_id) VALUES(?,?)`);
      extraIds.forEach(extraId=>{if(extraId!==id&&db.prepare("SELECT id FROM menu_items WHERE id=?").get(extraId))addExtra.run(id,extraId);});
    });
    try{save();}catch(error){if(String(error.code||"").includes("CONSTRAINT"))return res.status(409).json({error:"menu item name already exists"});throw error;}
    io.emit("menu-changed",{type:"item-updated",id});
    res.json({id,name,category_id:categoryId,price:Math.round(price),active});
  });

  app.post("/api/menu/ingredients",(req,res)=>{
    const name=String(req.body?.name??"").trim();
    if(!name)return res.status(400).json({error:"ingredient name is required"});
    const id=makeId("ingredient",name);
    try{
      db.prepare("INSERT INTO menu_ingredients(id,name,active) VALUES(?,?,1)").run(id,name);
      db.prepare("INSERT OR IGNORE INTO inventory_items(ingredient_id) VALUES(?)").run(id);
    }catch(error){if(String(error.code||"").includes("CONSTRAINT"))return res.status(409).json({error:"ingredient name already exists"});throw error;}
    io.emit("menu-changed",{type:"ingredient-created",id});
    io.emit("inventory-changed",{ingredient_id:id});
    res.status(201).json({id,name,active:true});
  });

  app.patch("/api/menu/ingredients/:id",(req,res)=>{
    const id=req.params.id;
    const current=db.prepare("SELECT * FROM menu_ingredients WHERE id=?").get(id);
    if(!current)return res.status(404).json({error:"ingredient not found"});
    const name=String(req.body?.name??current.name).trim();
    const active=typeof req.body?.active==="boolean"?req.body.active:Boolean(current.active);
    if(!name)return res.status(400).json({error:"ingredient name is required"});
    try{db.prepare(`UPDATE menu_ingredients SET name=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(name,active?1:0,id);}
    catch(error){if(String(error.code||"").includes("CONSTRAINT"))return res.status(409).json({error:"ingredient name already exists"});throw error;}
    io.emit("menu-changed",{type:"ingredient-updated",id});
    io.emit("inventory-changed",{ingredient_id:id});
    res.json({id,name,active});
  });
};
