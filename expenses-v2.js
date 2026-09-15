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

/* Receipt metadata stays internal and must never appear on operational screens. */
function v2HideReceiptMetadataFromScreen(){
 document.querySelectorAll("#root .muted").forEach(element=>{
  const text=String(element.textContent||"");
  const markerIndex=text.indexOf("RECEIPT_JSON:");
  if(markerIndex<0)return;
  const cleaned=text
   .slice(0,markerIndex)
   .replace(/\s*\|\s*$/g,"")
   .trim();
  if(cleaned){
   element.textContent=cleaned;
  }else{
   element.remove();
  }
 });
}

function v2AddKitchenReceiptButtons(){
 if(role!=="kitchen")return;
 document.querySelectorAll("#root .order-card").forEach(card=>{
  if(card.querySelector(".v2-kitchen-print"))return;
  const statusButton=[...card.querySelectorAll("button")].find(button=>
   String(button.getAttribute("onclick")||"").includes("updateKitchenOrderStatus(")
  );
  if(!statusButton)return;
  const match=String(statusButton.getAttribute("onclick")||"").match(/updateKitchenOrderStatus\((\d+)/);
  if(!match)return;
  const orderId=Number(match[1]);
  if(!Number.isFinite(orderId))return;
  const actions=card.querySelector(".actions");
  if(!actions)return;
  const button=document.createElement("button");
  button.className="secondary v2-kitchen-print";
  button.textContent="PRINT RECEIPT";
  button.onclick=event=>{
   event.stopPropagation();
   if(typeof v2PrintReceipt==="function")v2PrintReceipt(orderId);
  };
  actions.appendChild(button);
 });
}

const v2ReceiptOriginalShowActiveOrders=window.showActiveOrders;
if(typeof v2ReceiptOriginalShowActiveOrders==="function"){
 window.showActiveOrders=async function showActiveOrders(...args){
  const result=await v2ReceiptOriginalShowActiveOrders.apply(this,args);
  v2HideReceiptMetadataFromScreen();
  return result;
 };
}

const v2ReceiptOriginalKitchenHome=window.kitchenHome;
if(typeof v2ReceiptOriginalKitchenHome==="function"){
 window.kitchenHome=async function kitchenHome(...args){
  const result=await v2ReceiptOriginalKitchenHome.apply(this,args);
  v2HideReceiptMetadataFromScreen();
  v2AddKitchenReceiptButtons();
  return result;
 };
}
