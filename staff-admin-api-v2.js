const createSecurityAuthV2=require("./security-auth-v2");
const pinSecurityV2=require("./security-pin-v2");

module.exports=function registerStaffAdminV2(app,db){
 const ownerOnly=createSecurityAuthV2().requireRole("owner");
 const allowedNonOwnerRoles=new Set(["manager","cashier","kitchen"]);

 function publicAccount(row){
  return {
   id:Number(row.id),
   name:String(row.name||""),
   staff_id:String(row.staff_id||""),
   role:String(row.role||""),
   active:Boolean(row.active),
   created_at:row.created_at,
   updated_at:row.updated_at
  };
 }

 function getAccount(id){
  return db.prepare(`
   SELECT id,name,staff_id,role,active,created_at,updated_at
   FROM staff_accounts
   WHERE id=?
   LIMIT 1
  `).get(id);
 }

 function pinLengthForRole(role){
  return role==="owner"||role==="manager"?8:4;
 }

 function validatePin(pin,role){
  const length=pinLengthForRole(role);
  return new RegExp(`^\\d{${length}}$`).test(String(pin||""));
 }

 app.get("/api/staff-admin",ownerOnly,(req,res)=>{
  const rows=db.prepare(`
   SELECT id,name,staff_id,role,active,created_at,updated_at
   FROM staff_accounts
   ORDER BY
    CASE role
     WHEN 'owner' THEN 1
     WHEN 'manager' THEN 2
     WHEN 'cashier' THEN 3
     WHEN 'kitchen' THEN 4
     ELSE 5
    END,
    id ASC
  `).all();
  res.json(rows.map(publicAccount));
 });

 app.post("/api/staff-admin",ownerOnly,(req,res)=>{
  const name=String(req.body?.name||"").trim();
  const staffId=String(req.body?.staff_id||"").trim();
  const role=String(req.body?.role||"").trim().toLowerCase();
  const pin=String(req.body?.pin||"").trim();

  if(!name||!staffId||!allowedNonOwnerRoles.has(role)){
   return res.status(400).json({error:"Name, Staff ID and a valid staff role are required."});
  }
  if(!validatePin(pin,role)){
   const length=pinLengthForRole(role);
   return res.status(400).json({error:`${role==="manager"?"Manager":"Cashier and Kitchen"} PIN must be exactly ${length} numeric digits.`});
  }

  try{
   const result=db.prepare(`
    INSERT INTO staff_accounts(name,staff_id,pin_hash,role,active)
    VALUES(?,?,?,?,1)
   `).run(name,staffId,pinSecurityV2.hashPin(pin),role);
   const created=getAccount(result.lastInsertRowid);
   res.status(201).json(publicAccount(created));
  }catch(error){
   if(String(error?.code||"").includes("CONSTRAINT")){
    return res.status(409).json({error:"That Staff ID is already in use."});
   }
   throw error;
  }
 });

 app.patch("/api/staff-admin/:id",ownerOnly,(req,res)=>{
  const id=Number(req.params.id);
  if(!Number.isInteger(id)||id<=0){
   return res.status(400).json({error:"Invalid staff account."});
  }
  const existing=getAccount(id);
  if(!existing){
   return res.status(404).json({error:"Staff account not found."});
  }

  const name=String(req.body?.name??existing.name).trim();
  const staffId=String(req.body?.staff_id??existing.staff_id).trim();
  let role=String(req.body?.role??existing.role).trim().toLowerCase();

  if(!name||!staffId){
   return res.status(400).json({error:"Name and Staff ID are required."});
  }

  if(existing.role==="owner"){
   role="owner";
  }else if(!allowedNonOwnerRoles.has(role)){
   return res.status(400).json({error:"Invalid staff role."});
  }

  try{
   db.prepare(`
    UPDATE staff_accounts
    SET name=?,staff_id=?,role=?,updated_at=CURRENT_TIMESTAMP
    WHERE id=?
   `).run(name,staffId,role,id);
   res.json(publicAccount(getAccount(id)));
  }catch(error){
   if(String(error?.code||"").includes("CONSTRAINT")){
    return res.status(409).json({error:"That Staff ID is already in use."});
   }
   throw error;
  }
 });

 app.patch("/api/staff-admin/:id/active",ownerOnly,(req,res)=>{
  const id=Number(req.params.id);
  const active=req.body?.active;
  if(!Number.isInteger(id)||id<=0||typeof active!=="boolean"){
   return res.status(400).json({error:"A valid account and active state are required."});
  }
  const existing=getAccount(id);
  if(!existing){
   return res.status(404).json({error:"Staff account not found."});
  }
  if(existing.role==="owner"&&!active){
   return res.status(400).json({error:"The Owner account cannot be deactivated."});
  }

  db.prepare(`
   UPDATE staff_accounts
   SET active=?,updated_at=CURRENT_TIMESTAMP
   WHERE id=?
  `).run(active?1:0,id);
  res.json(publicAccount(getAccount(id)));
 });
};
