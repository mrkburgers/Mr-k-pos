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
 `);

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

   db.prepare(`
    UPDATE inventory_items
    SET stock=?,updated_at=CURRENT_TIMESTAMP
    WHERE ingredient_id=?
   `).run(after,id);

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
   if(error.message==="INSUFFICIENT_STOCK"){
    return res.status(409).json({error:"stock cannot go below zero"});
   }
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
};
