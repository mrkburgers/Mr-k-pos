const crypto=require("crypto");

function makeZoneId(name){
 const slug=String(name||"")
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g,"")
  .replace(/[^a-z0-9]+/g,"-")
  .replace(/^-+|-+$/g,"")
  .slice(0,40)||"zone";
 return `delivery-${slug}-${crypto.randomBytes(3).toString("hex")}`;
}

module.exports=function registerDeliveryZonesV2(app,io,db){
 db.exec(`
  CREATE TABLE IF NOT EXISTS delivery_zones(
   id TEXT PRIMARY KEY,
   name TEXT NOT NULL UNIQUE COLLATE NOCASE,
   fee INTEGER NOT NULL DEFAULT 0,
   active INTEGER NOT NULL DEFAULT 1,
   sort_order INTEGER NOT NULL DEFAULT 0,
   boundary_json TEXT,
   created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
   updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
 `);

 const orderColumns=db.prepare("PRAGMA table_info(orders)").all();
 if(!orderColumns.some(column=>column.name==="delivery_zone_id")){
  db.exec("ALTER TABLE orders ADD COLUMN delivery_zone_id TEXT");
 }
 if(!orderColumns.some(column=>column.name==="delivery_zone_name")){
  db.exec("ALTER TABLE orders ADD COLUMN delivery_zone_name TEXT");
 }
 if(!orderColumns.some(column=>column.name==="delivery_fee")){
  db.exec("ALTER TABLE orders ADD COLUMN delivery_fee INTEGER NOT NULL DEFAULT 0");
 }

 function attachDeliverySnapshot(req,res,next){
  if(String(req.method||"").toUpperCase()!=="POST")return next();
  if(String(req.body?.order_type||"").toUpperCase()!=="DELIVERY")return next();

  const zoneId=String(req.body?.delivery_zone_id||"").trim();
  if(!zoneId)return res.status(400).json({error:"delivery zone is required"});

  const zone=db.prepare("SELECT id,name,fee,active FROM delivery_zones WHERE id=?").get(zoneId);
  if(!zone||!zone.active)return res.status(400).json({error:"selected delivery zone is unavailable"});

  const snapshot={
   id:zone.id,
   name:zone.name,
   fee:Number(zone.fee||0)
  };

  req.body.delivery_zone_id=snapshot.id;
  req.body.delivery_zone_name=snapshot.name;
  req.body.delivery_fee=snapshot.fee;

  const originalJson=res.json.bind(res);
  res.json=function deliverySnapshotJson(payload){
   try{
    if(res.statusCode<400&&payload?.id){
     db.prepare(`
      UPDATE orders
      SET delivery_zone_id=?,delivery_zone_name=?,delivery_fee=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=?
     `).run(snapshot.id,snapshot.name,snapshot.fee,Number(payload.id));
     payload={...payload,delivery_zone_id:snapshot.id,delivery_zone_name:snapshot.name,delivery_fee:snapshot.fee};
    }
   }catch(error){
    console.error("Unable to attach delivery snapshot",error);
   }
   return originalJson(payload);
  };

  next();
 }

 app.use("/api/orders-with-inventory",attachDeliverySnapshot);
 app.use("/api/orders",attachDeliverySnapshot);

 app.get("/api/delivery-zones",(req,res)=>{
  const includeInactive=String(req.query.all||"")==="1";
  const rows=db.prepare(`
   SELECT id,name,fee,active,sort_order,boundary_json,created_at,updated_at
   FROM delivery_zones
   ${includeInactive?"":"WHERE active=1"}
   ORDER BY sort_order ASC,name ASC
  `).all().map(row=>({...row,fee:Number(row.fee||0),active:Boolean(row.active)}));
  res.json(rows);
 });

 app.post("/api/delivery-zones",(req,res)=>{
  const name=String(req.body?.name||"").trim();
  const fee=Number(req.body?.fee);
  const active=req.body?.active!==false;
  if(!name)return res.status(400).json({error:"zone name is required"});
  if(!Number.isFinite(fee)||fee<0)return res.status(400).json({error:"valid delivery fee is required"});
  const duplicate=db.prepare("SELECT id FROM delivery_zones WHERE lower(name)=lower(?)").get(name);
  if(duplicate)return res.status(409).json({error:"delivery zone name already exists"});
  const id=makeZoneId(name);
  const sortOrder=Number(db.prepare("SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM delivery_zones").get().n||1);
  db.prepare("INSERT INTO delivery_zones(id,name,fee,active,sort_order) VALUES(?,?,?,?,?)")
   .run(id,name,Math.round(fee),active?1:0,sortOrder);
  io.emit("delivery-zones-changed",{type:"created",id});
  res.status(201).json({id,name,fee:Math.round(fee),active,sort_order:sortOrder});
 });

 app.patch("/api/delivery-zones/:id",(req,res)=>{
  const id=String(req.params.id||"");
  const current=db.prepare("SELECT * FROM delivery_zones WHERE id=?").get(id);
  if(!current)return res.status(404).json({error:"delivery zone not found"});
  const name=String(req.body?.name??current.name).trim();
  const fee=Number(req.body?.fee??current.fee);
  const active=typeof req.body?.active==="boolean"?req.body.active:Boolean(current.active);
  if(!name)return res.status(400).json({error:"zone name is required"});
  if(!Number.isFinite(fee)||fee<0)return res.status(400).json({error:"valid delivery fee is required"});
  const duplicate=db.prepare("SELECT id FROM delivery_zones WHERE lower(name)=lower(?) AND id<>?").get(name,id);
  if(duplicate)return res.status(409).json({error:"delivery zone name already exists"});
  db.prepare(`UPDATE delivery_zones SET name=?,fee=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
   .run(name,Math.round(fee),active?1:0,id);
  io.emit("delivery-zones-changed",{type:"updated",id});
  res.json({id,name,fee:Math.round(fee),active});
 });

 app.delete("/api/delivery-zones/:id",(req,res)=>{
  const id=String(req.params.id||"");
  const current=db.prepare("SELECT id FROM delivery_zones WHERE id=?").get(id);
  if(!current)return res.status(404).json({error:"delivery zone not found"});
  db.prepare("DELETE FROM delivery_zones WHERE id=?").run(id);
  io.emit("delivery-zones-changed",{type:"deleted",id});
  res.json({ok:true,id});
 });
};
