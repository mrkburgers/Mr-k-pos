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

  CREATE TABLE IF NOT EXISTS suppliers (
   id INTEGER PRIMARY KEY,
   name TEXT NOT NULL COLLATE NOCASE UNIQUE,
   phone TEXT NOT NULL DEFAULT '',
   active INTEGER NOT NULL DEFAULT 1,
   created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
   updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS deliveries (
   id INTEGER PRIMARY KEY,
   supplier_id INTEGER,
   supplier_name TEXT NOT NULL,
   reference TEXT,
   note TEXT,
   created_by TEXT,
   created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
   FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
  );

  CREATE TABLE IF NOT EXISTS delivery_items (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   delivery_id INTEGER NOT NULL,
   ingredient_id TEXT,
   ingredient_name TEXT NOT NULL,
   quantity REAL NOT NULL,
   stock_before REAL NOT NULL,
   stock_after REAL NOT NULL,
   FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE,
   FOREIGN KEY (ingredient_id) REFERENCES menu_ingredients(id)
  );

  CREATE INDEX IF NOT EXISTS idx_deliveries_supplier
  ON deliveries(supplier_id,id DESC);

  CREATE INDEX IF NOT EXISTS idx_delivery_items_delivery
  ON delivery_items(delivery_id,id ASC);

  DROP TABLE IF EXISTS inventory_legacy_state;
 `);

 const seedInventory=db.prepare(`
  INSERT OR IGNORE INTO inventory_items (ingredient_id)
  SELECT id FROM menu_ingredients
 `);
 seedInventory.run();

 function supplierRows(){
  return db.prepare(`
   SELECT id,name,phone,active,created_at,updated_at
   FROM suppliers
   ORDER BY name COLLATE NOCASE ASC
  `).all().map(row=>({
   id:Number(row.id),
   name:row.name,
   phone:row.phone||"",
   active:Boolean(row.active),
   createdAt:row.created_at,
   updatedAt:row.updated_at
  }));
 }

 function deliveryRows(){
  const itemStmt=db.prepare(`
   SELECT ingredient_id,ingredient_name,quantity,stock_before,stock_after
   FROM delivery_items
   WHERE delivery_id=?
   ORDER BY id ASC
  `);

  return db.prepare(`
   SELECT id,supplier_id,supplier_name,reference,note,created_by,created_at
   FROM deliveries
   ORDER BY id DESC
  `).all().map(row=>({
   id:Number(row.id),
   supplierId:row.supplier_id===null?null:Number(row.supplier_id),
   supplier:row.supplier_name,
   reference:row.reference||"",
   note:row.note||"",
   actorName:row.created_by||"",
   actorStaffId:"",
   actorRole:"",
   createdAt:row.created_at,
   items:itemStmt.all(row.id).map(item=>({
    itemId:item.ingredient_id,
    itemName:item.ingredient_name,
    qty:Number(item.quantity),
    previousStock:Number(item.stock_before),
    newStock:Number(item.stock_after)
   }))
  }));
 }

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
   low_stock:Boolean(row.tracked&&Number(row.stock)<=Number(row.low_stock_level))
  }));
 }

 app.get("/api/inventory",(req,res)=>{
  seedInventory.run();
  res.json({items:inventoryRows()});
 });

 app.get("/api/suppliers",(req,res)=>{
  res.json(supplierRows());
 });

 app.get("/api/deliveries",(req,res)=>{
  res.json(deliveryRows());
 });

 app.post("/api/suppliers",(req,res)=>{
  const name=String(req.body?.name||"").trim();
  const phone=String(req.body?.phone||"").trim();
  const requestedId=Number(req.body?.id);
  const id=Number.isSafeInteger(requestedId)&&requestedId>0?requestedId:Date.now();

  if(!name)return res.status(400).json({error:"supplier name is required"});

  try{
   db.prepare(`
    INSERT INTO suppliers(id,name,phone,active)
    VALUES(?,?,?,1)
   `).run(id,name,phone);
  }catch(error){
   if(String(error.code||"").includes("CONSTRAINT")){
    return res.status(409).json({error:"supplier name or id already exists"});
   }
   throw error;
  }

  io.emit("inventory-changed",{reason:"supplier-created",supplier_id:id});
  res.status(201).json(supplierRows().find(supplier=>supplier.id===id));
 });

 app.patch("/api/suppliers/:id",(req,res)=>{
  const id=Number(req.params.id);
  const current=db.prepare("SELECT * FROM suppliers WHERE id=?").get(id);
  if(!current)return res.status(404).json({error:"supplier not found"});

  const name=String(req.body?.name??current.name).trim();
  const phone=String(req.body?.phone??current.phone??"").trim();
  const active=typeof req.body?.active==="boolean"?req.body.active:Boolean(current.active);

  if(!name)return res.status(400).json({error:"supplier name is required"});

  try{
   db.prepare(`
    UPDATE suppliers
    SET name=?,phone=?,active=?,updated_at=CURRENT_TIMESTAMP
    WHERE id=?
   `).run(name,phone,active?1:0,id);
  }catch(error){
   if(String(error.code||"").includes("CONSTRAINT")){
    return res.status(409).json({error:"another supplier already uses this name"});
   }
   throw error;
  }

  io.emit("inventory-changed",{reason:"supplier-updated",supplier_id:id});
  res.json(supplierRows().find(supplier=>supplier.id===id));
 });

 app.delete("/api/suppliers/:id",(req,res)=>{
  const id=Number(req.params.id);
  const current=db.prepare("SELECT * FROM suppliers WHERE id=?").get(id);
  if(!current)return res.status(404).json({error:"supplier not found"});

  const used=db.prepare("SELECT 1 FROM deliveries WHERE supplier_id=? LIMIT 1").get(id);
  if(used){
   return res.status(409).json({error:"This supplier has delivery history and cannot be deleted. Deactivate it instead."});
  }

  db.prepare("DELETE FROM suppliers WHERE id=?").run(id);
  io.emit("inventory-changed",{reason:"supplier-deleted",supplier_id:id});
  res.json({ok:true,id});
 });

 app.post("/api/deliveries",(req,res)=>{
  seedInventory.run();

  const supplierId=Number(req.body?.supplier_id);
  const supplier=db.prepare("SELECT id,name FROM suppliers WHERE id=?").get(supplierId);
  if(!supplier)return res.status(400).json({error:"valid supplier is required"});

  const items=Array.isArray(req.body?.items)?req.body.items:[];
  if(!items.length)return res.status(400).json({error:"at least one delivery item is required"});

  const requestedId=Number(req.body?.id);
  const deliveryId=Number.isSafeInteger(requestedId)&&requestedId>0?requestedId:Date.now();
  const reference=String(req.body?.reference||"").trim()||null;
  const note=String(req.body?.note||"").trim()||null;
  const createdBy=String(req.body?.created_by||"").trim()||null;

  const save=db.transaction(()=>{
   if(db.prepare("SELECT id FROM deliveries WHERE id=?").get(deliveryId)){
    throw new Error("DUPLICATE_DELIVERY");
   }

   const normalized=items.map(entry=>{
    const ingredientId=String(entry?.ingredient_id||"").trim();
    const ingredient=db.prepare("SELECT id,name FROM menu_ingredients WHERE id=?").get(ingredientId);
    const qty=Number(entry?.quantity);
    if(!ingredient||!Number.isInteger(qty)||qty<=0){
     throw new Error("INVALID_DELIVERY_ITEM");
    }
    return {ingredient,qty};
   });

   db.prepare(`
    INSERT INTO deliveries(id,supplier_id,supplier_name,reference,note,created_by)
    VALUES(?,?,?,?,?,?)
   `).run(deliveryId,supplier.id,supplier.name,reference,note,createdBy);

   const addDeliveryItem=db.prepare(`
    INSERT INTO delivery_items(
     delivery_id,ingredient_id,ingredient_name,quantity,stock_before,stock_after
    ) VALUES(?,?,?,?,?,?)
   `);

   const addMovement=db.prepare(`
    INSERT INTO inventory_movements(
     ingredient_id,movement_type,quantity,stock_before,stock_after,note,created_by
    ) VALUES(?,?,?,?,?,?,?)
   `);

   normalized.forEach(({ingredient,qty})=>{
    const current=db.prepare("SELECT stock FROM inventory_items WHERE ingredient_id=?").get(ingredient.id);
    const before=Number(current?.stock||0);
    const after=before+qty;

    db.prepare(`
     UPDATE inventory_items
     SET stock=?,updated_at=CURRENT_TIMESTAMP
     WHERE ingredient_id=?
    `).run(after,ingredient.id);

    addDeliveryItem.run(deliveryId,ingredient.id,ingredient.name,qty,before,after);

    const detail=[
     `Supplier: ${supplier.name}`,
     reference?`Reference: ${reference}`:"",
     note||""
    ].filter(Boolean).join(" | ");

    addMovement.run(
     ingredient.id,
     "STOCK IN",
     qty,
     before,
     after,
     detail||null,
     createdBy
    );
   });
  });

  try{
   save();
  }catch(error){
   if(error.message==="INVALID_DELIVERY_ITEM"){
    return res.status(400).json({error:"every delivery item needs a valid ingredient and whole-number quantity"});
   }
   if(error.message==="DUPLICATE_DELIVERY"){
    return res.status(409).json({error:"delivery id already exists"});
   }
   throw error;
  }

  io.emit("inventory-changed",{reason:"delivery-created",delivery_id:deliveryId});
  res.status(201).json(deliveryRows().find(delivery=>delivery.id===deliveryId));
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
    INSERT INTO inventory_movements(
     ingredient_id,movement_type,quantity,stock_before,stock_after,note,created_by
    ) VALUES(?,?,?,?,?,?,?)
   `).run(id,movementType,amount,before,after,note,createdBy);

   return {before,after};
  });

  let result;
  try{
   result=changeStock();
  }catch(error){
   if(error.message==="INSUFFICIENT_STOCK"){
    return res.status(409).json({error:"stock cannot go below zero"});
   }
   throw error;
  }

  io.emit("inventory-changed",{ingredient_id:id});
  res.json({
   ingredient_id:id,
   stock_before:result.before,
   stock_after:result.after
  });
 });

 app.get("/api/inventory/movements",(req,res)=>{
  const rows=db.prepare(`
   SELECT
    m.id,
    m.ingredient_id,
    i.name AS ingredient_name,
    m.movement_type,
    m.quantity,
    m.stock_before,
    m.stock_after,
    m.note,
    m.created_by,
    m.created_at
   FROM inventory_movements m
   JOIN menu_ingredients i ON i.id=m.ingredient_id
   ORDER BY m.id DESC
   LIMIT 500
  `).all();

  res.json(rows);
 });
};
