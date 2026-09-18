const createSecurityAuthV2=require("./security-auth-v2");

module.exports=function registerPayrollV2(app,db){
 const ownerOnly=createSecurityAuthV2().requireRole("owner");

 db.exec(`
  CREATE TABLE IF NOT EXISTS salary_periods (
   id TEXT PRIMARY KEY,
   employee_id TEXT NOT NULL,
   month TEXT NOT NULL DEFAULT '',
   status TEXT NOT NULL DEFAULT '',
   closed INTEGER NOT NULL DEFAULT 0,
   payload_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS staff_advances (
   id TEXT PRIMARY KEY,
   employee_id TEXT NOT NULL,
   status TEXT NOT NULL DEFAULT '',
   payload_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS payroll_transactions (
   id TEXT PRIMARY KEY,
   employee_id TEXT NOT NULL,
   period_id TEXT,
   advance_id TEXT,
   type TEXT NOT NULL DEFAULT '',
   date TEXT NOT NULL DEFAULT '',
   payload_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS final_settlements (
   id TEXT PRIMARY KEY,
   employee_id TEXT NOT NULL,
   status TEXT NOT NULL DEFAULT '',
   payload_json TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_salary_periods_employee
  ON salary_periods(employee_id,month);

  CREATE INDEX IF NOT EXISTS idx_staff_advances_employee
  ON staff_advances(employee_id);

  CREATE INDEX IF NOT EXISTS idx_payroll_transactions_employee
  ON payroll_transactions(employee_id);

  CREATE INDEX IF NOT EXISTS idx_payroll_transactions_period
  ON payroll_transactions(period_id);

  CREATE INDEX IF NOT EXISTS idx_final_settlements_employee
  ON final_settlements(employee_id);
 `);

 function parsePayload(value){
  try{
   const parsed=JSON.parse(String(value||"{}"));
   return parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed:{};
  }catch(error){
   return {};
  }
 }

 function fullState(){
  return {
   salaryPeriods:db.prepare("SELECT payload_json FROM salary_periods ORDER BY rowid ASC")
    .all().map(row=>parsePayload(row.payload_json)),
   staffAdvances:db.prepare("SELECT payload_json FROM staff_advances ORDER BY rowid ASC")
    .all().map(row=>parsePayload(row.payload_json)),
   payrollTransactions:db.prepare("SELECT payload_json FROM payroll_transactions ORDER BY rowid ASC")
    .all().map(row=>parsePayload(row.payload_json)),
   finalSettlements:db.prepare("SELECT payload_json FROM final_settlements ORDER BY rowid ASC")
    .all().map(row=>parsePayload(row.payload_json))
  };
 }

 function requireArray(value){
  if(!Array.isArray(value))throw new Error("INVALID_PAYROLL_STATE");
  return value;
 }

 function requireRecord(record){
  if(!record||typeof record!=="object"||Array.isArray(record)){
   throw new Error("INVALID_PAYROLL_RECORD");
  }
  const id=String(record.id||"").trim();
  const employeeId=String(record.employeeId||"").trim();
  if(!id||!employeeId)throw new Error("INVALID_PAYROLL_RECORD");
  return {id,employeeId};
 }

 function replaceState(state){
  const salaryPeriods=requireArray(state?.salaryPeriods);
  const staffAdvances=requireArray(state?.staffAdvances);
  const payrollTransactions=requireArray(state?.payrollTransactions);
  const finalSettlements=requireArray(state?.finalSettlements);

  const insertSalary=db.prepare(`
   INSERT INTO salary_periods(id,employee_id,month,status,closed,payload_json)
   VALUES(?,?,?,?,?,?)
  `);
  const insertAdvance=db.prepare(`
   INSERT INTO staff_advances(id,employee_id,status,payload_json)
   VALUES(?,?,?,?)
  `);
  const insertTransaction=db.prepare(`
   INSERT INTO payroll_transactions(
    id,employee_id,period_id,advance_id,type,date,payload_json
   ) VALUES(?,?,?,?,?,?,?)
  `);
  const insertSettlement=db.prepare(`
   INSERT INTO final_settlements(id,employee_id,status,payload_json)
   VALUES(?,?,?,?)
  `);

  db.transaction(()=>{
   db.prepare("DELETE FROM payroll_transactions").run();
   db.prepare("DELETE FROM final_settlements").run();
   db.prepare("DELETE FROM staff_advances").run();
   db.prepare("DELETE FROM salary_periods").run();

   salaryPeriods.forEach(record=>{
    const base=requireRecord(record);
    insertSalary.run(
     base.id,
     base.employeeId,
     String(record.month||""),
     String(record.status||""),
     record.closed===true?1:0,
     JSON.stringify(record)
    );
   });

   staffAdvances.forEach(record=>{
    const base=requireRecord(record);
    insertAdvance.run(
     base.id,
     base.employeeId,
     String(record.status||""),
     JSON.stringify(record)
    );
   });

   payrollTransactions.forEach(record=>{
    const base=requireRecord(record);
    insertTransaction.run(
     base.id,
     base.employeeId,
     record.periodId==null?null:String(record.periodId),
     record.advanceId==null?null:String(record.advanceId),
     String(record.type||""),
     String(record.date||""),
     JSON.stringify(record)
    );
   });

   finalSettlements.forEach(record=>{
    const base=requireRecord(record);
    insertSettlement.run(
     base.id,
     base.employeeId,
     String(record.status||""),
     JSON.stringify(record)
    );
   });
  })();
 }

 function backendIsEmpty(){
  const counts=[
   "salary_periods",
   "staff_advances",
   "payroll_transactions",
   "final_settlements"
  ].map(table=>Number(
   db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count||0
  ));
  return counts.every(count=>count===0);
 }

 function sendError(res,error){
  const code=String(error?.message||"");
  if(code==="INVALID_PAYROLL_STATE"){
   res.status(400).json({error:"Payroll state must contain four valid arrays."});
   return true;
  }
  if(code==="INVALID_PAYROLL_RECORD"){
   res.status(400).json({error:"Each payroll record requires an ID and employee ID."});
   return true;
  }
  if(String(error?.code||"").includes("CONSTRAINT")){
   res.status(409).json({error:"Payroll data contains duplicate or conflicting record IDs."});
   return true;
  }
  return false;
 }

 app.get("/api/payroll",ownerOnly,(req,res)=>{
  res.json(fullState());
 });

 app.post("/api/payroll/import-if-empty",ownerOnly,(req,res)=>{
  if(!backendIsEmpty()){
   return res.json({imported:false,state:fullState()});
  }
  try{
   replaceState(req.body||{});
   res.json({imported:true,state:fullState()});
  }catch(error){
   if(sendError(res,error))return;
   throw error;
  }
 });

 app.put("/api/payroll/state",ownerOnly,(req,res)=>{
  try{
   replaceState(req.body||{});
   res.json(fullState());
  }catch(error){
   if(sendError(res,error))return;
   throw error;
  }
 });
};
