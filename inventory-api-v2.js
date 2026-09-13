module.exports=function registerInventoryV2(app,io,db){
 const ingredientColumns=db.prepare("PRAGMA table_info(menu_item_ingredients)").all();
 if(!ingredientColumns.some(column=>column.name==="quantity")){
  db.exec("ALTER TABLE menu_item_ingredients ADD COLUMN quantity REAL NOT NULL DEFAULT 1");
 }

 db.exec(`
  CREATE TABLE IF NOT EXISTS inventory_items (
   ingredient_id TEXT PRIMARY KEY,
   tracked INTEGER NOT NULL DEFAULT 0,
   unit TEXT NOT NULL DEFAULT 'unit',
   stock REAL NOT NULL DEFAULT 0,
   low_stock_level REAL NOT NULL DEFAULT 0,
   updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
   FOREIGN KEY (ingredient_id) REFERENCES menu_ingredients(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS inventory_movements (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   ingredient_id TEXT NOT NULL,
   movement_type TEXT NOT NULL,
   quantity REAL NOT NULL,
   stock_before REAL NOT NULL,
   stock_after REAL NOT NULL,
   note TEXT,
   created_by TEXT,
   created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
   FOREIGN KEY (ingredient_id) REFERENCES menu_ingredients(id)
  );

  CREATE INDEX IF NOT EXISTS idx_inventory_movements_ingredient
  ON inventory_movements(ingredient_id, id DESC);

  CREATE TABLE IF NOT EXISTS inventory_legacy_state (
   id INTEGER PRIMARY KEY CHECK (id=1),
   suppliers_json TEXT NOT NULL DEFAULT '[]',
   deliveries_json TEXT NOT NULL DEFAULT '[]',
   movements_json TEXT NOT NULL DEFAULT '[]',
   updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  INSERT OR IGNORE INTO inventory_legacy_state (id)
  VALUES (1);
 `);

 const legacyTrackedIngredients=[
  ["beef120","Beef patty 120g"],
  ["chicken120","Grilled chicken breast 120g"],
  ["bun","Burger bun"],
  ["mushroom","Sautéed mushrooms"],
  ["beefTenderloin100","Sautéed beef tenderloin 100g"],
  ["bacon","Bacon"],
  ["smokedTurkey","Smoked turkey"],
  ["cheddar","Cheddar cheese"],
  ["mozzarella","Mozzarella cheese"],
  ["emmental","Emmental cheese"],
  ["gratedCheese","Grated cheese"],
  ["potatoes","Potatoes"],
  ["plantain","Plantain Tostones"],
  ["fajitaChicken100","100g Fajita Chicken"],
  ["coleslaw","Coleslaw"]
 ];

 const stockMenuProducts=[
  ["drink-small-water","stock-small-water","Small Water"],
  ["drink-big-water","stock-big-water","Big Water"],
  ["drink-coke","stock-coca-cola","Coca Cola"],
  ["drink-sprite","stock-sprite","Sprite"],
  ["drink-fanta","stock-fanta","Fanta"],
  ["sauce-mrk",null,"Mr K Sauce"],
  ["sauce-chimichurri","stock-chimichurri","Chimichurri"],
  ["sauce-ketchup","stock-ketchup","Ketchup"],
  ["sauce-mayo",null,"Mayonnaise"],
  ["sauce-honey-mustard","stock-honey-mustard","Honey Mustard"],
  ["sauce-honey-bbq","stock-honey-bbq","Honey BBQ"]
 ];

 const ensureTrackedInventory=db.transaction(()=>{
  const findIngredient=db.prepare("SELECT id FROM menu_ingredients WHERE name=? COLLATE NOCASE LIMIT 1");
  const insertIngredient=db.prepare(`INSERT OR IGNORE INTO menu_ingredients (id,name,active) VALUES (?,?,1)`);
  const insertInventory=db.prepare(`
   INSERT OR IGNORE INTO inventory_items (ingredient_id,tracked,unit,stock,low_stock_level)
   VALUES (?,1,'unit',0,0)
  `);
  const trackInventory=db.prepare(`UPDATE inventory_items SET tracked=1,unit='unit' WHERE ingredient_id=?`);
  const addRecipe=db.prepare(`
   INSERT OR IGNORE INTO menu_item_ingredients (
    menu_item_id,ingredient_id,removable,sort_order,quantity
   ) VALUES (?,?,0,1,1)
  `);

  legacyTrackedIngredients.forEach(([preferredId,name])=>{
   let ingredient=findIngredient.get(name);
   if(!ingredient){
    insertIngredient.run(preferredId,name);
    ingredient={id:preferredId};
   }
   insertInventory.run(ingredient.id);
   trackInventory.run(ingredient.id);
  });

  stockMenuProducts.forEach(([menuItemId,preferredIngredientId,name])=>{
   if(!db.prepare("SELECT id FROM menu_items WHERE id=?").get(menuItemId))return;
   let ingredient=findIngredient.get(name);
   if(!ingredient && preferredIngredientId){
    insertIngredient.run(preferredIngredientId,name);
    ingredient={id:preferredIngredientId};
   }
   if(!ingredient)return;
   insertInventory.run(ingredient.id);
   trackInventory.run(ingredient.id);
   addRecipe.run(menuItemId,ingredient.id);
  });
 });
 ensureTrackedInventory();

 const seedInventory=db.prepare(`
  INSERT OR IGNORE INTO inventory_items (ingredient_id)
  SELECT id FROM menu_ingredients
 `);
 seedInventory.run();

 function inventoryRows(){
  return db.prepare(`
   SELECT
    i.id,
    i.name,
    i.active,
    COALESCE(inv.tracked,0) AS tracked,
    COALESCE(inv.unit,'unit') AS unit,
    COALESCE(inv.stock,0) AS stock,
    COALESCE(inv.low_stock_level,0) AS low_stock_level,
    inv.updated_at
   FROM menu_ingredients i
   LEFT JOIN inventory_items inv ON inv.ingredient_id=i.id
   ORDER BY i.name ASC
  `).all().map(row=>({
   ...row,
   active:Boolean(row.active),
   tracked:Boolean(row.tracked),
   low_stock:Boolean(row.tracked && Number(row.stock)<=Number(row.low_stock_level))
  }));
 }

 app.get("/api/inventory",(req,res)=>{
  seedInventory.run();
  res.json({items:inventoryRows()});
 });

 app.patch("/api/inventory/:ingredientId",(req,res)=>{
  const id=String(req.params.ingredientId||"");
  const ingredient=db.prepare("SELECT id,name FROM menu_ingredients WHERE id=?").get(id);
  if(!ingredient)return res.status(404).json({error:"ingredient not found"});

  seedInventory.run();
  const current=db.prepare("SELECT * FROM inventory_items WHERE ingredient_id=?").get(id);
  const tracked=typeof req.body?.tracked==="boolean"?req.body.tracked:Boolean(current.tracked);
  const unit=String(req.body?.unit??current.unit??"unit").trim()||"unit";
  const lowStock=Number(req.body?.low_stock_level??current.low_stock_level??0);
  if(!Number.isFinite(lowStock)||lowStock<0){
   return res.status(400).json({error:"low_stock_level must be zero or greater"});
  }

  db.prepare(`
   UPDATE inventory_items
   SET tracked=?,unit=?,low_stock_level=?,updated_at=CURRENT_TIMESTAMP
   WHERE ingredient_id=?
  `).run(tracked?1:0,unit,lowStock,id);

  const updated=inventoryRows().find(item=>item.id===id);
  io.emit("inventory-changed",{ingredient_id:id});
  res.json(updated);
 });

 app.post("/api/inventory/:ingredientId/adjust",(req,res)=>{
  const id=String(req.params.ingredientId||"");
  const ingredient=db.prepare("SELECT id,name FROM menu_ingredients WHERE id=?").get(id);
  if(!ingredient)return res.status(404).json({error:"ingredient not found"});

  seedInventory.run();
  const amount=Number(req.body?.quantity);
  if(!Number.isFinite(amount)||amount===0){
   return res.status(400).json({error:"quantity must be a non-zero number"});
  }

  const movementType=String(req.body?.movement_type||"ADJUSTMENT").trim().toUpperCase();
  const note=String(req.body?.note||"").trim()||null;
  const createdBy=String(req.body?.created_by||"").trim()||null;

  const changeStock=db.transaction(()=>{
   const current=db.prepare("SELECT stock FROM inventory_items WHERE ingredient_id=?").get(id);
   const before=Number(current?.stock||0);
   const after=before+amount;
   if(after<0)throw new Error("INSUFFICIENT_STOCK");

   db.prepare(`UPDATE inventory_items SET stock=?,updated_at=CURRENT_TIMESTAMP WHERE ingredient_id=?`).run(after,id);
   db.prepare(`
    INSERT INTO inventory_movements (
     ingredient_id,movement_type,quantity,stock_before,stock_after,note,created_by
    ) VALUES (?,?,?,?,?,?,?)
   `).run(id,movementType,amount,before,after,note,createdBy);
   return {before,after};
  });

  let result;
  try{result=changeStock();}
  catch(error){
   if(error.message==="INSUFFICIENT_STOCK")return res.status(409).json({error:"stock cannot go below zero"});
   throw error;
  }

  io.emit("inventory-changed",{ingredient_id:id});
  res.json({ingredient_id:id,stock_before:result.before,stock_after:result.after});
 });

 app.get("/api/inventory/movements",(req,res)=>{
  const rows=db.prepare(`
   SELECT
    m.id,m.ingredient_id,i.name AS ingredient_name,m.movement_type,
    m.quantity,m.stock_before,m.stock_after,m.note,m.created_by,m.created_at
   FROM inventory_movements m
   JOIN menu_ingredients i ON i.id=m.ingredient_id
   ORDER BY m.id DESC
   LIMIT 500
  `).all();
  res.json(rows);
 });

 app.get("/api/inventory/legacy-state",(req,res)=>{
  const state=db.prepare(`SELECT suppliers_json,deliveries_json,movements_json FROM inventory_legacy_state WHERE id=1`).get();
  const parse=(value)=>{try{return JSON.parse(value||"[]");}catch{return [];}};
  res.json({suppliers:parse(state?.suppliers_json),deliveries:parse(state?.deliveries_json),movements:parse(state?.movements_json)});
 });

 app.put("/api/inventory/stock-snapshot",(req,res)=>{
  seedInventory.run();
  const stock=req.body?.stock;
  const ingredients=Array.isArray(req.body?.ingredients)?req.body.ingredients:[];
  if(!stock || typeof stock!=="object" || Array.isArray(stock))return res.status(400).json({error:"stock object is required"});

  const save=db.transaction(()=>{
   const updateStock=db.prepare(`UPDATE inventory_items SET stock=?,updated_at=CURRENT_TIMESTAMP WHERE ingredient_id=?`);
   Object.entries(stock).forEach(([ingredientId,value])=>{
    const qty=Number(value);
    if(!Number.isFinite(qty)||qty<0)return;
    if(db.prepare("SELECT id FROM menu_ingredients WHERE id=?").get(ingredientId))updateStock.run(qty,ingredientId);
   });

   const updateMeta=db.prepare(`
    UPDATE inventory_items
    SET tracked=?,low_stock_level=?,unit=?,updated_at=CURRENT_TIMESTAMP
    WHERE ingredient_id=?
   `);
   ingredients.forEach(item=>{
    if(!item?.id)return;
    if(!db.prepare("SELECT id FROM menu_ingredients WHERE id=?").get(item.id))return;
    updateMeta.run(item.tracked?1:0,Math.max(0,Number(item.lowStockLevel||0)),String(item.unit||"unit"),item.id);
   });
  });

  save();
  io.emit("inventory-changed",{reason:"legacy-stock-save"});
  res.json({ok:true});
 });

 app.put("/api/inventory/legacy-state",(req,res)=>{
  const current=db.prepare("SELECT * FROM inventory_legacy_state WHERE id=1").get();
  const suppliers=Array.isArray(req.body?.suppliers)?req.body.suppliers:JSON.parse(current.suppliers_json||"[]");
  const deliveries=Array.isArray(req.body?.deliveries)?req.body.deliveries:JSON.parse(current.deliveries_json||"[]");
  const movements=Array.isArray(req.body?.movements)?req.body.movements:JSON.parse(current.movements_json||"[]");

  db.prepare(`
   UPDATE inventory_legacy_state
   SET suppliers_json=?,deliveries_json=?,movements_json=?,updated_at=CURRENT_TIMESTAMP
   WHERE id=1
  `).run(JSON.stringify(suppliers),JSON.stringify(deliveries),JSON.stringify(movements));

  io.emit("inventory-changed",{reason:"legacy-state-save"});
  res.json({ok:true});
 });
};
