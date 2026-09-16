/* Owner/manager order-history date filter controls */
(function(){
 function v2EnhanceOrderHistoryFilter(){
  const label=document.querySelector("#root .logo span");
  const labelText=String(label?.textContent||"").trim();
  if(!labelText.includes("ORDER HISTORY"))return;

  const input=document.querySelector('#root input[type="date"]');
  if(!input||document.getElementById("v2OwnerOrderHistoryActions"))return;

  input.removeAttribute("onchange");
  input.onchange=null;

  const isManager=labelText.includes("MANAGER");
  const actions=document.createElement("div");
  actions.id="v2OwnerOrderHistoryActions";
  actions.className="actions";
  actions.style.margin="10px 0 20px";
  actions.innerHTML=`
   <button class="primary" onclick="v2ApplyOrderHistoryDateFilter(${isManager?'true':'false'})">APPLY</button>
   <button class="secondary" onclick="v2ClearOrderHistoryDateFilter(${isManager?'true':'false'})">CLEAR / SHOW ALL</button>`;
  input.insertAdjacentElement("afterend",actions);
 }

 window.v2ApplyOrderHistoryDateFilter=function v2ApplyOrderHistoryDateFilter(isManager){
  const value=document.querySelector('#root input[type="date"]')?.value||"";
  if(isManager&&typeof managerOrderHistory==="function")return managerOrderHistory(value);
  if(typeof ownerOrderHistory==="function")return ownerOrderHistory(value);
 };

 window.v2ClearOrderHistoryDateFilter=function v2ClearOrderHistoryDateFilter(isManager){
  if(isManager&&typeof managerOrderHistory==="function")return managerOrderHistory("");
  if(typeof ownerOrderHistory==="function")return ownerOrderHistory("");
 };

 if(typeof ownerOrderHistory==="function"){
  const originalOwnerOrderHistory=ownerOrderHistory;
  window.ownerOrderHistory=function ownerOrderHistory(selectedDate){
   const result=originalOwnerOrderHistory(selectedDate);
   v2EnhanceOrderHistoryFilter();
   return result;
  };
 }

 if(typeof managerOrderHistory==="function"){
  const originalManagerOrderHistory=managerOrderHistory;
  window.managerOrderHistory=function managerOrderHistory(selectedDate){
   const result=originalManagerOrderHistory(selectedDate);
   v2EnhanceOrderHistoryFilter();
   return result;
  };
 }
})();

/* Cashier checkout safety bridge */
(function(){
 window.v2BackFromPayment=function v2BackFromPayment(){
  v2PendingCheckout=null;
  if(typeof viewCart==="function")viewCart();
 };

 const originalCheckoutOrder=window.checkoutOrder;
 if(typeof originalCheckoutOrder==="function"){
  window.checkoutOrder=function checkoutOrder(...args){
   const result=originalCheckoutOrder.apply(this,args);
   const app=document.querySelector("#root .app");
   const paymentLabel=document.querySelector("#root .logo span");
   if(app&&String(paymentLabel?.textContent||"").trim()==="PAYMENT"&&!document.getElementById("v2BackFromPayment")){
    const button=document.createElement("button");
    button.id="v2BackFromPayment";
    button.className="back";
    button.textContent="← BACK TO ORDER";
    button.onclick=window.v2BackFromPayment;
    app.insertBefore(button,app.firstChild);
   }
   return result;
  };
 }

 window.confirmOrderPayment=async function confirmOrderPayment(number,paymentMethod){
  if(!v2PendingCheckout){
   return alert("No checkout is currently waiting for payment.");
  }

  const pending=v2PendingCheckout;
  const orderUuid=`cashier-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
  const items=pending.cart.map(item=>({
   item_name:item.name,
   quantity:Number(item.qty||1),
   unit_price:Number(itemUnitPrice(item)||0),
   notes:v2OrderNotes(item)
  }));

  try{
   const response=await fetch("/api/orders-with-inventory",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
     order_uuid:orderUuid,
     order_type:pending.orderType,
     payment_status:"PAID",
     payment_method:paymentMethod,
     customer_name:pending.customer?.name||null,
     customer_phone:pending.customer?.phone||null,
     total_amount:Number(pending.total||0),
     items
    })
   });

   const responseData=await response.json().catch(()=>({}));
   if(!response.ok){
    if(response.status===409&&responseData.error==="insufficient inventory"){
     const shortages=Array.isArray(responseData.shortages)?responseData.shortages:[];
     const lines=shortages.map(item=>`${item.name}: need ${Number(item.required).toLocaleString()}, available ${Number(item.available).toLocaleString()}`);
     alert("NOT ENOUGH STOCK\n\n"+(lines.join("\n")||"One or more tracked ingredients are out of stock.")+"\n\nUse BACK TO ORDER to change the order.");
     return;
    }
    throw new Error(responseData.error||"Unable to create backend order");
   }

   const created=responseData;
   let sentToKitchen=false;
   try{
    const acceptResponse=await fetch(`/api/orders/${created.id}/status`,{
     method:"PATCH",
     headers:{"Content-Type":"application/json"},
     body:JSON.stringify({status:"ACCEPTED"})
    });
    sentToKitchen=acceptResponse.ok;
   }catch(error){
    sentToKitchen=false;
   }

   if(currentDraftId){
    draftOrders=draftOrders.filter(d=>d.id!==currentDraftId);
   }

   addShiftSale(
    Number(pending.total||0),
    created.order_number,
    paymentMethod,
    created.id,
    pending.delivery?{
     zone_id:String(pending.delivery.zone_id||pending.delivery.id||""),
     zone_name:String(pending.delivery.zone_name||pending.delivery.name||""),
     fee:Number(pending.delivery.fee||0)
    }:null
   );

   if(paymentMethod==="CARD"){
    addOwnerDigitalTransaction(
     "CARD","IN",Number(pending.total||0),
     `Card sale - Order #${padOrder(created.order_number)}`,
     "SALE",`ORDER_${created.order_number}`
    );
   }else if(paymentMethod==="MOBILE MONEY"){
    addOwnerDigitalTransaction(
     "MOBILE MONEY","IN",Number(pending.total||0),
     `Mobile Money sale - Order #${padOrder(created.order_number)}`,
     "SALE",`ORDER_${created.order_number}`
    );
   }

   cart=[];
   customer={name:"",phone:"",address:"",table:""};
   orderType="";
   currentDraftId=null;
   v2PendingCheckout=null;
   saveOrders();

   document.getElementById("root").innerHTML=`
    <div class="app">
     <div class="logo">MR K BURGERS<span>ORDER PAID</span></div>
     <div class="panel">
      <h1>Order #${padOrder(created.order_number)}</h1>
      <div class="system-note">
       ${sentToKitchen
        ?"Order saved, inventory updated, and sent directly to the kitchen."
        :"Order saved and inventory updated, but it could not be sent to the kitchen automatically. Open Active Orders and accept this saved order manually."}
      </div>
      <div class="info-row"><span>Payment</span><strong>${esc(paymentMethod)}</strong></div>
      <div class="info-row"><span>Total</span><strong>${Number(pending.total||0).toLocaleString()} CFA</strong></div>
      <button class="primary" style="width:100%;margin-top:18px" onclick="showActiveOrders()">VIEW ACTIVE ORDERS</button>
      <button class="secondary" style="width:100%;margin-top:10px" onclick="home()">DONE</button>
     </div>
    </div>`;

   if(!sentToKitchen){
    alert(`Order #${padOrder(created.order_number)} was saved successfully, but it was not sent to the kitchen automatically. Open Active Orders and accept it manually. Do not create the order again.`);
   }
  }catch(error){
   alert(error.message||"Unable to save this order to the restaurant server.");
  }
 };
})();
