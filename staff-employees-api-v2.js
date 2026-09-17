const createSecurityAuthV2=require("./security-auth-v2");

module.exports=function registerStaffEmployeesV2(app,db){
 const ownerOnly=createSecurityAuthV2().requireRole("owner");

 db.exec(`
  CREATE TABLE IF NOT EXISTS staff_employees (
   id TEXT PRIMARY KEY,
   name TEXT NOT NULL,
   position TEXT NOT NULL DEFAULT '',
   monthly_salary REAL NOT NULL DEFAULT 0,
   start_date TEXT NOT NULL DEFAULT '',
   active INTEGER NOT NULL DEFAULT 1,
   staff_account_id INTEGER UNIQUE,
   created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
   updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
   FOREIGN KEY(staff_account_id) REFERENCES staff_accounts(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_staff_employees_active
  ON staff_employees(active);
 `);

 function accountForId(id){
  if(id===null||id===undefined||id==="")return null;
  return db.prepare(`
   SELECT id,staff_id,role
   FROM staff_accounts
   WHERE id=?
   LIMIT 1
  `).get(Number(id));
 }

 function accountForStaffId(staffId){
  const value=String(staffId||"").trim();
  if(!value)return null;
  return db.prepare(`
   SELECT id,staff_id,role
   FROM staff_accounts
   WHERE staff_id=? COLLATE NOCASE
   LIMIT 1
  `).get(value);
 }

 function resolveAccountId(employee){
  const direct=accountForId(employee?.staffAccountId??employee?.staff_account_id);
  const account=direct||accountForStaffId(employee?.posStaffId??employee?.pos_staff_id);
  if(!account)return null;
  if(account.role==="owner"){
   throw new Error("OWNER_ACCOUNT_LINK_NOT_ALLOWED");
  }
  return Number(account.id);
 }

 function mapRow(row){
  return {
   id:String(row.id),
   name:String(row.name||""),
   position:String(row.position||""),
   salary:Number(row.monthly_salary||0),
   startDate:String(row.start_date||""),
   active:Boolean(row.active),
   staffAccountId:row.staff_account_id===null?null:Number(row.staff_account_id),
   posStaffId:row.pos_staff_id?String(row.pos_staff_id):null,
   createdAt:row.created_at,
   updatedAt:row.updated_at
  };
 }

 function fullState(){
  return db.prepare(`
   SELECT
    e.id,
    e.name,
    e.position,
    e.monthly_salary,
    e.start_date,
    e.active,
    e.staff_account_id,
    e.created_at,
    e.updated_at,
    a.staff_id AS pos_staff_id
   FROM staff_employees e
   LEFT JOIN staff_accounts a ON a.id=e.staff_account_id
   ORDER BY e.active DESC,e.name COLLATE NOCASE ASC,e.id ASC
  `).all().map(mapRow);
 }

 function normalizeEmployee(employee){
  const id=String(employee?.id||"").trim();
  const name=String(employee?.name||"").trim();
  const position=String(employee?.position||"").trim();
  const salary=Number(employee?.salary??employee?.monthly_salary??0);
  const startDate=String(employee?.startDate??employee?.start_date??"").trim();
  const active=employee?.active!==false;

  if(!id||!name||!position||!startDate||!Number.isFinite(salary)||salary<0){
   throw new Error("INVALID_EMPLOYEE");
  }

  return {
   id,
   name,
   position,
   salary,
   startDate,
   active,
   staffAccountId:resolveAccountId(employee)
  };
 }

 function replaceState(employees){
  if(!Array.isArray(employees))throw new Error("INVALID_EMPLOYEE_STATE");
  const normalized=employees.map(normalizeEmployee);
  const seenIds=new Set();
  const seenAccounts=new Set();
  normalized.forEach(employee=>{
   if(seenIds.has(employee.id))throw new Error("DUPLICATE_EMPLOYEE_ID");
   seenIds.add(employee.id);
   if(employee.staffAccountId!==null){
    if(seenAccounts.has(employee.staffAccountId))throw new Error("DUPLICATE_ACCOUNT_LINK");
    seenAccounts.add(employee.staffAccountId);
   }
  });

  const upsert=db.prepare(`
   INSERT INTO staff_employees(
    id,name,position,monthly_salary,start_date,active,staff_account_id
   ) VALUES(?,?,?,?,?,?,?)
   ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    position=excluded.position,
    monthly_salary=excluded.monthly_salary,
    start_date=excluded.start_date,
    active=excluded.active,
    staff_account_id=excluded.staff_account_id,
    updated_at=CURRENT_TIMESTAMP
  `);

  db.transaction(()=>{
   normalized.forEach(employee=>{
    upsert.run(
     employee.id,
     employee.name,
     employee.position,
     employee.salary,
     employee.startDate,
     employee.active?1:0,
     employee.staffAccountId
    );
   });

   if(normalized.length){
    const placeholders=normalized.map(()=>"?").join(",");
    db.prepare(`DELETE FROM staff_employees WHERE id NOT IN (${placeholders})`)
     .run(...normalized.map(employee=>employee.id));
   }else{
    db.prepare("DELETE FROM staff_employees").run();
   }
  })();
 }

 function sendKnownError(res,error){
  const code=String(error?.message||"");
  if(code==="INVALID_EMPLOYEE"||code==="INVALID_EMPLOYEE_STATE"){
   res.status(400).json({error:"Each employee requires a name, position, start date and valid salary."});
   return true;
  }
  if(code==="OWNER_ACCOUNT_LINK_NOT_ALLOWED"){
   res.status(400).json({error:"The Owner login account cannot be linked to an employee record."});
   return true;
  }
  if(code==="DUPLICATE_EMPLOYEE_ID"){
   res.status(400).json({error:"Duplicate employee record detected."});
   return true;
  }
  if(code==="DUPLICATE_ACCOUNT_LINK"){
   res.status(400).json({error:"A POS account can only be linked to one employee."});
   return true;
  }
  if(String(error?.code||"").includes("CONSTRAINT")){
   res.status(409).json({error:"Employee data conflicts with an existing record or POS account link."});
   return true;
  }
  return false;
 }

 app.get("/api/staff-employees",ownerOnly,(req,res)=>{
  res.json(fullState());
 });

 app.post("/api/staff-employees/import-if-empty",ownerOnly,(req,res)=>{
  const count=Number(db.prepare("SELECT COUNT(*) AS count FROM staff_employees").get().count||0);
  if(count>0){
   return res.json({imported:false,state:fullState()});
  }
  try{
   replaceState(Array.isArray(req.body?.employees)?req.body.employees:[]);
   res.json({imported:true,state:fullState()});
  }catch(error){
   if(sendKnownError(res,error))return;
   throw error;
  }
 });

 app.put("/api/staff-employees/state",ownerOnly,(req,res)=>{
  try{
   replaceState(Array.isArray(req.body?.employees)?req.body.employees:[]);
   res.json(fullState());
  }catch(error){
   if(sendKnownError(res,error))return;
   throw error;
  }
 });
};
