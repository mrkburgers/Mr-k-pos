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

 function normalizePoint(value){
  const lat=Number(value?.lat??value?.latitude);
  const lng=Number(value?.lng??value?.lon??value?.longitude);
  if(!Number.isFinite(lat)||!Number.isFinite(lng))return null;
  if(lat<-90||lat>90||lng<-180||lng>180)return null;
  return {lat,lng};
 }

 function normalizePolygon(value){
  let raw=value;
  if(typeof raw==="string"){
   try{raw=JSON.parse(raw);}catch{return null;}
  }
  if(raw&&Array.isArray(raw.points))raw=raw.points;
  if(!Array.isArray(raw))return null;
  const points=raw.map(normalizePoint);
  if(points.some(point=>!point))return null;
  while(points.length>1){
   const first=points[0],last=points[points.length-1];
   if(first.lat!==last.lat||first.lng!==last.lng)break;
   points.pop();
  }
  if(points.length<3)return null;
  const unique=new Set(points.map(point=>`${point.lat.toFixed(8)},${point.lng.toFixed(8)}`));
  if(unique.size<3)return null;
  return points;
 }

 function parseBoundary(value){
  if(!value)return null;
  return normalizePolygon(value);
 }

 const EPS=1e-10;
 function cross(a,b,c){
  return (b.lng-a.lng)*(c.lat-a.lat)-(b.lat-a.lat)*(c.lng-a.lng);
 }
 function pointOnSegment(point,a,b){
  if(Math.abs(cross(a,b,point))>EPS)return false;
  return point.lng>=Math.min(a.lng,b.lng)-EPS&&
   point.lng<=Math.max(a.lng,b.lng)+EPS&&
   point.lat>=Math.min(a.lat,b.lat)-EPS&&
   point.lat<=Math.max(a.lat,b.lat)+EPS;
 }
 function properSegmentsCross(a,b,c,d){
  const abC=cross(a,b,c),abD=cross(a,b,d),cdA=cross(c,d,a),cdB=cross(c,d,b);
  return ((abC>EPS&&abD<-EPS)||(abC<-EPS&&abD>EPS))&&
   ((cdA>EPS&&cdB<-EPS)||(cdA<-EPS&&cdB>EPS));
 }
 function segmentsTouchOrCross(a,b,c,d){
  if(properSegmentsCross(a,b,c,d))return true;
  return pointOnSegment(c,a,b)||pointOnSegment(d,a,b)||pointOnSegment(a,c,d)||pointOnSegment(b,c,d);
 }
 function pointInPolygonState(point,polygon){
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
   if(pointOnSegment(point,polygon[j],polygon[i]))return 0;
  }
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
   const a=polygon[i],b=polygon[j];
   const crosses=((a.lat>point.lat)!==(b.lat>point.lat))&&
    (point.lng<(b.lng-a.lng)*(point.lat-a.lat)/(b.lat-a.lat)+a.lng);
   if(crosses)inside=!inside;
  }
  return inside?1:-1;
 }
 function polygonSelfIntersects(polygon){
  const n=polygon.length;
  for(let i=0;i<n;i++){
   const a=polygon[i],b=polygon[(i+1)%n];
   for(let j=i+1;j<n;j++){
    if(j===i||j===(i+1)%n||i===(j+1)%n)continue;
    const c=polygon[j],d=polygon[(j+1)%n];
    if(segmentsTouchOrCross(a,b,c,d))return true;
   }
  }
  return false;
 }
 function polygonsOverlap(a,b){
  for(let i=0;i<a.length;i++){
   const a1=a[i],a2=a[(i+1)%a.length];
   for(let j=0;j<b.length;j++){
    const b1=b[j],b2=b[(j+1)%b.length];
    if(properSegmentsCross(a1,a2,b1,b2))return true;
   }
  }
  if(a.some(point=>pointInPolygonState(point,b)===1))return true;
  if(b.some(point=>pointInPolygonState(point,a)===1))return true;
  return false;
 }
 function zoneWithBoundary(row){
  return {
   id:row.id,
   name:row.name,
   fee:Number(row.fee||0),
   active:Boolean(row.active),
   sort_order:Number(row.sort_order||0),
   boundary:parseBoundary(row.boundary_json),
   created_at:row.created_at,
   updated_at:row.updated_at
  };
 }
 function findOverlap(zoneId,polygon){
  const others=db.prepare(`
   SELECT id,name,boundary_json
   FROM delivery_zones
   WHERE id<>? AND boundary_json IS NOT NULL AND trim(boundary_json)<>''
  `).all(zoneId);
  for(const row of others){
   const other=parseBoundary(row.boundary_json);
   if(other&&polygonsOverlap(polygon,other))return {id:row.id,name:row.name};
  }
  return null;
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

 app.get("/api/delivery-zones/map",(req,res)=>{
  const rows=db.prepare(`
   SELECT id,name,fee,active,sort_order,boundary_json,created_at,updated_at
   FROM delivery_zones
   ORDER BY sort_order ASC,name ASC
  `).all().map(zoneWithBoundary);
  res.json(rows);
 });

 app.post("/api/delivery-zones/resolve",(req,res)=>{
  const point=normalizePoint(req.body||{});
  if(!point)return res.status(400).json({error:"valid latitude and longitude are required"});
  const rows=db.prepare(`
   SELECT id,name,fee,active,sort_order,boundary_json
   FROM delivery_zones
   WHERE active=1 AND boundary_json IS NOT NULL AND trim(boundary_json)<>''
   ORDER BY sort_order ASC,name ASC
  `).all();
  for(const row of rows){
   const polygon=parseBoundary(row.boundary_json);
   if(!polygon)continue;
   if(pointInPolygonState(point,polygon)>=0){
    return res.json({
     available:true,
     zone:{id:row.id,name:row.name,fee:Number(row.fee||0)}
    });
   }
  }
  res.json({available:false,zone:null});
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

 app.put("/api/delivery-zones/:id/boundary",(req,res)=>{
  const id=String(req.params.id||"");
  const current=db.prepare("SELECT id,name,fee,active,sort_order FROM delivery_zones WHERE id=?").get(id);
  if(!current)return res.status(404).json({error:"delivery zone not found"});

  if(req.body?.boundary===null){
   db.prepare("UPDATE delivery_zones SET boundary_json=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(id);
   io.emit("delivery-zones-changed",{type:"boundary-cleared",id});
   return res.json({...current,fee:Number(current.fee||0),active:Boolean(current.active),boundary:null});
  }

  const polygon=normalizePolygon(req.body?.boundary);
  if(!polygon)return res.status(400).json({error:"boundary must contain at least 3 valid map points"});
  if(polygonSelfIntersects(polygon))return res.status(400).json({error:"delivery zone boundary cannot cross itself"});

  const overlap=findOverlap(id,polygon);
  if(overlap){
   return res.status(409).json({
    error:`delivery zone overlaps ${overlap.name}`,
    overlap_zone:{id:overlap.id,name:overlap.name}
   });
  }

  const boundaryJson=JSON.stringify(polygon);
  db.prepare("UPDATE delivery_zones SET boundary_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
   .run(boundaryJson,id);
  io.emit("delivery-zones-changed",{type:"boundary-updated",id});
  res.json({...current,fee:Number(current.fee||0),active:Boolean(current.active),boundary:polygon});
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
