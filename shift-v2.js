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
 closeShift=function closeShift(actualCash,closedBy="",closedRole=""){
  const shift=typeof getActiveShift==="function"?getActiveShift():null;
  const actual=Number(actualCash);
  const expected=shift&&typeof calculateExpectedCash==="function"
   ?Number(calculateExpectedCash(shift))
   :Number(shift?.closingCashExpected||0);
  const difference=actual-expected;

  if(!Number.isFinite(actual)){
   alert("Please enter a valid actual cash amount.");
   return false;
  }

  if(Math.abs(difference)>0.0001){
   const label=difference>0
    ?`Surplus: ${Math.abs(difference).toLocaleString()} CFA`
    :`Shortage: ${Math.abs(difference).toLocaleString()} CFA`;
   alert(
    "SHIFT CANNOT BE CLOSED\n\n"+
    `Expected Cash: ${expected.toLocaleString()} CFA\n`+
    `Actual Cash: ${actual.toLocaleString()} CFA\n`+
    `${label}\n\n`+
    "The shift must be exactly balanced before it can be closed."
   );
   return false;
  }

  const result=v2LegacyCloseShift(actualCash,closedBy,closedRole);
  if(result!==false)v2ScheduleShiftSync();
  return result;
 };
}

function v2ShiftCashMovementForm(type){
 if(typeof canManageShift==="function"&&!canManageShift(role)){
  alert(type==="in"?"Only a manager or owner can add cash.":"Only a manager or owner can remove cash.");
  return;
 }

 const isIn=type==="in";
 clearInterval(timerInterval);
 document.getElementById("root").innerHTML=`
 <div class="app">
  <button class="back" onclick="shiftManagementPageRender()">← BACK</button>
  <div class="logo">
   MR K BURGERS
   <span>${role==="owner"?"OWNER":"MANAGER"} — ${isIn?"CASH IN":"CASH OUT"}</span>
  </div>
  <div class="panel">
   <span class="badge">${isIn?"➕ CASH IN":"➖ CASH OUT"}</span>
   <h1>${isIn?"Add Cash to Shift":"Remove Cash from Shift"}</h1>
   <div class="form">
    <label>Amount (CFA)</label>
    <input id="v2ShiftMovementAmount" type="number" min="1" step="1" inputmode="numeric" placeholder="Enter amount">
    <label>Reason</label>
    <input id="v2ShiftMovementReason" type="text" maxlength="160" placeholder="Enter reason">
    <button class="primary" onclick="v2SubmitShiftCashMovement('${type}')">CONFIRM ${isIn?"CASH IN":"CASH OUT"}</button>
    <button class="secondary" onclick="shiftManagementPageRender()">CANCEL</button>
   </div>
  </div>
 </div>`;
 document.getElementById("v2ShiftMovementAmount")?.focus();
}

window.v2SubmitShiftCashMovement=function v2SubmitShiftCashMovement(type){
 const amount=Number(document.getElementById("v2ShiftMovementAmount")?.value||0);
 const reason=String(document.getElementById("v2ShiftMovementReason")?.value||"").trim();
 if(!Number.isFinite(amount)||amount<=0){
  alert("Please enter a valid amount.");
  return;
 }
 if(!reason){
  alert("Please enter a reason.");
  return;
 }
 const ok=type==="in"
  ?shiftCashIn(amount,reason)
  :shiftCashOut(amount,reason);
 if(ok)shiftManagementPageRender();
};

window.handleShiftCashIn=function handleShiftCashIn(){
 v2ShiftCashMovementForm("in");
};

window.handleShiftCashOut=function handleShiftCashOut(){
 v2ShiftCashMovementForm("out");
};

function v2EnhanceShiftHistoryFilters(){
 const input=document.getElementById("shiftHistoryDate");
 if(!input||document.getElementById("v2ShiftHistoryActions"))return;
 input.removeAttribute("onchange");
 input.onchange=null;
 const actions=document.createElement("div");
 actions.id="v2ShiftHistoryActions";
 actions.className="actions";
 actions.style.margin="10px 0 20px";
 actions.innerHTML=`
  <button class="primary" onclick="v2ApplyShiftHistoryFilter()">APPLY</button>
  <button class="secondary" onclick="v2ClearShiftHistoryFilter()">CLEAR / SHOW ALL</button>`;
 input.insertAdjacentElement("afterend",actions);
}

window.v2ApplyShiftHistoryFilter=function v2ApplyShiftHistoryFilter(){
 const value=document.getElementById("shiftHistoryDate")?.value||"";
 shiftHistoryPageRender(value);
};

window.v2ClearShiftHistoryFilter=function v2ClearShiftHistoryFilter(){
 shiftHistoryPageRender("");
};

if(typeof shiftHistoryPageRender==="function"){
 const v2LegacyShiftHistoryPageRender=shiftHistoryPageRender;
 window.shiftHistoryPageRender=function shiftHistoryPageRender(selectedDate=""){
  const result=v2LegacyShiftHistoryPageRender(selectedDate);
  v2EnhanceShiftHistoryFilters();
  return result;
 };
}

function v2ApplyDeliveryHistoryFilters(){
 const dateInput=document.getElementById("deliveryHistoryDate");
 const supplierSelect=document.getElementById("deliveryHistorySupplier");
 const panel=document.querySelector("#root .panel");
 if(!dateInput||!supplierSelect||!panel)return;
 const selectedDate=dateInput.value;
 const selectedSupplier=supplierSelect.value;
 const cards=[...panel.querySelectorAll(".order-card")];
 let visible=0;
 cards.forEach(card=>{
  const matchDate=!selectedDate||card.dataset.deliveryDate===selectedDate;
  const matchSupplier=!selectedSupplier||card.dataset.deliverySupplier===selectedSupplier;
  const show=matchDate&&matchSupplier;
  card.style.display=show?"":"none";
  if(show)visible++;
 });
 let empty=document.getElementById("deliveryHistoryNoResults");
 if(!visible){
  if(!empty){
   empty=document.createElement("p");
   empty.id="deliveryHistoryNoResults";
   empty.className="muted";
   empty.textContent="No deliveries match the selected filters.";
   panel.appendChild(empty);
  }
 }else if(empty){
  empty.remove();
 }
}

window.v2ApplyDeliveryHistoryFilter=function v2ApplyDeliveryHistoryFilter(){
 v2ApplyDeliveryHistoryFilters();
};

window.v2ClearDeliveryHistoryFilter=function v2ClearDeliveryHistoryFilter(){
 const dateInput=document.getElementById("deliveryHistoryDate");
 const supplierSelect=document.getElementById("deliveryHistorySupplier");
 if(dateInput)dateInput.value="";
 if(supplierSelect)supplierSelect.value="";
 v2ApplyDeliveryHistoryFilters();
};

function v2EnhanceDeliveryHistoryFilters(){
 const dateInput=document.getElementById("deliveryHistoryDate");
 const supplierSelect=document.getElementById("deliveryHistorySupplier");
 if(!dateInput||!supplierSelect||document.getElementById("v2DeliveryHistoryActions"))return;
 dateInput.onchange=null;
 supplierSelect.onchange=null;
 const actions=document.createElement("div");
 actions.id="v2DeliveryHistoryActions";
 actions.className="actions";
 actions.style.margin="0 0 20px";
 actions.innerHTML=`
  <button class="primary" onclick="v2ApplyDeliveryHistoryFilter()">APPLY</button>
  <button class="secondary" onclick="v2ClearDeliveryHistoryFilter()">CLEAR / SHOW ALL</button>`;
 supplierSelect.insertAdjacentElement("afterend",actions);
}

function v2BackendDate(value){
 if(!value)return null;
 const text=String(value).trim();
 const normalized=/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)
  ?text.replace(" ","T")+"Z"
  :text;
 const date=new Date(normalized);
 return Number.isNaN(date.getTime())?null:date;
}

function v2IsToday(value){
 const date=v2BackendDate(value);
 if(!date)return false;
 const now=new Date();
 return date.getFullYear()===now.getFullYear()&&
  date.getMonth()===now.getMonth()&&
  date.getDate()===now.getDate();
}

if(typeof showOrderHistory==="function"){
 const v2LegacyShowOrderHistory=showOrderHistory;
 window.showOrderHistory=async function showOrderHistory(){
  await v2LegacyShowOrderHistory();
  if(role!=="cashier")return;
  try{
   const response=await fetch("/api/orders?status=COMPLETED",{cache:"no-store"});
   if(!response.ok)return;
   const orders=await response.json();
   const todayIds=new Set(
    (Array.isArray(orders)?orders:[])
     .filter(order=>v2IsToday(order.completed_at||order.updated_at))
     .map(order=>Number(order.id))
   );
   const panel=document.querySelector("#root .panel");
   if(!panel)return;
   const cards=[...panel.querySelectorAll(".order-card")];
   let visible=0;
   cards.forEach(card=>{
    const onclick=String(card.getAttribute("onclick")||"");
    const match=onclick.match(/backendOrderHistoryDetail\((\d+)\)/);
    const id=match?Number(match[1]):null;
    const show=id!==null&&todayIds.has(id);
    card.style.display=show?"":"none";
    if(show)visible++;
   });
   if(!visible){
    panel.innerHTML='<p class="muted">No completed orders today.</p>';
   }
  }catch(error){
   console.error("Unable to limit cashier order history to today",error);
  }
 };
}

window.addEventListener("load",()=>{
 const finalDeliveryHistory=window.managerDeliveryHistory;
 if(typeof finalDeliveryHistory==="function"){
  window.managerDeliveryHistory=async function managerDeliveryHistory(...args){
   const result=await finalDeliveryHistory.apply(this,args);
   v2EnhanceDeliveryHistoryFilters();
   return result;
  };
 }
});

if(typeof socket!=="undefined"&&socket){
 socket.on("shift-changed",()=>{
  v2HydrateShiftState();
 });
}

v2HydrateShiftState();
