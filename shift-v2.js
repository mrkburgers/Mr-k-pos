let v2ShiftSyncTimer=null;
let v2ShiftHydrating=false;

function v2ReadShiftLocal(key,fallback){
 try{
  const raw=localStorage.getItem(key);
  return raw===null?fallback:JSON.parse(raw);
 }catch{
  return fallback;
 }
}

function v2CurrentShiftPayload(){
 return {
  active:v2ReadShiftLocal("mrkActiveShift",null),
  history:v2ReadShiftLocal("mrkShiftHistory",[])
 };
}

async function v2PushShiftState(){
 if(v2ShiftHydrating)return;
 try{
  const response=await fetch("/api/shifts/state",{
   method:"PUT",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify(v2CurrentShiftPayload())
  });
  if(!response.ok){
   const data=await response.json().catch(()=>({}));
   throw new Error(data.error||"Unable to save shift state");
  }
 }catch(error){
  console.error("Unable to sync shift state",error);
 }
}

function v2ScheduleShiftSync(){
 clearTimeout(v2ShiftSyncTimer);
 v2ShiftSyncTimer=setTimeout(v2PushShiftState,60);
}

async function v2HydrateShiftState(){
 try{
  const response=await fetch("/api/shifts/state",{cache:"no-store"});
  if(!response.ok)throw new Error("Unable to load shift state");
  const backend=await response.json();
  const hasBackend=Boolean(backend?.active)||(Array.isArray(backend?.history)&&backend.history.length>0);
  const local=v2CurrentShiftPayload();
  const hasLocal=Boolean(local.active)||(Array.isArray(local.history)&&local.history.length>0);

  if(hasBackend){
   v2ShiftHydrating=true;
   if(backend.active){
    localStorage.setItem("mrkActiveShift",JSON.stringify(backend.active));
   }else{
    localStorage.removeItem("mrkActiveShift");
   }
   localStorage.setItem("mrkShiftHistory",JSON.stringify(Array.isArray(backend.history)?backend.history:[]));
   v2ShiftHydrating=false;
  }else if(hasLocal){
   await v2PushShiftState();
  }
 }catch(error){
  v2ShiftHydrating=false;
  console.error("Unable to hydrate shift state",error);
 }
}

if(typeof saveActiveShift==="function"){
 const v2LegacySaveActiveShift=saveActiveShift;
 saveActiveShift=function saveActiveShift(shift){
  const result=v2LegacySaveActiveShift(shift);
  v2ScheduleShiftSync();
  return result;
 };
}

if(typeof saveShiftHistory==="function"){
 const v2LegacySaveShiftHistory=saveShiftHistory;
 saveShiftHistory=function saveShiftHistory(history){
  const result=v2LegacySaveShiftHistory(history);
  v2ScheduleShiftSync();
  return result;
 };
}

if(typeof addShiftSale==="function"){
 const v2LegacyAddShiftSale=addShiftSale;
 addShiftSale=function addShiftSale(amount,orderId=null,paymentMethod="CASH",backendOrderId=null){
  const result=v2LegacyAddShiftSale(amount,orderId,paymentMethod);
  if(backendOrderId!==null&&backendOrderId!==undefined){
   const shift=v2ReadShiftLocal("mrkActiveShift",null);
   if(shift&&Array.isArray(shift.orders)){
    const row=[...shift.orders].reverse().find(order=>
     order.orderId===orderId&&
     String(order.paymentMethod||"CASH")===String(paymentMethod||"CASH")
    );
    if(row){
     row.backendOrderId=Number(backendOrderId);
     localStorage.setItem("mrkActiveShift",JSON.stringify(shift));
    }
   }
  }
  v2ScheduleShiftSync();
  return result;
 };
}

if(typeof openShift==="function"){
 const v2LegacyOpenShift=openShift;
 openShift=function openShift(...args){
  const result=v2LegacyOpenShift(...args);
  if(result!==false)v2ScheduleShiftSync();
  return result;
 };
}

if(typeof closeShift==="function"){
 const v2LegacyCloseShift=closeShift;
 closeShift=function closeShift(...args){
  const result=v2LegacyCloseShift(...args);
  if(result!==false)v2ScheduleShiftSync();
  return result;
 };
}

if(typeof socket!=="undefined"&&socket){
 socket.on("shift-changed",()=>{
  // Other devices will receive the normalized shift state on their next shift screen load/reload.
 });
}

v2HydrateShiftState();
