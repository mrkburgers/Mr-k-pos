const crypto = require("crypto");

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
  app.patch("/api/menu/categories/:id",(req,res)=>{
    const id=req.params.id;
    const current=db.prepare("SELECT * FROM menu_categories WHERE id=?").get(id);
    if(!current)return res.status(404).json({error:"category not found"});

    const name=String(req.body?.name ?? current.name).trim();
    const icon=String(req.body?.icon ?? current.icon).trim() || "🍽️";
    const active=typeof req.body?.active==="boolean"?req.body.active:Boolean(current.active);
    if(!name)return res.status(400).json({error:"category name is required"});

    db.prepare(`
      UPDATE menu_categories
      SET name=?, icon=?, active=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(name,icon,active?1:0,id);

    io.emit("menu-changed",{type:"category",id});
    res.json({id,name,icon,active});
  });

  app.post("/api/menu/items",(req,res)=>{
    const name=String(req.body?.name ?? "").trim();
    const categoryId=String(req.body?.category_id ?? "").trim();
    const price=Number(req.body?.price);
    const active=req.body?.active!==false;
    const ingredientIds=Array.isArray(req.body?.ingredient_ids)?req.body.ingredient_ids:[];
    const removableIds=new Set(Array.isArray(req.body?.removable_ingredient_ids)?req.body.removable_ingredient_ids:[]);
    const extraIds=Array.isArray(req.body?.extra_ids)?req.body.extra_ids:[];

    if(!name || !categoryId || !Number.isFinite(price) || price<0){
      return res.status(400).json({error:"valid name, category_id and price are required"});
    }
    if(!db.prepare("SELECT id FROM menu_categories WHERE id=?").get(categoryId)){
      return res.status(400).json({error:"invalid category"});
    }

    const id=makeId("menu",name);
    const save=db.transaction(()=>{
      const nextSort=db.prepare("SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM menu_items WHERE category_id=?").get(categoryId).n;
      db.prepare(`INSERT INTO menu_items(id,name,category_id,price,active,sort_order) VALUES(?,?,?,?,?,?)`)
        .run(id,name,categoryId,Math.round(price),active?1:0,nextSort);

      const addIngredient=db.prepare(`INSERT OR IGNORE INTO menu_item_ingredients(menu_item_id,ingredient_id,removable,sort_order) VALUES(?,?,?,?)`);
      ingredientIds.forEach((ingredientId,index)=>{
        if(db.prepare("SELECT id FROM menu_ingredients WHERE id=?").get(ingredientId)){
          addIngredient.run(id,ingredientId,removableIds.has(ingredientId)?1:0,index+1);
        }
      });

      const addExtra=db.prepare(`INSERT OR IGNORE INTO menu_item_extras(menu_item_id,extra_item_id) VALUES(?,?)`);
      extraIds.forEach(extraId=>{
        if(extraId!==id && db.prepare("SELECT id FROM menu_items WHERE id=?").get(extraId))addExtra.run(id,extraId);
      });
    });

    try{save();}
    catch(error){
      if(String(error.code||"").includes("CONSTRAINT"))return res.status(409).json({error:"menu item name already exists"});
      throw error;
    }

    io.emit("menu-changed",{type:"item-created",id});
    res.status(201).json({id,name,category_id:categoryId,price:Math.round(price),active});
  });

  app.patch("/api/menu/items/:id",(req,res)=>{
    const id=req.params.id;
    const current=db.prepare("SELECT * FROM menu_items WHERE id=?").get(id);
    if(!current)return res.status(404).json({error:"menu item not found"});

    const name=String(req.body?.name ?? current.name).trim();
    const categoryId=String(req.body?.category_id ?? current.category_id).trim();
    const price=Number(req.body?.price ?? current.price);
    const active=typeof req.body?.active==="boolean"?req.body.active:Boolean(current.active);
    const ingredientIds=Array.isArray(req.body?.ingredient_ids)?req.body.ingredient_ids:[];
    const removableIds=new Set(Array.isArray(req.body?.removable_ingredient_ids)?req.body.removable_ingredient_ids:[]);
    const extraIds=Array.isArray(req.body?.extra_ids)?req.body.extra_ids:[];

    if(!name || !categoryId || !Number.isFinite(price) || price<0)return res.status(400).json({error:"invalid menu item data"});
    if(!db.prepare("SELECT id FROM menu_categories WHERE id=?").get(categoryId))return res.status(400).json({error:"invalid category"});

    const save=db.transaction(()=>{
      db.prepare(`UPDATE menu_items SET name=?,category_id=?,price=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .run(name,categoryId,Math.round(price),active?1:0,id);

      db.prepare("DELETE FROM menu_item_ingredients WHERE menu_item_id=?").run(id);
      const addIngredient=db.prepare(`INSERT INTO menu_item_ingredients(menu_item_id,ingredient_id,removable,sort_order) VALUES(?,?,?,?)`);
      ingredientIds.forEach((ingredientId,index)=>{
        if(db.prepare("SELECT id FROM menu_ingredients WHERE id=?").get(ingredientId)){
          addIngredient.run(id,ingredientId,removableIds.has(ingredientId)?1:0,index+1);
        }
      });

      db.prepare("DELETE FROM menu_item_extras WHERE menu_item_id=?").run(id);
      const addExtra=db.prepare(`INSERT OR IGNORE INTO menu_item_extras(menu_item_id,extra_item_id) VALUES(?,?)`);
      extraIds.forEach(extraId=>{
        if(extraId!==id && db.prepare("SELECT id FROM menu_items WHERE id=?").get(extraId))addExtra.run(id,extraId);
      });
    });

    try{save();}
    catch(error){
      if(String(error.code||"").includes("CONSTRAINT"))return res.status(409).json({error:"menu item name already exists"});
      throw error;
    }

    io.emit("menu-changed",{type:"item-updated",id});
    res.json({id,name,category_id:categoryId,price:Math.round(price),active});
  });

  app.post("/api/menu/ingredients",(req,res)=>{
    const name=String(req.body?.name ?? "").trim();
    if(!name)return res.status(400).json({error:"ingredient name is required"});
    const id=makeId("ingredient",name);
    try{
      db.prepare("INSERT INTO menu_ingredients(id,name,active) VALUES(?,?,1)").run(id,name);
    }catch(error){
      if(String(error.code||"").includes("CONSTRAINT"))return res.status(409).json({error:"ingredient name already exists"});
      throw error;
    }
    io.emit("menu-changed",{type:"ingredient-created",id});
    res.status(201).json({id,name,active:true});
  });

  app.patch("/api/menu/ingredients/:id",(req,res)=>{
    const id=req.params.id;
    const current=db.prepare("SELECT * FROM menu_ingredients WHERE id=?").get(id);
    if(!current)return res.status(404).json({error:"ingredient not found"});
    const name=String(req.body?.name ?? current.name).trim();
    const active=typeof req.body?.active==="boolean"?req.body.active:Boolean(current.active);
    if(!name)return res.status(400).json({error:"ingredient name is required"});
    try{
      db.prepare(`UPDATE menu_ingredients SET name=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(name,active?1:0,id);
    }catch(error){
      if(String(error.code||"").includes("CONSTRAINT"))return res.status(409).json({error:"ingredient name already exists"});
      throw error;
    }
    io.emit("menu-changed",{type:"ingredient-updated",id});
    res.json({id,name,active});
  });
};
