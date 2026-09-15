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
