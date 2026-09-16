/* Delivery zones / cashier delivery fee / reporting bridge */
(function(){
 let v2DeliveryZonesCache=[];

 function money(value){
  return `${Number(value||0).toLocaleString()} CFA`;
 }

 function selectedZone(){
  if(String(orderType||"").toUpperCase()!=="DELIVERY")return null;
  const id=String(customer?.deliveryZoneId||"");
  if(!id)return null;
  return {
   id,
   name:String(customer?.deliveryZoneName||""),
   fee:Number(customer?.deliveryFee||0)
  };
 }

 async function loadZones(all=false){
  const response=await fetch(`/api/delivery-zones${all?"?all=1":""}`,{cache:"no-store"});
  const data=await response.json().catch(()=>[]);
  if(!response.ok)throw new Error(data.error||"Unable to load delivery zones");
  v2DeliveryZonesCache=Array.isArray(data)?data:[];
  return v2DeliveryZonesCache;
 }

 window.v2DeliveryZonesPage=async function v2DeliveryZonesPage(){
  if(role!=="owner"){
   alert("Only the owner can manage delivery zones.");
   return;
  }
  clearInterval(timerInterval);
  document.getElementById("root").innerHTML=`
   <div class="app">
    <button class="back" onclick="ownerHome()">← BACK</button>
    <div class="logo">MR K BURGERS<span>OWNER — DELIVERY ZONES</span></div>
    <div class="panel"><p class="muted">Loading delivery zones...</p></div>
   </div>`;
  try{
   const zones=await loadZones(true);
   document.querySelector("#root .panel").innerHTML=`
    <span class="badge">🛵 DELIVERY ZONES</span>
    <h1>Delivery Zones</h1>
    <p class="muted">Cashiers select one active zone before starting a delivery order. The selected fee is saved with that order.</p>
    <button class="primary" style="width:100%;margin:10px 0 18px" onclick="v2EditDeliveryZone()">+ ADD DELIVERY ZONE</button>
    ${zones.length?zones.map(zone=>`
     <div class="card" style="margin:12px 0">
      <div class="order-top">
       <div><h3>${esc(zone.name)}</h3><strong>${money(zone.fee)}</strong></div>
       <span class="status ${zone.active?"ready":""}">${zone.active?"ACTIVE":"INACTIVE"}</span>
      </div>
      <div class="actions">
       <button class="secondary" onclick="v2EditDeliveryZone('${esc(zone.id)}')">EDIT</button>
       <button class="danger" onclick="v2DeleteDeliveryZone('${esc(zone.id)}')">DELETE</button>
      </div>
     </div>`).join(""):`<p class="muted">No delivery zones yet.</p>`}
   `;
  }catch(error){
   document.querySelector("#root .panel").innerHTML=`<div class="system-note">${esc(error.message||"Unable to load delivery zones.")}</div>`;
  }
 };

 window.v2EditDeliveryZone=async function v2EditDeliveryZone(id=""){
  const zone=id?v2DeliveryZonesCache.find(entry=>entry.id===id):null;
  document.getElementById("root").innerHTML=`
   <div class="app">
    <button class="back" onclick="v2DeliveryZonesPage()">← BACK</button>
    <div class="logo">MR K BURGERS<span>${zone?"EDIT":"NEW"} DELIVERY ZONE</span></div>
    <div class="panel">
     <div class="form">
      <label>Zone Name</label>
      <input id="v2ZoneName" value="${esc(zone?.name||"")}" placeholder="Example: Zone 1">
      <label>Delivery Fee (CFA)</label>
      <input id="v2ZoneFee" type="number" min="0" step="1" inputmode="numeric" value="${Number(zone?.fee||0)}">
      <label style="display:flex;align-items:center;gap:10px"><input id="v2ZoneActive" type="checkbox" style="width:22px;height:22px" ${zone?.active===false?"":"checked"}> Active</label>
      <button class="primary" onclick="v2SaveDeliveryZone('${esc(zone?.id||"")}')">SAVE DELIVERY ZONE</button>
      <button class="secondary" onclick="v2DeliveryZonesPage()">CANCEL</button>
     </div>
    </div>
   </div>`;
 };

 window.v2SaveDeliveryZone=async function v2SaveDeliveryZone(id=""){
  const name=String(document.getElementById("v2ZoneName")?.value||"").trim();
  const fee=Number(document.getElementById("v2ZoneFee")?.value||0);
  const active=Boolean(document.getElementById("v2ZoneActive")?.checked);
  if(!name)return alert("Enter a delivery zone name.");
  if(!Number.isFinite(fee)||fee<0)return alert("Enter a valid delivery fee.");
  try{
   const response=await fetch(id?`/api/delivery-zones/${encodeURIComponent(id)}`:"/api/delivery-zones",{
    method:id?"PATCH":"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({name,fee,active})
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||"Unable to save delivery zone");
   await v2DeliveryZonesPage();
  }catch(error){alert(error.message||"Unable to save delivery zone.");}
 };

 window.v2DeleteDeliveryZone=async function v2DeleteDeliveryZone(id){
  const zone=v2DeliveryZonesCache.find(entry=>entry.id===id);
  if(!confirm(`Delete delivery zone "${zone?.name||""}"? Existing orders will keep their saved zone and fee.`))return;
  try{
   const response=await fetch(`/api/delivery-zones/${encodeURIComponent(id)}`,{method:"DELETE"});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||"Unable to delete delivery zone");
   await v2DeliveryZonesPage();
  }catch(error){alert(error.message||"Unable to delete delivery zone.");}
 };

 async function chooseDeliveryZone(){
  clearInterval(timerInterval);
  document.getElementById("root").innerHTML=`
   <div class="app">
    <button class="back" onclick="newOrder()">← BACK</button>
    <div class="logo">MR K BURGERS<span>DELIVERY ZONE</span></div>
    <div class="panel"><p class="muted">Loading active delivery zones...</p></div>
   </div>`;
  try{
   const zones=await loadZones(false);
   document.querySelector("#root .panel").innerHTML=`
    <span class="badge">🛵 DELIVERY</span>
    <h1>Select Delivery Zone</h1>
    <p class="muted">Select the customer's delivery zone before starting the order.</p>
    ${zones.length?`<div class="grid">${zones.map(zone=>`
     <div class="card clickable" onclick="v2ChooseCashierDeliveryZone('${esc(zone.id)}')">
      <div class="category-icon">📍</div>
      <h3>${esc(zone.name)}</h3>
      <strong>${money(zone.fee)}</strong>
     </div>`).join("")}</div>`:`<div class="system-note">No active delivery zones are available. Ask the owner to create or activate a zone.</div>`}
   `;
  }catch(error){
   document.querySelector("#root .panel").innerHTML=`<div class="system-note">${esc(error.message||"Unable to load delivery zones.")}</div>`;
  }
 }

 window.v2ChooseCashierDeliveryZone=function v2ChooseCashierDeliveryZone(id){
  const zone=v2DeliveryZonesCache.find(entry=>entry.id===id&&entry.active!==false);
  if(!zone)return alert("This delivery zone is unavailable.");
  customer={...customer,deliveryZoneId:zone.id,deliveryZoneName:zone.name,deliveryFee:Number(zone.fee||0)};
  customerForm();
 };

 const originalSelectOrderType=window.selectOrderType;
 if(typeof originalSelectOrderType==="function"){
  window.selectOrderType=function selectOrderType(type){
   if(String(type||"").toUpperCase()==="DELIVERY"){
    orderType="DELIVERY";
    customer={name:"",phone:"",address:"",table:"",deliveryZoneId:"",deliveryZoneName:"",deliveryFee:0};
    chooseDeliveryZone();
    return;
   }
   customer={...customer,deliveryZoneId:"",deliveryZoneName:"",deliveryFee:0};
   return originalSelectOrderType(type);
  };
 }

 const originalSaveCustomer=window.saveCustomer;
 if(typeof originalSaveCustomer==="function"){
  window.saveCustomer=function saveCustomer(){
   const zone=selectedZone();
   if(String(orderType||"").toUpperCase()==="DELIVERY"&&!zone){
    alert("Select a delivery zone first.");
    chooseDeliveryZone();
    return;
   }
   const result=originalSaveCustomer();
   if(zone){
    customer={...customer,deliveryZoneId:zone.id,deliveryZoneName:zone.name,deliveryFee:zone.fee};
   }
   return result;
  };
 }

 const originalCartTotal=window.cartTotal;
 if(typeof originalCartTotal==="function"){
  window.cartTotal=function cartTotal(){
   const food=Number(originalCartTotal()||0);
   const zone=selectedZone();
   return food+Number(zone?.fee||0);
  };
 }

 function foodSubtotal(){
  return (Array.isArray(cart)?cart:[]).reduce((sum,item)=>sum+(Number(itemUnitPrice(item)||0)*Number(item.qty||1)),0);
 }

 function addDeliveryBreakdown(container){
  const zone=selectedZone();
  if(!zone||!container||container.querySelector(".v2-delivery-breakdown"))return;
  const block=document.createElement("div");
  block.className="summary v2-delivery-breakdown";
  block.innerHTML=`
   <div class="info-row"><span>Food Subtotal</span><strong>${money(foodSubtotal())}</strong></div>
   <div class="info-row"><span>Delivery Zone</span><strong>${esc(zone.name)}</strong></div>
   <div class="info-row"><span>Delivery Fee</span><strong>${money(zone.fee)}</strong></div>
   <div class="info-row"><span>Total</span><strong>${money(foodSubtotal()+zone.fee)}</strong></div>`;
  container.insertBefore(block,container.querySelector(".actions")||null);
 }

 const originalViewCart=window.viewCart;
 if(typeof originalViewCart==="function"){
  window.viewCart=function viewCart(){
   const result=originalViewCart();
   if(String(orderType||"").toUpperCase()==="DELIVERY")addDeliveryBreakdown(document.querySelector("#root .panel"));
   return result;
  };
 }

 const originalCheckoutOrder=window.checkoutOrder;
 if(typeof originalCheckoutOrder==="function"){
  window.checkoutOrder=function checkoutOrder(){
   const zone=selectedZone();
   if(String(orderType||"").toUpperCase()==="DELIVERY"&&!zone){
    alert("A delivery zone is required before checkout.");
    return;
   }
   const result=originalCheckoutOrder();
   if(zone&&typeof v2PendingCheckout!=="undefined"&&v2PendingCheckout){
    v2PendingCheckout.delivery={zone_id:zone.id,zone_name:zone.name,fee:zone.fee};
    const panel=document.querySelector("#root .panel");
    const totalRow=[...panel?.querySelectorAll(".info-row")||[]].find(row=>row.querySelector("span")?.textContent?.trim()==="Total");
    if(totalRow&&!panel.querySelector(".v2-payment-delivery")){
     const box=document.createElement("div");
     box.className="v2-payment-delivery";
     box.innerHTML=`<div class="info-row"><span>Food Subtotal</span><strong>${money(foodSubtotal())}</strong></div><div class="info-row"><span>Delivery Zone</span><strong>${esc(zone.name)}</strong></div><div class="info-row"><span>Delivery Fee</span><strong>${money(zone.fee)}</strong></div>`;
     totalRow.insertAdjacentElement("beforebegin",box);
    }
   }
   return result;
  };
 }

 const previousFetch=window.fetch.bind(window);
 window.fetch=async function v2DeliveryFetch(input,options={}){
  const url=typeof input==="string"?input:String(input?.url||"");
  const method=String(options?.method||"GET").toUpperCase();
  if((url==="/api/orders-with-inventory"||url==="/api/orders")&&method==="POST"){
   let body={};
   try{body=options.body?JSON.parse(options.body):{};}catch{}
   if(String(body.order_type||"").toUpperCase()==="DELIVERY"){
    const pending=typeof v2PendingCheckout!=="undefined"?v2PendingCheckout:null;
    const zone=pending?.delivery||selectedZone();
    if(zone?.zone_id||zone?.id){
     body.delivery_zone_id=zone.zone_id||zone.id;
     options={...options,body:JSON.stringify(body)};
    }
   }
  }
  return previousFetch(input,options);
 };

 const originalOwnerHome=window.ownerHome;
 if(typeof originalOwnerHome==="function"){
  window.ownerHome=function ownerHome(){
   const result=originalOwnerHome();
   const grid=document.querySelector("#root .grid");
   if(grid&&!document.getElementById("v2DeliveryZonesCard")){
    const card=document.createElement("div");
    card.id="v2DeliveryZonesCard";
    card.className="card clickable";
    card.onclick=()=>v2DeliveryZonesPage();
    card.innerHTML='<div class="category-icon">🛵</div><h3>DELIVERY ZONES</h3><p class="muted">Zones, fixed fees and availability</p>';
    grid.appendChild(card);
   }
   return result;
  };
 }

 function injectOrderDeliverySummary(order){
  if(String(order?.order_type||"").toUpperCase()!=="DELIVERY")return;
  const panel=document.querySelector("#root .panel");
  const summary=panel?.querySelector(".summary");
  if(!summary||summary.querySelector(".v2-order-delivery-row"))return;
  const total=Number(order.total_amount||0);
  const fee=Number(order.delivery_fee||0);
  const rows=document.createElement("div");
  rows.className="v2-order-delivery-row";
  rows.innerHTML=`
   <div class="info-row"><span>Food Subtotal</span><strong>${money(Math.max(0,total-fee))}</strong></div>
   <div class="info-row"><span>Delivery Zone</span><strong>${esc(order.delivery_zone_name||"—")}</strong></div>
   <div class="info-row"><span>Delivery Fee</span><strong>${money(fee)}</strong></div>`;
  const totalRow=[...summary.querySelectorAll(":scope > .info-row")].find(row=>row.querySelector("span")?.textContent?.trim()==="Total");
  if(totalRow)totalRow.insertAdjacentElement("beforebegin",rows);
  else summary.appendChild(rows);
 }

 const originalOrderDetails=window.v2OrderDetailsPage;
 if(typeof originalOrderDetails==="function"){
  window.v2OrderDetailsPage=async function v2OrderDetailsPage(id,backAction=""){
   const result=await originalOrderDetails(id,backAction);
   try{
    const order=await v2FetchOrderDetails(id);
    injectOrderDeliverySummary(order);
   }catch(error){console.error("Unable to add delivery details",error);}
   return result;
  };
 }

 const originalAddShiftSale=window.addShiftSale;
 if(typeof originalAddShiftSale==="function"){
  window.addShiftSale=function addShiftSale(amount,orderId=null,paymentMethod="CASH",backendOrderId=null){
   const zone=selectedZone();
   const result=originalAddShiftSale(amount,orderId,paymentMethod,backendOrderId);
   if(zone){
    try{
     const shift=JSON.parse(localStorage.getItem("mrkActiveShift")||"null");
     if(shift&&Array.isArray(shift.orders)){
      const row=[...shift.orders].reverse().find(entry=>
       (backendOrderId!=null&&Number(entry.backendOrderId)===Number(backendOrderId))||
       (entry.orderId===orderId&&String(entry.paymentMethod||"CASH")===String(paymentMethod||"CASH"))
      );
      if(row){
       row.deliveryFee=Number(zone.fee||0);
       row.deliveryZoneId=zone.id;
       row.deliveryZoneName=zone.name;
       localStorage.setItem("mrkActiveShift",JSON.stringify(shift));
       if(typeof v2ScheduleShiftSync==="function")v2ScheduleShiftSync();
      }
     }
    }catch(error){console.error("Unable to save shift delivery fee",error);}
   }
   return result;
  };
 }

 function shiftSummaryData(shift){
  const orders=Array.isArray(shift?.orders)?shift.orders:[];
  const gross=orders.reduce((sum,row)=>sum+Number(row.amount||0),0);
  const fees=orders.reduce((sum,row)=>sum+Number(row.deliveryFee||0),0);
  return {gross,fees,food:gross-fees};
 }

 function injectShiftSummary(shift){
  if(!shift)return;
  const panel=document.querySelector("#root .panel");
  if(!panel||document.getElementById("v2ShiftDeliverySummary"))return;
  const values=shiftSummaryData(shift);
  const box=document.createElement("div");
  box.id="v2ShiftDeliverySummary";
  box.className="summary";
  box.innerHTML=`<h3>Sales Breakdown</h3><div class="info-row"><span>Food Sales</span><strong>${money(values.food)}</strong></div><div class="info-row"><span>Delivery Fees</span><strong>${money(values.fees)}</strong></div><div class="info-row"><span>Gross Collected</span><strong>${money(values.gross)}</strong></div>`;
  panel.insertBefore(box,panel.firstChild);
 }

 if(typeof shiftManagementPageRender==="function"){
  const originalShiftPage=window.shiftManagementPageRender;
  window.shiftManagementPageRender=function shiftManagementPageRender(...args){
   const result=originalShiftPage.apply(this,args);
   try{injectShiftSummary(typeof getActiveShift==="function"?getActiveShift():null);}catch{}
   return result;
  };
 }

 function sameLocalDate(timestamp,dateText){
  if(!dateText)return true;
  const date=new Date(timestamp);
  if(Number.isNaN(date.getTime()))return false;
  const y=date.getFullYear();
  const m=String(date.getMonth()+1).padStart(2,"0");
  const d=String(date.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`===dateText;
 }

 async function fetchSalesForDate(dateText=""){
  const response=await fetch("/api/orders?status=COMPLETED&payment_status=PAID",{cache:"no-store"});
  if(!response.ok)return [];
  const orders=await response.json();
  return (Array.isArray(orders)?orders:[]).filter(order=>sameLocalDate(String(order.completed_at||order.updated_at||"").replace(" ","T")+"Z",dateText));
 }

 async function injectSalesSummary(dateText=""){
  const panel=document.querySelector("#root .panel");
  if(!panel||document.getElementById("v2DeliverySalesSummary"))return;
  const orders=await fetchSalesForDate(dateText);
  const gross=orders.reduce((sum,order)=>sum+Number(order.total_amount||0),0);
  const fees=orders.reduce((sum,order)=>sum+Number(order.delivery_fee||0),0);
  const box=document.createElement("div");
  box.id="v2DeliverySalesSummary";
  box.className="summary";
  box.innerHTML=`<h3>Sales Breakdown</h3><div class="info-row"><span>Food Sales</span><strong>${money(gross-fees)}</strong></div><div class="info-row"><span>Delivery Fees</span><strong>${money(fees)}</strong></div><div class="info-row"><span>Gross Collected</span><strong>${money(gross)}</strong></div>`;
  panel.insertBefore(box,panel.firstChild);
 }

 if(typeof ownerSales==="function"){
  const originalOwnerSales=window.ownerSales;
  window.ownerSales=async function ownerSales(...args){
   const result=await originalOwnerSales.apply(this,args);
   const now=new Date();
   const dateText=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
   await injectSalesSummary(dateText);
   return result;
  };
 }

 if(typeof managerSales==="function"){
  const originalManagerSales=window.managerSales;
  window.managerSales=async function managerSales(...args){
   const result=await originalManagerSales.apply(this,args);
   const now=new Date();
   const dateText=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
   await injectSalesSummary(dateText);
   return result;
  };
 }

 if(typeof managerSalesHistory==="function"){
  const originalManagerSalesHistory=window.managerSalesHistory;
  window.managerSalesHistory=async function managerSalesHistory(selectedDate){
   const result=await originalManagerSalesHistory(selectedDate);
   const dateText=selectedDate||document.querySelector('#root input[type="date"]')?.value||"";
   await injectSalesSummary(dateText);
   return result;
  };
 }

 if(typeof ownerSalesHistoryDaily==="function"){
  const originalOwnerSalesHistoryDaily=window.ownerSalesHistoryDaily;
  window.ownerSalesHistoryDaily=async function ownerSalesHistoryDaily(selectedDate){
   const result=await originalOwnerSalesHistoryDaily(selectedDate);
   await injectSalesSummary(selectedDate||"");
   return result;
  };
 }

 socket?.on?.("delivery-zones-changed",()=>{v2DeliveryZonesCache=[];});
})();
