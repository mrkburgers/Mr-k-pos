let v2BackendStaff=[];
let v2LastPaidOrderId=null;

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

function v2ReceiptMenuPrice(name){
 const item=Array.isArray(ownerMenuData)
  ?ownerMenuData.find(entry=>String(entry?.name||"")===String(name||""))
  :null;
 const price=Number(item?.price);
 return Number.isFinite(price)?price:0;
}

function v2BuildReceiptSnapshot(cartItem,requestItem){
 const quantity=Math.max(1,Number(requestItem?.quantity||cartItem?.qty||1));
 const chargedUnitPrice=Number(requestItem?.unit_price||0);
 const extras=(Array.isArray(cartItem?.extras)?cartItem.extras:[]).map(extra=>{
  const qty=Math.max(1,Number(extra?.qty||1));
  const unitPrice=v2ReceiptMenuPrice(extra?.name);
  return {
   name:String(extra?.name||""),
   qty,
   unit_price:unitPrice
  };
 });
 const extraUnitTotal=extras.reduce((sum,extra)=>sum+(Number(extra.unit_price||0)*Number(extra.qty||1)),0);
 let baseUnitPrice=v2ReceiptMenuPrice(cartItem?.name||requestItem?.item_name);
 if(!baseUnitPrice&&chargedUnitPrice>=extraUnitTotal){
  baseUnitPrice=chargedUnitPrice-extraUnitTotal;
 }
 return {
  version:1,
  item_name:String(requestItem?.item_name||cartItem?.name||""),
  quantity,
  base_unit_price:baseUnitPrice,
  charged_unit_price:chargedUnitPrice,
  removed:Array.isArray(cartItem?.removed)?cartItem.removed.map(value=>String(value)):[],
  extras,
  item_subtotal:chargedUnitPrice*quantity
 };
}

function v2AttachReceiptSnapshot(notes,snapshot){
 const clean=String(notes||"").trim();
 const encoded=encodeURIComponent(JSON.stringify(snapshot));
 return [clean,`RECEIPT_JSON:${encoded}`].filter(Boolean).join(" | ");
}

function v2ParseReceiptSnapshot(item){
 const match=String(item?.notes||"").match(/(?:^|\|\s*)RECEIPT_JSON:([^|]+)/);
 if(!match)return null;
 try{
  const parsed=JSON.parse(decodeURIComponent(match[1].trim()));
  return parsed&&typeof parsed==="object"?parsed:null;
 }catch(error){
  return null;
 }
}

function v2CleanOrderNotes(notes){
 return String(notes||"")
  .replace(/(?:^|\|\s*)RECEIPT_JSON:[^|]+/g,"")
  .replace(/^\s*\|\s*|\s*\|\s*$/g,"")
  .trim();
}

const v2NativeFetch=window.fetch.bind(window);
window.fetch=async function v2AuditedFetch(input,options={}){
 const url=typeof input==="string"?input:String(input?.url||"");
 const method=String(options?.method||"GET").toUpperCase();

 if(url==="/api/orders-with-inventory"&&method==="POST"){
  let body={};
  try{body=options.body?JSON.parse(options.body):{};}catch{}
  const pending=typeof v2PendingCheckout!=="undefined"?v2PendingCheckout:null;
  if(Array.isArray(body.items)&&Array.isArray(pending?.cart)){
   body.items=body.items.map((item,index)=>({
    ...item,
    notes:v2AttachReceiptSnapshot(
     item?.notes,
     v2BuildReceiptSnapshot(pending.cart[index],item)
    )
   }));
  }
  const response=await v2NativeFetch(input,{...options,body:JSON.stringify(body)});
  if(response.ok){
   response.clone().json().then(data=>{
    if(data?.id)v2LastPaidOrderId=Number(data.id);
   }).catch(()=>{});
  }
  return response;
 }

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

function v2ReceiptActor(order){
 const timeline=Array.isArray(order?.timeline)?order.timeline:[];
 return timeline.find(event=>event.event_type==="ORDER_CREATED_PAID")
  ||timeline.find(event=>event.event_type==="SENT_TO_KITCHEN")
  ||null;
}

function v2ReceiptItemsHtml(order){
 return (Array.isArray(order?.items)?order.items:[]).map(item=>{
  const snapshot=v2ParseReceiptSnapshot(item);
  if(snapshot){
   const quantity=Math.max(1,Number(snapshot.quantity||item.quantity||1));
   const baseUnit=Number(snapshot.base_unit_price||0);
   const mainTotal=baseUnit*quantity;
   const extras=Array.isArray(snapshot.extras)?snapshot.extras:[];
   const removed=Array.isArray(snapshot.removed)?snapshot.removed:[];
   const itemSubtotal=Number(snapshot.item_subtotal||Number(item.unit_price||0)*Number(item.quantity||1));
   return `
    <div class="receipt-item">
     <div class="receipt-row"><span>${quantity} × ${esc(snapshot.item_name||item.item_name||"")} @ ${baseUnit.toLocaleString()}</span><strong>${mainTotal.toLocaleString()}</strong></div>
     ${removed.length?`<div class="receipt-note">NO: ${esc(removed.join(", "))}</div>`:""}
     ${extras.map(extra=>{
      const totalQty=Math.max(1,Number(extra.qty||1))*quantity;
      const unitPrice=Number(extra.unit_price||0);
      return `<div class="receipt-row receipt-extra"><span>+ ${totalQty} × ${esc(extra.name||"")} @ ${unitPrice.toLocaleString()}</span><span>${(totalQty*unitPrice).toLocaleString()}</span></div>`;
     }).join("")}
     <div class="receipt-row receipt-sub"><span>Item subtotal</span><strong>${itemSubtotal.toLocaleString()}</strong></div>
    </div>`;
  }
  const quantity=Math.max(1,Number(item.quantity||1));
  const unitPrice=Number(item.unit_price||0);
  const cleanNotes=v2CleanOrderNotes(item.notes);
  return `
   <div class="receipt-item">
    <div class="receipt-row"><span>${quantity} × ${esc(item.item_name||"")} @ ${unitPrice.toLocaleString()}</span><strong>${(quantity*unitPrice).toLocaleString()}</strong></div>
    ${cleanNotes?`<div class="receipt-note">${esc(cleanNotes)}</div>`:""}
   </div>`;
 }).join("");
}

window.v2PrintReceipt=async function v2PrintReceipt(id){
 const printWindow=window.open("","_blank","width=420,height=800");
 if(!printWindow){
  alert("Please allow pop-ups so the receipt can open for printing.");
  return;
 }
 printWindow.document.write("<p style='font-family:Arial;padding:20px'>Preparing receipt...</p>");
 try{
  const order=await v2FetchOrderDetails(id);
  if(order.status==="CANCELLED"||order.payment_status==="REFUNDED"){
   printWindow.close();
   alert("A normal sales receipt is not available for a cancelled/refunded order.");
   return;
  }
  const actor=v2ReceiptActor(order);
  const cashier=actor?.actor_name||"—";
  const staffId=actor?.actor_staff_id||"";
  const customerLines=[
   order.customer_name?`<div><strong>Customer:</strong> ${esc(order.customer_name)}</div>`:"",
   order.customer_phone?`<div><strong>Phone:</strong> ${esc(order.customer_phone)}</div>`:"",
   order.customer_address?`<div><strong>Address:</strong> ${esc(order.customer_address)}</div>`:"",
   order.table_number?`<div><strong>Table:</strong> ${esc(order.table_number)}</div>`:""
  ].filter(Boolean).join("");
  const html=`<!DOCTYPE html>
  <html><head><meta charset="UTF-8"><title>Receipt #${padOrder(order.order_number)}</title>
  <style>
   @page{size:80mm auto;margin:4mm}
   *{box-sizing:border-box}
   body{width:72mm;margin:0 auto;color:#000;background:#fff;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.35}
   .center{text-align:center}.brand{font-size:20px;font-weight:900;letter-spacing:.5px}.tag{font-size:9px;letter-spacing:2px;margin-top:2px}
   .dash{border-top:1px dashed #000;margin:8px 0}.meta div{margin:2px 0}.receipt-item{padding:6px 0;border-bottom:1px dashed #888}
   .receipt-row{display:flex;justify-content:space-between;gap:8px}.receipt-row span:first-child{flex:1}.receipt-extra{padding-left:7px;font-size:10px}.receipt-note{font-size:10px;margin:2px 0;padding-left:7px}
   .receipt-sub{margin-top:4px;font-size:10px}.total{font-size:16px;font-weight:900;padding:8px 0}.footer{margin-top:12px;font-size:10px}
  </style></head><body>
   <div class="center"><div class="brand">MR K BURGERS</div><div class="tag">REAL BURGERS</div></div>
   <div class="dash"></div>
   <div class="meta">
    <div><strong>Order:</strong> #${padOrder(order.order_number)}</div>
    <div><strong>Date:</strong> ${esc(v2OrderTimelineTime(order.created_at))}</div>
    <div><strong>Type:</strong> ${esc(order.order_type||"")}</div>
    <div><strong>Cashier:</strong> ${esc(cashier)}${staffId?` (${esc(staffId)})`:""}</div>
    <div><strong>Payment:</strong> ${esc(order.payment_method||"—")}</div>
    ${customerLines}
   </div>
   <div class="dash"></div>
   ${v2ReceiptItemsHtml(order)}
   <div class="receipt-row total"><span>TOTAL</span><span>${Number(order.total_amount||0).toLocaleString()} CFA</span></div>
   <div class="dash"></div>
   <div class="center footer">Thank you — Mr K Burgers</div>
  </body></html>`;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  setTimeout(()=>{
   printWindow.focus();
   printWindow.print();
  },250);
 }catch(error){
  printWindow.close();
  alert(error.message||"Unable to prepare receipt.");
 }
};

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
  const canPrint=order.payment_status==="PAID"&&order.status!=="CANCELLED";
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
   ${(Array.isArray(order.items)&&order.items.length)?order.items.map(item=>{
    const cleanNotes=v2CleanOrderNotes(item.notes);
    return `
    <div class="summary">
     <div class="info-row">
      <span><strong>${Number(item.quantity||0)} × ${esc(item.item_name||"")}</strong></span>
      <strong>${(Number(item.unit_price||0)*Number(item.quantity||0)).toLocaleString()} CFA</strong>
     </div>
     ${cleanNotes?`<div class="muted">${esc(cleanNotes)}</div>`:""}
    </div>`;
   }).join(""):`<p class="muted">No item details available.</p>`}
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
    ${canPrint?`<button class="secondary" onclick="v2PrintReceipt(${Number(order.id)})">${order.status==="COMPLETED"?"REPRINT RECEIPT":"PRINT RECEIPT"}</button>`:""}
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

const v2OriginalConfirmOrderPayment=window.confirmOrderPayment;
if(typeof v2OriginalConfirmOrderPayment==="function"){
 window.confirmOrderPayment=async function confirmOrderPayment(...args){
  v2LastPaidOrderId=null;
  const result=await v2OriginalConfirmOrderPayment.apply(this,args);
  const paidLabel=document.querySelector("#root .logo span");
  if(v2LastPaidOrderId&&paidLabel?.textContent?.trim()==="ORDER PAID"){
   const panel=document.querySelector("#root .panel");
   if(panel&&!document.getElementById("v2PrintPaidReceipt")){
    const button=document.createElement("button");
    button.id="v2PrintPaidReceipt";
    button.className="secondary";
    button.style.width="100%";
    button.style.marginTop="18px";
    button.style.fontWeight="800";
    button.textContent="PRINT RECEIPT";
    button.onclick=()=>v2PrintReceipt(v2LastPaidOrderId);
    const firstButton=panel.querySelector("button");
    if(firstButton)panel.insertBefore(button,firstButton);
    else panel.appendChild(button);
   }
  }
  return result;
 };
}

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
