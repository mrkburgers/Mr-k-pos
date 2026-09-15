let v2OwnerAccountsSaveQueue=Promise.resolve();
let v2OwnerAccountsReady=false;

function v2OwnerAccountsSnapshot(){
 return {
  cash:JSON.parse(JSON.stringify(ownerCashAccount||{balance:0,transactions:[]})),
  card:JSON.parse(JSON.stringify(ownerCardAccount||{balance:0,transactions:[],openingBalanceSet:false})),
  mobileMoney:JSON.parse(JSON.stringify(ownerMobileMoneyAccount||{balance:0,transactions:[],openingBalanceSet:false}))
 };
}

function v2ApplyOwnerAccounts(state){
 if(!state||typeof state!=="object")return;
 ownerCashAccount=state.cash&&typeof state.cash==="object"
  ?state.cash
  :{balance:0,transactions:[]};
 ownerCardAccount=state.card&&typeof state.card==="object"
  ?state.card
  :{balance:0,transactions:[],openingBalanceSet:false};
 ownerMobileMoneyAccount=state.mobileMoney&&typeof state.mobileMoney==="object"
  ?state.mobileMoney
  :{balance:0,transactions:[],openingBalanceSet:false};

 localStorage.setItem("mrkOwnerCashAccount",JSON.stringify(ownerCashAccount));
 localStorage.setItem("mrkOwnerCardAccount",JSON.stringify(ownerCardAccount));
 localStorage.setItem("mrkOwnerMobileMoneyAccount",JSON.stringify(ownerMobileMoneyAccount));
}

async function v2FetchOwnerAccounts(){
 const response=await fetch("/api/owner-accounts",{cache:"no-store"});
 if(!response.ok)throw new Error("Unable to load owner accounts");
 const state=await response.json();
 v2ApplyOwnerAccounts(state);
 return state;
}

async function v2InitializeOwnerAccounts(){
 const localState=v2OwnerAccountsSnapshot();
 const response=await fetch("/api/owner-accounts/import-if-empty",{
  method:"POST",
  headers:{"Content-Type":"application/json"},
  body:JSON.stringify(localState)
 });
 if(!response.ok)throw new Error("Unable to initialize owner accounts");
 const result=await response.json();
 v2ApplyOwnerAccounts(result.state||{});
 v2OwnerAccountsReady=true;
}

function v2QueueOwnerAccountsSave(){
 const snapshot=v2OwnerAccountsSnapshot();
 v2OwnerAccountsSaveQueue=v2OwnerAccountsSaveQueue
  .then(async()=>{
   const response=await fetch("/api/owner-accounts/state",{
    method:"PUT",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(snapshot)
   });
   if(!response.ok)throw new Error("Unable to save owner accounts");
   const state=await response.json();
   v2ApplyOwnerAccounts(state);
  })
  .catch(error=>{
   console.error("Owner account sync failed",error);
  });
 return v2OwnerAccountsSaveQueue;
}

saveOwnerCashAccount=function saveOwnerCashAccount(){
 localStorage.setItem("mrkOwnerCashAccount",JSON.stringify(ownerCashAccount));
 if(v2OwnerAccountsReady)v2QueueOwnerAccountsSave();
};

saveOwnerCardAccount=function saveOwnerCardAccount(){
 localStorage.setItem("mrkOwnerCardAccount",JSON.stringify(ownerCardAccount));
 if(v2OwnerAccountsReady)v2QueueOwnerAccountsSave();
};

saveOwnerMobileMoneyAccount=function saveOwnerMobileMoneyAccount(){
 localStorage.setItem("mrkOwnerMobileMoneyAccount",JSON.stringify(ownerMobileMoneyAccount));
 if(v2OwnerAccountsReady)v2QueueOwnerAccountsSave();
};

function v2CashRangeBoundary(value,endOfRange=false){
 if(!value)return null;
 const parts=String(value).split("-").map(Number);
 if(parts.length!==3||parts.some(part=>!Number.isFinite(part)))return null;
 const [year,month,day]=parts;
 return endOfRange
  ?new Date(year,month-1,day+1).getTime()
  :new Date(year,month-1,day).getTime();
}

window.ownerCashHistoryPage=function ownerCashHistoryPage(fromDate="",toDate=""){
 if(role!=="owner"){
  alert("Only the owner can view the cash account.");
  ownerHome();
  return;
 }

 const transactions=Array.isArray(ownerCashAccount.transactions)
  ?ownerCashAccount.transactions
  :[];
 const fromMs=v2CashRangeBoundary(fromDate,false);
 const toExclusiveMs=v2CashRangeBoundary(toDate,true);

 if(fromDate&&toDate&&fromMs!==null&&toExclusiveMs!==null&&fromMs>=toExclusiveMs){
  alert("The FROM date must be earlier than or the same as the TO date.");
  return;
 }

 const filtered=transactions.filter(transaction=>{
  const createdAt=Number(transaction.createdAt);
  if(!Number.isFinite(createdAt))return false;
  if(fromMs!==null&&createdAt<fromMs)return false;
  if(toExclusiveMs!==null&&createdAt>=toExclusiveMs)return false;
  return true;
 });

 const rows=filtered.map(t=>{
  const time=new Date(t.createdAt).toLocaleString();
  const sign=t.type==="IN"?"+":"-";
  const typeLabel=t.source==="TRANSFER"
   ?"TRANSFER → CASH"
   :t.type==="IN"
    ?"CASH IN"
    :"CASH OUT";
  return `
   <div class="summary" style="margin-bottom:12px">
    <div class="info-row">
     <span>${time}</span>
     <strong>${sign}${Number(t.amount||0).toLocaleString()} CFA</strong>
    </div>
    <div class="info-row">
     <span>Type</span>
     <strong>${typeLabel}</strong>
    </div>
    <div class="info-row">
     <span>Description</span>
     <strong>${t.description||"-"}</strong>
    </div>
    <div class="info-row">
     <span>Source</span>
     <strong>${t.source||"-"}</strong>
    </div>
    ${t.reference?`
    <div class="info-row">
     <span>Reference</span>
     <strong>${t.reference}</strong>
    </div>`:""}
    <div class="info-row">
     <span>Actor</span>
     <strong>${t.createdBy||"-"}</strong>
    </div>
    <div class="info-row">
     <span>Balance After</span>
     <strong>${Number(t.balanceAfter||0).toLocaleString()} CFA</strong>
    </div>
   </div>`;
 }).join("");

 clearInterval(timerInterval);
 document.getElementById("root").innerHTML=`
 <div class="app">
  <button class="back" onclick="ownerCashAccountPage()">← BACK</button>
  <div class="logo">
   MR K BURGERS
   <span>OWNER — CASH HISTORY</span>
  </div>
  <div class="panel">
   <span class="badge">📋 TRANSACTION HISTORY</span>
   <h1>Cash Account History</h1>
   <div class="summary" style="margin-bottom:20px">
    <div class="info-row">
     <span>Current Balance</span>
     <strong>${Number(ownerCashAccount.balance||0).toLocaleString()} CFA</strong>
    </div>
   </div>
   <div class="form" style="margin-bottom:20px;max-width:none">
    <label>FROM</label>
    <input id="ownerCashHistoryFrom" type="date" value="${fromDate}">
    <label>TO</label>
    <input id="ownerCashHistoryTo" type="date" value="${toDate}">
    <div class="actions" style="margin-top:0">
     <button class="primary" onclick="ownerCashHistoryPage(document.getElementById('ownerCashHistoryFrom').value,document.getElementById('ownerCashHistoryTo').value)">APPLY</button>
     <button class="secondary" onclick="ownerCashHistoryPage('','')">CLEAR / SHOW ALL</button>
    </div>
   </div>
   ${rows||`<p class="muted">${fromDate||toDate?"No cash account transactions match the selected date range.":"No cash account transactions yet."}</p>`}
  </div>
 </div>`;
};

if(typeof socket!=="undefined"&&socket){
 socket.on("owner-accounts-changed",()=>{
  if(v2OwnerAccountsReady){
   v2FetchOwnerAccounts().catch(error=>console.error("Owner account refresh failed",error));
  }
 });
}

v2InitializeOwnerAccounts().catch(error=>{
 console.error("Owner account initialization failed",error);
 v2OwnerAccountsReady=true;
});
