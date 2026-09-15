let v2BackendStaff=[];

async function loadV2BackendStaff(){
 try{
  const response=await fetch("/api/staff");
  if(!response.ok){
   throw new Error("Unable to load staff accounts");
  }
  v2BackendStaff=await response.json();
 }catch(error){
  v2BackendStaff=[];
 }
}

window.loginScreen=async function loginScreen(){
 await loadV2BackendStaff();

 const activeAccounts=v2BackendStaff.filter(account=>account.active);

 document.getElementById("root").innerHTML=`
 <div class="login">
  <div class="loginbox">
   <div class="logo">MR K BURGERS<span>POS SYSTEM</span></div>

   <div class="form" style="margin-top:30px">
    <label>Staff ID</label>
    <input id="user" placeholder="Staff ID">

    <label>PIN</label>
    <input id="pin" type="password" placeholder="PIN">

    <button class="primary" onclick="login()">LOGIN</button>
   </div>

   <p class="muted" style="margin-top:20px">
    ${
     activeAccounts.length
     ?activeAccounts.map(account=>
       `${esc(account.name)}: ${esc(account.staff_id)}`
      ).join("<br>")
     :"Unable to load staff accounts from the restaurant server."
    }
   </p>
  </div>
 </div>`;
};

window.login=async function login(){
 const u=document
  .getElementById("user")
  .value.trim();

 const p=document
  .getElementById("pin")
  .value.trim();

 if(!u || !p){
  alert("Enter Staff ID and PIN.");
  return;
 }

 try{
  const response=await fetch("/api/login",{
   method:"POST",
   headers:{
    "Content-Type":"application/json"
   },
   body:JSON.stringify({
    staff_id:u,
    pin:p
   })
  });

  const result=await response.json();

  if(!response.ok){
   alert(result.error || "Invalid Staff ID or PIN.");
   return;
  }

  loggedIn=true;
  role=result.role;
  currentStaffName=result.name;
  currentStaffId=result.staff_id;

  if(role==="owner"){
   getActiveShift();
   getShiftHistory();
   showStorageIntegrityWarning();
   ownerHome();
   return;
  }

  if(role==="manager"){
   managerHome();
   return;
  }

  if(role==="kitchen"){
   kitchenHome();
   return;
  }

  if(role==="cashier"){
   home();
   return;
  }

  alert("Invalid staff role.");

 }catch(error){
  alert("Unable to connect to the restaurant server.");
 }
};

function v2ActorPayload(){
 return {
  actor_name:String(currentStaffName||"").trim(),
  actor_staff_id:String(currentStaffId||"").trim(),
  actor_role:String(role||"").trim()
 };
}

const v2NativeFetch=window.fetch.bind(window);
window.fetch=async function v2AuditedFetch(input,options={}){
 const url=typeof input==="string"?input:String(input?.url||"");
 const method=String(options?.method||"GET").toUpperCase();
 const match=url.match(/^\/api\/orders\/(\d+)\/status(?:\?|$)/);
 if(match&&method==="PATCH"){
  let body={};
  try{body=options.body?JSON.parse(options.body):{};}catch{}
  body={...body,...v2ActorPayload()};
  if(body.status==="ACCEPTED"){
   const pending=typeof v2PendingCheckout!=="undefined"?v2PendingCheckout:null;
   await v2NativeFetch(`/api/orders/${match[1]}/initialize`,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
     customer_address:pending?.customer?.address||"",
     table_number:pending?.customer?.table||"",
     ...v2ActorPayload()
    })
   }).catch(()=>{});
  }
  return v2NativeFetch(input,{...options,body:JSON.stringify(body)});
 }
 return v2NativeFetch(input,options);
};

async function v2FetchOrderDetails(id){
 const response=await fetch(`/api/order-details/${id}`,{cache:"no-store"});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.error||"Unable to load order details");
 return data;
}

function v2OrderBackAction(){
 if(role==="cashier")return "showActiveOrders()";
 if(role==="kitchen")return "kitchenHome()";
 if(role==="owner"||role==="manager")return "ownerOrders()";
 return "render()";
}

function v2OrderStatusClass(status){
 if(status==="READY")return "ready";
 if(status==="COMPLETED")return "completed";
 return "";
}

function v2OrderTimelineTime(value){
 if(!value)return "";
 const text=String(value);
 const d=new Date(text.includes("T")?text:text.replace(" ","T")+"Z");
 return Number.isNaN(d.getTime())?text:d.toLocaleString();
}

function v2OrderTimerHtml(order){
 const label=["READY","COMPLETED"].includes(order.status)?"Preparation Time":"Live Timer";
 return `<div class="info-row"><span>${label}</span><strong class="timer" data-order-created-at="${esc(order.created_at||"")}" data-order-ready-at="${esc(order.ready_at||"")}">${v2FormatOrderDuration(v2OrderDuration(order))}</strong></div>`;
}

window.v2OrderDetailsPage=async function v2OrderDetailsPage(id,backAction=""){
 currentBackendOrderDetailId=Number(id);
 clearInterval(timerInterval);
 const back=backAction||v2OrderBackAction();
 document.getElementById("root").innerHTML=`
 <div class="app">
  <button class="back" onclick="${back}">← BACK</button>
  <div class="logo">MR K BURGERS<span>ORDER DETAILS</span></div>
  <div class="panel"><p class="muted">Loading order...</p></div>
 </div>`;
 try{
  const order=await v2FetchOrderDetails(id);
  const canCancel=["NEW","ACCEPTED"].includes(order.status)&&["cashier","manager","owner"].includes(role);
  const canComplete=order.status==="READY"&&["cashier","manager","owner"].includes(role);
  const timeline=Array.isArray(order.timeline)?order.timeline:[];
  document.querySelector(".panel").innerHTML=`
   <div class="order-top">
    <div>
     <div class="order-number">#${padOrder(order.order_number)}</div>
     <h2>${esc(order.order_type||"")}</h2>
    </div>
    <span class="status ${v2OrderStatusClass(order.status)}">${esc(order.status||"NEW")}</span>
   </div>
   <div class="summary">
    <div class="info-row"><span>Payment</span><strong>${esc(order.payment_status||"PENDING")}</strong></div>
    <div class="info-row"><span>Method</span><strong>${esc(order.payment_method||"—")}</strong></div>
    <div class="info-row"><span>Total</span><strong>${Number(order.total_amount||0).toLocaleString()} CFA</strong></div>
    ${order.customer_name?`<div class="info-row"><span>Customer</span><strong>${esc(order.customer_name)}</strong></div>`:""}
    ${order.customer_phone?`<div class="info-row"><span>Phone</span><strong>${esc(order.customer_phone)}</strong></div>`:""}
    ${order.customer_address?`<div class="info-row"><span>Address</span><strong>${esc(order.customer_address)}</strong></div>`:""}
    ${order.table_number?`<div class="info-row"><span>Table</span><strong>${esc(order.table_number)}</strong></div>`:""}
    ${v2OrderTimerHtml(order)}
   </div>
   <h3>Items</h3>
   ${(Array.isArray(order.items)&&order.items.length)?order.items.map(item=>`
    <div class="summary">
     <div class="info-row">
      <span><strong>${Number(item.quantity||0)} × ${esc(item.item_name||"")}</strong></span>
      <strong>${(Number(item.unit_price||0)*Number(item.quantity||0)).toLocaleString()} CFA</strong>
     </div>
     ${item.notes?`<div class="muted">${esc(item.notes)}</div>`:""}
    </div>`).join(""):`<p class="muted">No item details available.</p>`}
   <h3 style="margin-top:24px">Timeline</h3>
   ${timeline.length?timeline.map(event=>`
    <div class="summary">
     <div class="info-row">
      <span>${v2OrderTimelineTime(event.created_at)}</span>
      <strong>${esc(event.label||event.event_type||"")}</strong>
     </div>
     <div class="muted">${esc(event.actor_name||"Unknown")}${event.actor_staff_id?` (${esc(event.actor_staff_id)})`:""}${event.actor_role?` — ${esc(String(event.actor_role).toUpperCase())}`:""}</div>
     ${event.detail?`<div class="system-note">${esc(event.detail)}</div>`:""}
    </div>`).join(""):`<p class="muted">No timeline events recorded.</p>`}
   ${(order.status==="CANCELLED"&&order.cancel_reason)?`<div class="system-note"><strong>Cancellation reason:</strong> ${esc(order.cancel_reason)}</div>`:""}
   <div class="actions">
    ${canCancel?`<button class="danger" onclick="v2CancelOrderFromDetails(${Number(order.id)})">CANCEL & REFUND ORDER</button>`:""}
    ${canComplete?`<button class="green" onclick="v2CompleteOrderFromDetails(${Number(order.id)})">COMPLETE ORDER</button>`:""}
   </div>`;
  v2RefreshKitchenTimers();
  if(!order.ready_at&&!["COMPLETED","CANCELLED"].includes(order.status)){
   timerInterval=setInterval(v2RefreshKitchenTimers,1000);
  }
 }catch(error){
  document.querySelector(".panel").innerHTML=`<div class="system-note">${esc(error.message||"Unable to load order details.")}</div>`;
 }
};

window.v2CancelOrderFromDetails=async function v2CancelOrderFromDetails(id){
 const reason=prompt("Cancellation reason:");
 if(reason===null)return;
 const clean=String(reason).trim();
 if(!clean){alert("Cancellation reason is required.");return;}
 if(!confirm("Cancel and refund this order?"))return;
 try{
  const response=await fetch(`/api/orders/${id}/cancel`,{
   method:"POST",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({reason:clean,...v2ActorPayload()})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||"Unable to cancel order");
  if(typeof v2FetchOwnerAccounts==="function")v2FetchOwnerAccounts().catch(()=>{});
  if(typeof v2HydrateShiftState==="function")v2HydrateShiftState().catch(()=>{});
  await v2OrderDetailsPage(id,v2OrderBackAction());
 }catch(error){alert(error.message||"Unable to cancel this order.");}
};

window.v2CompleteOrderFromDetails=async function v2CompleteOrderFromDetails(id){
 try{
  const response=await fetch(`/api/orders/${id}/status`,{
   method:"PATCH",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({status:"COMPLETED"})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||"Unable to complete order");
  await v2OrderDetailsPage(id,v2OrderBackAction());
 }catch(error){alert(error.message||"Unable to complete this order.");}
};

window.activeOrderDetail=function activeOrderDetail(id){
 return v2OrderDetailsPage(id,"showActiveOrders()");
};

window.backendOrderHistoryDetail=function backendOrderHistoryDetail(id){
 return v2OrderDetailsPage(id,"showOrderHistory()");
};

window.cancelBackendOrderFromList=async function cancelBackendOrderFromList(id){
 const reason=prompt("Cancellation reason:");
 if(reason===null)return;
 const clean=String(reason).trim();
 if(!clean){alert("Cancellation reason is required.");return;}
 if(!confirm("Cancel and refund this order?"))return;
 try{
  const response=await fetch(`/api/orders/${id}/cancel`,{
   method:"POST",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({reason:clean,...v2ActorPayload()})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||"Unable to cancel order");
  await showActiveOrders();
  refreshCashierDashboardCounts();
  if(typeof v2FetchOwnerAccounts==="function")v2FetchOwnerAccounts().catch(()=>{});
  if(typeof v2HydrateShiftState==="function")v2HydrateShiftState().catch(()=>{});
 }catch(error){alert(error.message||"Unable to cancel this order.");}
};

const v2OriginalOwnerCashAccountPage=window.ownerCashAccountPage;
if(typeof v2OriginalOwnerCashAccountPage==="function"){
 window.ownerCashAccountPage=async function ownerCashAccountPage(){
  try{
   if(typeof v2FetchOwnerAccounts==="function")await v2FetchOwnerAccounts();
  }catch(error){
   console.error("Unable to refresh owner balances",error);
  }
  const result=v2OriginalOwnerCashAccountPage();
  const summary=document.querySelector("#root .panel .summary");
  if(summary){
   summary.innerHTML=`
    <div class="info-row"><span>💵 Cash Balance</span><strong>${Number(ownerCashAccount.balance||0).toLocaleString()} CFA</strong></div>
    <div class="info-row"><span>💳 Card Balance</span><strong>${Number(ownerCardAccount.balance||0).toLocaleString()} CFA</strong></div>
    <div class="info-row"><span>📱 Mobile Money Balance</span><strong>${Number(ownerMobileMoneyAccount.balance||0).toLocaleString()} CFA</strong></div>`;
  }
  return result;
 };
}

if(!loggedIn){
 loginScreen();
}
