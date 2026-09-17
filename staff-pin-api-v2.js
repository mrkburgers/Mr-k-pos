const createSecurityAuthV2=require("./security-auth-v2");
const pinSecurityV2=require("./security-pin-v2");

module.exports=function registerStaffPinV2(app,db){
 const ownerOnly=createSecurityAuthV2().requireRole("owner");

 app.patch("/api/staff/:id/pin",ownerOnly,(req,res)=>{
  const accountId=Number(req.params.id);
  const pin=String(req.body?.pin??"").trim();

  if(!Number.isInteger(accountId)||accountId<=0){
   return res.status(400).json({error:"Invalid staff account."});
  }

  const account=db.prepare(`
   SELECT id,name,staff_id,role,active
   FROM staff_accounts
   WHERE id=?
   LIMIT 1
  `).get(accountId);

  if(!account){
   return res.status(404).json({error:"Staff account not found."});
  }

  const requiredLength=(account.role==="owner"||account.role==="manager")?8:4;
  const validPattern=new RegExp(`^\\d{${requiredLength}}$`);

  if(!validPattern.test(pin)){
   return res.status(400).json({
    error:`${account.role==="owner"||account.role==="manager"?"Owner and Manager":"Cashier and Kitchen"} PIN must be exactly ${requiredLength} numeric digits.`
   });
  }

  const pinHash=pinSecurityV2.hashPin(pin);
  db.prepare(`
   UPDATE staff_accounts
   SET pin_hash=?,updated_at=CURRENT_TIMESTAMP
   WHERE id=?
  `).run(pinHash,account.id);

  res.json({
   id:account.id,
   name:account.name,
   staff_id:account.staff_id,
   role:account.role,
   active:Boolean(account.active),
   pin_updated:true
  });
 });
};
