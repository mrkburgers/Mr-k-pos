let v2PendingCheckout=null;

function v2OrderNotes(item){
 const notes=[];
 if(Array.isArray(item.removed) && item.removed.length){
  notes.push(`NO: ${item.removed.join(", ")}`);
 }
 if(Array.isArray(item.extras) && item.extras.length){
  notes.push(
   `EXTRAS: ${item.extras.map(extra=>`${Number(extra.qty||1)} x ${extra.name}`).join(", ")}`
  );
 }
 return notes.join(" | ") || null;
}

window.checkoutOrder=function checkoutOrder(){

 if(!cart.length){
  return alert("Add at least one item before checkout.");
 }

 v2PendingCheckout={
  orderType,
  customer:{...customer},
  cart:JSON.parse(JSON.stringify(cart)),
  total:cartTotal()
 };

 document.getElementById("root").innerHTML=`

 <div class="app">

  <div class="logo">
   MR K BURGERS
   <span>PAYMENT</span>
  </div>

  <div class="panel">

   <h2>${esc(orderType||"")}</h2>

   <div class="info-row">
    <span>Total</span>
    <strong>${Number(v2PendingCheckout.total||0).toLocaleString()} CFA</strong>
   </div>

   <h3>Select Payment Method</h3>

   <button
    class="green"
    style="width:100%;margin-top:10px;color:white;font-weight:800;"
    onclick="confirmOrderPayment(null,'CASH')">
    💵 CASH
   </button>

   <button
    class="secondary"
    style="width:100%;margin-top:10px;color:white;font-weight:800;"
    onclick="confirmOrderPayment(null,'CARD')">
    💳 CARD
   </button>

   <button
    class="secondary"
    style="width:100%;margin-top:10px;color:white;font-weight:800;"
    onclick="confirmOrderPayment(null,'MOBILE MONEY')">
    📱 MOBILE MONEY
   </button>

  </div>

 </div>`;

};

window.confirmOrderPayment=async function confirmOrderPayment(number,paymentMethod){

 if(!v2PendingCheckout){
  return alert("No checkout is currently waiting for payment.");
 }

 const pending=v2PendingCheckout;

 const orderUuid=
  `cashier-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;

 const items=pending.cart.map(item=>({
  item_name:item.name,
  quantity:Number(item.qty||1),
  unit_price:Number(itemUnitPrice(item)||0),
  notes:v2OrderNotes(item)
 }));

 try{

  const response=await fetch("/api/orders-with-inventory",{
   method:"POST",
   headers:{
    "Content-Type":"application/json"
   },
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
   if(response.status===409 && responseData.error==="insufficient inventory"){
    const shortages=Array.isArray(responseData.shortages)?responseData.shortages:[];
    const lines=shortages.map(item=>
     `${item.name}: need ${Number(item.required).toLocaleString()}, available ${Number(item.available).toLocaleString()}`
    );
    alert("NOT ENOUGH STOCK\n\n"+(lines.join("\n")||"One or more tracked ingredients are out of stock."));
    return;
   }
   throw new Error(responseData.error||"Unable to create backend order");
  }

  const created=responseData;

  const acceptResponse=await fetch(`/api/orders/${created.id}/status`,{
   method:"PATCH",
   headers:{
    "Content-Type":"application/json"
   },
   body:JSON.stringify({status:"ACCEPTED"})
  });

  if(!acceptResponse.ok){
   throw new Error("Unable to send cashier order to kitchen");
  }

  if(currentDraftId){
   draftOrders=draftOrders.filter(d=>d.id!==currentDraftId);
  }

  addShiftSale(Number(pending.total||0),created.order_number,paymentMethod);

  if(paymentMethod==="CARD"){
   addOwnerDigitalTransaction(
    "CARD",
    "IN",
    Number(pending.total||0),
    `Card sale - Order #${padOrder(created.order_number)}`,
    "SALE",
    `ORDER_${created.order_number}`
   );
  }else if(paymentMethod==="MOBILE MONEY"){
   addOwnerDigitalTransaction(
    "MOBILE MONEY",
    "IN",
    Number(pending.total||0),
    `Mobile Money sale - Order #${padOrder(created.order_number)}`,
    "SALE",
    `ORDER_${created.order_number}`
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

    <div class="logo">
     MR K BURGERS
     <span>ORDER PAID</span>
    </div>

    <div class="panel">

     <h1>Order #${padOrder(created.order_number)}</h1>

     <div class="system-note">
      Order saved, inventory updated, and sent directly to the kitchen.
     </div>

     <div class="info-row">
      <span>Payment</span>
      <strong>${esc(paymentMethod)}</strong>
     </div>

     <div class="info-row">
      <span>Total</span>
      <strong>${Number(pending.total||0).toLocaleString()} CFA</strong>
     </div>

     <button
      class="primary"
      style="width:100%;margin-top:18px"
      onclick="showActiveOrders()">
      VIEW ACTIVE ORDERS
     </button>

     <button
      class="secondary"
      style="width:100%;margin-top:10px"
      onclick="home()">
      DONE
     </button>

    </div>

   </div>`;

 }catch(error){
  alert(error.message||"Unable to save or send this order to the restaurant server.");
 }

};

window.showActiveOrders=async function showActiveOrders(){

 currentBackendOrderDetailId=null;

 document.getElementById("root").innerHTML=`

 <div class="app">

  <button class="back" onclick="home()">
   ← BACK
  </button>

  <div class="logo">
   MR K BURGERS
   <span>ACTIVE ORDERS</span>
  </div>

  <div class="panel">
   <p class="muted">Loading orders...</p>
  </div>

 </div>`;

 try{

  const response=await fetch("/api/orders");

  if(!response.ok){
   throw new Error("Unable to load orders");
  }

  const orders=await response.json();

  const activeBackendOrders=
   orders
   .filter(order=>
    !["COMPLETED","CANCELLED"].includes(order.status)
   )
   .sort((a,b)=>Number(b.order_number)-Number(a.order_number));

  document.querySelector(".panel").innerHTML=

   activeBackendOrders.length
   ?activeBackendOrders.map(order=>`

    <div
     class="order-card clickable"
     onclick="activeOrderDetail(${Number(order.id)})">

     <div class="order-top">
      <div>
       <div class="order-number">
        #${padOrder(order.order_number)}
       </div>
       <div class="muted">
        ${esc(order.order_type||"")}
       </div>
      </div>

      <span class="status ${order.status==="READY"?"ready":""}">
       ${esc(order.status||"NEW")}
      </span>
     </div>

     <div class="info-row">
      <span>Payment</span>
      <strong>${esc(order.payment_status||"PENDING")}</strong>
     </div>

     <div class="info-row">
      <span>Total</span>
      <strong>${Number(order.total_amount||0).toLocaleString()} CFA</strong>
     </div>

     <h3>Items</h3>

     ${
      Array.isArray(order.items) && order.items.length
      ?order.items.map(item=>`
       <div class="summary">
        <strong>
         ${Number(item.quantity||0)} × ${esc(item.item_name||"")}
        </strong>
        ${item.notes?`
         <div class="muted">${esc(item.notes)}</div>
        `:""}
       </div>
      `).join("")
      :`<p class="muted">No item details available.</p>`
     }

     ${
      order.status==="NEW"
      ?`
       <button
        class="primary"
        style="width:100%;margin-top:14px"
        onclick="event.stopPropagation();acceptBackendOrderFromList(${Number(order.id)})">
        ACCEPT ORDER
       </button>
      `
      :""
     }

     ${
      order.status==="READY"
      ?`
       <button
        class="green"
        style="width:100%;margin-top:14px"
        onclick="event.stopPropagation();completeBackendOrderFromList(${Number(order.id)})">
        COMPLETE ORDER
       </button>
      `
      :""
     }

    </div>

   `).join("")
   :`<p class="muted">No active orders.</p>`;

 }catch(error){

  document.querySelector(".panel").innerHTML=`
   <div class="system-note">
    Unable to load orders from the restaurant server.
   </div>
  `;

 }

};

window.acceptBackendOrderFromList=async function acceptBackendOrderFromList(id){

 try{

  const response=await fetch(`/api/orders/${id}/status`,{
   method:"PATCH",
   headers:{
    "Content-Type":"application/json"
   },
   body:JSON.stringify({status:"ACCEPTED"})
  });

  if(!response.ok){
   throw new Error("Unable to accept order");
  }

  await showActiveOrders();
  refreshCashierDashboardCounts();

 }catch(error){
  alert("Unable to accept this order.");
 }

};

window.completeBackendOrderFromList=async function completeBackendOrderFromList(id){

 try{

  const response=await fetch(`/api/orders/${id}/status`,{
   method:"PATCH",
   headers:{
    "Content-Type":"application/json"
   },
   body:JSON.stringify({status:"COMPLETED"})
  });

  if(!response.ok){
   throw new Error("Unable to complete order");
  }

  await showActiveOrders();
  refreshCashierDashboardCounts();

 }catch(error){
  alert("Unable to complete this order.");
 }

};

/* V2 MENU RECOVERY FALLBACK */

const v2RecoveredMenu=[
 ["Mr K Classic","burgers",3000],
 ["Mushroom & Swiss","burgers",5500],
 ["Honky Tonk","burgers",5000],
 ["Philly Cheesesteak","burgers",5500],
 ["Only The Brave","burgers",9000],
 ["Bohemian","burgers",5000],
 ["Chicken Chimichurri","burgers",5500],
 ["French Fries","sides",1000],
 ["Plantain Tostones","sides",1000],
 ["Onion Rings","sides",1000],
 ["Cheese Fries","sides",3500],
 ["Fajita Cheese Fries","sides",4500],
 ["Dirty Fries","sides",4500],
 ["Mr K Coleslaw","salads",1000],
 ["Cheeseburger Salad","salads",3500],
 ["Small Water","softDrinks",500],
 ["Big Water","softDrinks",1000],
 ["Coca Cola","softDrinks",1000],
 ["Sprite","softDrinks",1000],
 ["Fanta","softDrinks",1000],
 ["Mr K Sauce","sauces",500],
 ["Chimichurri","sauces",500],
 ["Ketchup","sauces",0],
 ["Mayonnaise","sauces",0],
 ["Honey Mustard","sauces",500],
 ["Honey BBQ","sauces",500]
];

const v2RecoveredCategoryIcons={
 burgers:"🍔",
 sides:"🍟",
 salads:"🥗",
 softDrinks:"🥤",
 sauces:"🥣"
};

function recoverV2MenuIfNeeded(){

 if(!Array.isArray(ownerMenuData) || ownerMenuData.length===0){
  ownerMenuData=v2RecoveredMenu.map(([name,category,price],index)=>({
   id:`v2-recovered-${index+1}`,
   name,
   category,
   price,
   ingredientIds:[],
   ingredientQuantities:{},
   removableIngredientIds:[],
   allowedExtraIds:[],
   active:true,
   createdAt:Date.now()+index
  }));
  saveOwnerMenuData();
 }

 if(Array.isArray(menuCategoryData)){
  menuCategoryData.forEach(category=>{
   if(v2RecoveredCategoryIcons[category.id]){
    category.icon=v2RecoveredCategoryIcons[category.id];
    category.active=true;
   }
  });
  saveMenuCategories();
 }

}

recoverV2MenuIfNeeded();
