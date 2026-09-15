let v2ExpensesSaveQueue=Promise.resolve();
let v2ExpensesReady=false;

function v2ExpensesSnapshot(){
 return {
  categories:JSON.parse(JSON.stringify(Array.isArray(expenseCategories)?expenseCategories:[])),
  expenses:JSON.parse(JSON.stringify(Array.isArray(expenses)?expenses:[]))
 };
}

function v2ApplyExpenses(state){
 if(!state||typeof state!=="object")return;
 expenseCategories=Array.isArray(state.categories)?state.categories:[];
 expenses=Array.isArray(state.expenses)?state.expenses:[];
 localStorage.setItem("mrkExpenseCategories",JSON.stringify(expenseCategories));
 localStorage.setItem("mrkExpenses",JSON.stringify(expenses));
}

async function v2FetchExpenses(){
 const response=await fetch("/api/expenses/state",{cache:"no-store"});
 if(!response.ok)throw new Error("Unable to load expenses");
 const state=await response.json();
 v2ApplyExpenses(state);
 return state;
}

async function v2InitializeExpenses(){
 const localState=v2ExpensesSnapshot();
 const response=await fetch("/api/expenses/import-if-empty",{
  method:"POST",
  headers:{"Content-Type":"application/json"},
  body:JSON.stringify(localState)
 });
 if(!response.ok)throw new Error("Unable to initialize expenses");
 const result=await response.json();
 v2ApplyExpenses(result.state||{});
 v2ExpensesReady=true;
}

function v2QueueExpensesSave(){
 const snapshot=v2ExpensesSnapshot();
 v2ExpensesSaveQueue=v2ExpensesSaveQueue
  .then(async()=>{
   const response=await fetch("/api/expenses/state",{
    method:"PUT",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(snapshot)
   });
   if(!response.ok)throw new Error("Unable to save expenses");
   const state=await response.json();
   v2ApplyExpenses(state);
  })
  .catch(error=>console.error("Expense sync failed",error));
 return v2ExpensesSaveQueue;
}

saveExpenses=function saveExpenses(){
 localStorage.setItem("mrkExpenses",JSON.stringify(expenses));
 if(v2ExpensesReady)v2QueueExpensesSave();
};

saveExpenseCategories=function saveExpenseCategories(){
 localStorage.setItem("mrkExpenseCategories",JSON.stringify(expenseCategories));
 if(v2ExpensesReady)v2QueueExpensesSave();
};

if(typeof socket!=="undefined"&&socket){
 socket.on("expenses-changed",()=>{
  if(v2ExpensesReady){
   v2FetchExpenses().catch(error=>console.error("Expense refresh failed",error));
  }
 });
}

v2InitializeExpenses().catch(error=>{
 console.error("Expense initialization failed",error);
 v2ExpensesReady=true;
});
