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

 const seedInventory=db.prepare(`
  INSERT OR IGNORE INTO inventory_items (ingredient_id)
  SELECT id FROM menu_ingredients
 `);
 seedInventory.run();

 function safeParse(value){
  try{return JSON.parse(value||"[]");}catch{return [];}
 }

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

 function mirrorSuppliersToLegacy(){
  db.prepare(`
   UPDATE inventory_legacy_state
   SET suppliers_json=?,updated_at=CURRENT_TIMESTAMP
   WHERE id=1
  `).run(JSON.stringify(supplierRows()));
 }

 function importSuppliersIfEmpty(candidateSuppliers){
  if(db.prepare("SELECT COUNT(*) AS count FROM suppliers").get().count>0)return false;
  if(!Array.isArray(candidateSuppliers)||!candidateSuppliers.length)return false;

  const insert=db.prepare(`
   INSERT OR IGNORE INTO suppliers(id,name,phone,active,created_at,updated_at)
   VALUES(?,?,?,?,?,?)
  `);
  const importRows=db.transaction(rows=>{
   rows.forEach((supplier,index)=>{
    const name=String(supplier?.name||"").trim();
    if(!name)return;
    const parsedId=Number(supplier?.id);
    const id=Number.isSafeInteger(parsedId)&&parsedId>0?parsedId:Date.now()+index;
    const phone=String(supplier?.phone||"").trim();
    const active=supplier?.active!==false;
    const createdAt=Number(supplier?.createdAt)>0
     ?new Date(Number(supplier.createdAt)).toISOString()
     :new Date().toISOString();
    const updatedAt=Number(supplier?.updatedAt)>0
     ?new Date(Number(supplier.updatedAt)).toISOString()
     :createdAt;
    insert.run(id,name,phone,active?1:0,createdAt,updatedAt);
   });
  });
  importRows(candidateSuppliers);
  mirrorSuppliersToLegacy();
  return true;
 }

 function syncSuppliersFromLegacy(candidateSuppliers,deliveries){
  if(!Array.isArray(candidateSuppliers))return;
  const normalizedDeliveries=Array.isArray(deliveries)?deliveries:[];
  const upsert=db.prepare(`
   INSERT INTO suppliers(id,name,phone,active,created_at,updated_at)
   VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)
   ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    phone=excluded.phone,
    active=excluded.active,
    updated_at=CURRENT_TIMESTAMP
  `);
  const remove=db.prepare("DELETE FROM suppliers WHERE id=?");

  const sync=db.transaction(()=>{
   const incomingIds=new Set();
   candidateSuppliers.forEach((supplier,index)=>{
    const name=String(supplier?.name||"").trim();
    if(!name)return;
    const parsedId=Number(supplier?.id);
    const id=Number.isSafeInteger(parsedId)&&parsedId>0?parsedId:Date.now()+index;
    incomingIds.add(id);
    const phone=String(supplier?.phone||"").trim();
    const active=supplier?.active!==false;
    const createdAt=Number(supplier?.createdAt)>0
     ?new Date(Number(supplier.createdAt)).toISOString()
     :new Date().toISOString();
    upsert.run(id,name,phone,active?1:0,createdAt);
   });

   db.prepare("SELECT id,name FROM suppliers").all().forEach(existing=>{
    if(incomingIds.has(Number(existing.id)))return;
    const used=normalizedDeliveries.some(delivery=>
     (delivery?.supplierId!==undefined&&String(delivery.supplierId)===String(existing.id)) ||
     String(delivery?.supplier||"").toLowerCase()===String(existing.name||"").toLowerCase()
    );
    if(!used)remove.run(existing.id);
   });
  });

  sync();
  mirrorSuppliersToLegacy();
 }

 const legacyAtStartup=db.prepare("SELECT suppliers_json FROM inventory_legacy_state WHERE id=1").get();
 importSuppliersIfEmpty(safeParse(legacyAtStartup?.suppliers_json));

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

 app.get("/api/suppliers",(req,res)=>{
  res.json(supplierRows());
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

  mirrorSuppliersToLegacy();
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

  mirrorSuppliersToLegacy();
  io.emit("inventory-changed",{reason:"supplier-updated",supplier_id:id});
  res.json(supplierRows().find(supplier=>supplier.id===id));
 });

 app.delete("/api/suppliers/:id",(req,res)=>{
  const id=Number(req.params.id);
  const current=db.prepare("SELECT * FROM suppliers WHERE id=?").get(id);
  if(!current)return res.status(404).json({error:"supplier not found"});

  const state=db.prepare("SELECT deliveries_json FROM inventory_legacy_state WHERE id=1").get();
  const deliveries=safeParse(state?.deliveries_json);
  const used=Array.isArray(deliveries)&&deliveries.some(delivery=>
   (delivery?.supplierId!==undefined&&String(delivery.supplierId)===String(id)) ||
   String(delivery?.supplier||"").toLowerCase()===String(current.name||"").toLowerCase()
  );
  if(used){
   return res.status(409).json({error:"This supplier has delivery history and cannot be deleted. Deactivate it instead."});
  }

  db.prepare("DELETE FROM suppliers WHERE id=?").run(id);
  mirrorSuppliersToLegacy();
  io.emit("inventory-changed",{reason:"supplier-deleted",supplier_id:id});
  res.json({ok:true,id});
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
  const state=db.prepare(`SELECT deliveries_json,movements_json FROM inventory_legacy_state WHERE id=1`).get();
  res.json({
   suppliers:supplierRows(),
   deliveries:safeParse(state?.deliveries_json),
   movements:safeParse(state?.movements_json)
  });
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
  const deliveries=Array.isArray(req.body?.deliveries)?req.body.deliveries:safeParse(current.deliveries_json);
  const movements=Array.isArray(req.body?.movements)?req.body.movements:safeParse(current.movements_json);

  if(Array.isArray(req.body?.suppliers)){
   try{
    syncSuppliersFromLegacy(req.body.suppliers,deliveries);
   }catch(error){
    if(String(error.code||"").includes("CONSTRAINT")){
     return res.status(409).json({error:"supplier name or id already exists"});
    }
    throw error;
   }
  }

  db.prepare(`
   UPDATE inventory_legacy_state
   SET suppliers_json=?,deliveries_json=?,movements_json=?,updated_at=CURRENT_TIMESTAMP
   WHERE id=1
  `).run(JSON.stringify(supplierRows()),JSON.stringify(deliveries),JSON.stringify(movements));

  io.emit("inventory-changed",{reason:"legacy-state-save"});
  res.json({ok:true});
 });
};
