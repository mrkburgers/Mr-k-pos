let v2PayrollReady=false;
let v2PayrollSaveQueue=Promise.resolve();

function v2PayrollSnapshot(){
 return {
  salaryPeriods:Array.isArray(salaryPeriods)?JSON.parse(JSON.stringify(salaryPeriods)):[],
  staffAdvances:Array.isArray(staffAdvances)?JSON.parse(JSON.stringify(staffAdvances)):[],
  payrollTransactions:Array.isArray(payrollTransactions)?JSON.parse(JSON.stringify(payrollTransactions)):[],
  finalSettlements:Array.isArray(finalSettlements)?JSON.parse(JSON.stringify(finalSettlements)):[]
 };
}

function v2ApplyPayrollState(state){
 const source=state&&typeof state==="object"?state:{};
 salaryPeriods=Array.isArray(source.salaryPeriods)?source.salaryPeriods:[];
 staffAdvances=Array.isArray(source.staffAdvances)?source.staffAdvances:[];
 payrollTransactions=Array.isArray(source.payrollTransactions)?source.payrollTransactions:[];
 finalSettlements=Array.isArray(source.finalSettlements)?source.finalSettlements:[];

 localStorage.setItem("mrkSalaryPeriods",JSON.stringify(salaryPeriods));
 localStorage.setItem("mrkStaffAdvances",JSON.stringify(staffAdvances));
 localStorage.setItem("mrkPayrollTransactions",JSON.stringify(payrollTransactions));
 localStorage.setItem("mrkFinalSettlements",JSON.stringify(finalSettlements));
}

async function v2InitializePayroll(){
 if(v2PayrollReady)return;
 const response=await fetch("/api/payroll/import-if-empty",{
  method:"POST",
  headers:{"Content-Type":"application/json"},
  body:JSON.stringify(v2PayrollSnapshot())
 });
 const result=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(result.error||"Unable to initialize payroll data.");
 v2ApplyPayrollState(result.state||{});
 v2PayrollReady=true;
}

async function v2FetchPayroll(){
 const response=await fetch("/api/payroll",{cache:"no-store"});
 const result=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(result.error||"Unable to load payroll data.");
 v2ApplyPayrollState(result);
 v2PayrollReady=true;
 return result;
}

function v2QueuePayrollSave(){
 const snapshot=v2PayrollSnapshot();
 v2PayrollSaveQueue=v2PayrollSaveQueue
  .then(async()=>{
   const response=await fetch("/api/payroll/state",{
    method:"PUT",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(snapshot)
   });
   const result=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(result.error||"Unable to save payroll data.");
   v2ApplyPayrollState(result);
  })
  .catch(error=>{
   console.error("Payroll sync failed",error);
  });
 return v2PayrollSaveQueue;
}

saveSalaryPeriods=function saveSalaryPeriods(){
 localStorage.setItem("mrkSalaryPeriods",JSON.stringify(salaryPeriods));
 if(v2PayrollReady)v2QueuePayrollSave();
};

saveStaffAdvances=function saveStaffAdvances(){
 localStorage.setItem("mrkStaffAdvances",JSON.stringify(staffAdvances));
 if(v2PayrollReady)v2QueuePayrollSave();
};

savePayrollTransactions=function savePayrollTransactions(){
 localStorage.setItem("mrkPayrollTransactions",JSON.stringify(payrollTransactions));
 if(v2PayrollReady)v2QueuePayrollSave();
};

saveFinalSettlements=function saveFinalSettlements(){
 localStorage.setItem("mrkFinalSettlements",JSON.stringify(finalSettlements));
 if(v2PayrollReady)v2QueuePayrollSave();
};

const v2OriginalSalariesAdvancesForPayroll=window.ownerSalariesAdvances;
if(typeof v2OriginalSalariesAdvancesForPayroll==="function"){
 window.ownerSalariesAdvances=async function ownerSalariesAdvances(){
  if(role==="owner"){
   try{
    if(!v2PayrollReady)await v2InitializePayroll();
    else await v2FetchPayroll();
   }catch(error){
    alert(error.message||"Unable to load payroll data.");
    return;
   }
  }
  return v2OriginalSalariesAdvancesForPayroll.apply(this,arguments);
 };
}
