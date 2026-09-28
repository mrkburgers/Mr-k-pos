let v2ExpenseSyncQueue=Promise.resolve();
let v2ExpenseSyncReady=false;

function v2ExpenseApplyState(state){
 if(!state||typeof state!=="object")return;
 expenseCategories=Array.isArray(state.categories)?state.categories:[];
 expenses=Array.isArray(state.expenses)?state.expenses:[];
 localStorage.setItem("mrkExpenseCategories",JSON.stringify(expenseCategories));
 localStorage.setItem("mrkExpenses",JSON.stringify(expenses));
 v2ExpenseSyncReady=true;
}

async function v2ExpenseFetchState(){
 const response=await fetch("/api/expenses/state",{cache:"no-store"});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.error||"Unable to load expenses");
 v2ExpenseApplyState(data);
 return data;
}

async function v2ExpenseAppendLocalSnapshot(snapshot){
 const serverState=await v2ExpenseFetchState();
 const serverIds=new Set(
  (Array.isArray(serverState.expenses)?serverState.expenses:[])
   .map(item=>String(item?.id||""))
   .filter(Boolean)
 );

 const pending=(Array.isArray(snapshot)?snapshot:[])
  .filter(item=>{
   const id=String(item?.id||"");
   return id&&!serverIds.has(id);
  })
  .reverse();

 let latestState=serverState;
 for(const expense of pending){
  const response=await fetch("/api/expenses",{
   method:"POST",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify(expense)
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||"Unable to save expense");
  latestState=data;
  v2ExpenseApplyState(latestState);
 }

 if(!pending.length)v2ExpenseApplyState(serverState);
 return latestState;
}

function v2ExpenseQueueSnapshot(snapshot){
 v2ExpenseSyncQueue=v2ExpenseSyncQueue
  .then(()=>v2ExpenseAppendLocalSnapshot(snapshot))
  .catch(error=>console.error("Expense sync failed",error));
 return v2ExpenseSyncQueue;
}

function v2ExpenseQueueCategories(categoriesSnapshot){
 v2ExpenseSyncQueue=v2ExpenseSyncQueue
  .then(async()=>{
   const response=await fetch("/api/expense-categories/state",{
    method:"PUT",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({categories:categoriesSnapshot})
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||"Unable to save expense categories");
   v2ExpenseApplyState(data);
  })
  .catch(error=>console.error("Expense category sync failed",error));
 return v2ExpenseSyncQueue;
}

const v2ExpenseLegacySaveExpenses=typeof saveExpenses==="function"?saveExpenses:null;
saveExpenses=function saveExpenses(){
 const snapshot=JSON.parse(JSON.stringify(Array.isArray(expenses)?expenses:[]));
 localStorage.setItem("mrkExpenses",JSON.stringify(snapshot));
 if(role==="owner"||role==="manager")v2ExpenseQueueSnapshot(snapshot);
};

const v2ExpenseLegacySaveCategories=typeof saveExpenseCategories==="function"?saveExpenseCategories:null;
saveExpenseCategories=function saveExpenseCategories(){
 const snapshot=JSON.parse(JSON.stringify(Array.isArray(expenseCategories)?expenseCategories:[]));
 localStorage.setItem("mrkExpenseCategories",JSON.stringify(snapshot));
 if(role==="owner"||role==="manager")v2ExpenseQueueCategories(snapshot);
};

async function v2ExpenseLoadForView(){
 await v2ExpenseSyncQueue;
 return v2ExpenseFetchState();
}

function v2ExpenseLoadFailed(error){
 console.error("Unable to load shared expenses",error);
 alert("Unable to load expenses from the restaurant server.");
}

const v2ExpenseLegacyOwnerExpenses=typeof ownerExpenses==="function"?ownerExpenses:null;
if(v2ExpenseLegacyOwnerExpenses){
 ownerExpenses=async function ownerExpenses(){
  try{
   await v2ExpenseLoadForView();
  }catch(error){
   return v2ExpenseLoadFailed(error);
  }
  return v2ExpenseLegacyOwnerExpenses();
 };
}

const v2ExpenseLegacyHistory=typeof expenseHistoryPage==="function"?expenseHistoryPage:null;
if(v2ExpenseLegacyHistory){
 expenseHistoryPage=async function expenseHistoryPage(selectedDate=""){
  try{
   await v2ExpenseLoadForView();
  }catch(error){
   return v2ExpenseLoadFailed(error);
  }
  return v2ExpenseLegacyHistory(selectedDate);
 };
}

const v2ExpenseLegacyReports=typeof expenseReportsPage==="function"?expenseReportsPage:null;
if(v2ExpenseLegacyReports){
 expenseReportsPage=async function expenseReportsPage(period="month",value=""){
  try{
   await v2ExpenseLoadForView();
  }catch(error){
   return v2ExpenseLoadFailed(error);
  }
  return v2ExpenseLegacyReports(period,value);
 };
}

if(typeof socket!=="undefined"&&socket){
 socket.on("expenses-changed",async()=>{
  if(role!=="owner"&&role!=="manager")return;
  try{
   const root=document.getElementById("root");
   const text=String(root?.textContent||"").toUpperCase();
   const historyOpen=text.includes("EXPENSE HISTORY");
   const reportsOpen=text.includes("EXPENSE REPORTS");
   const selectedDate=historyOpen
    ?String(root?.querySelector("#expenseHistoryDate")?.value||"")
    :"";

   await v2ExpenseFetchState();

   if(historyOpen&&v2ExpenseLegacyHistory){
    v2ExpenseLegacyHistory(selectedDate);
   }else if(reportsOpen&&v2ExpenseLegacyReports){
    const activeButton=[...root.querySelectorAll("button")].find(button=>
     ["DAY","WEEK","MONTH","YEAR"].includes(String(button.textContent||"").trim().toUpperCase())&&
     button.classList.contains("primary")
    );
    const period=String(activeButton?.textContent||"MONTH").trim().toLowerCase();
    const value=String(root.querySelector("#expenseReportPeriodValue")?.value||"");
    v2ExpenseLegacyReports(period,value);
   }
  }catch(error){
   console.error("Expense live refresh failed",error);
  }
 });
}
