function v2OrderTimestamp(value){
 if(!value)return 0;
 const text=String(value).trim();
 const normalized=/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)
  ?text.replace(" ","T")+"Z"
  :text;
 const parsed=new Date(normalized).getTime();
 return Number.isFinite(parsed)?parsed:0;
}

function v2FormatOrderDuration(milliseconds){
 const totalSeconds=Math.max(0,Math.floor(Number(milliseconds||0)/1000));
 const hours=Math.floor(totalSeconds/3600);
 const minutes=Math.floor((totalSeconds%3600)/60);
 const seconds=totalSeconds%60;
 return hours>0
  ?`${String(hours).padStart(2,"0")}:${String(minutes).padStart(2,"0")}:${String(seconds).padStart(2,"0")}`
  :`${String(minutes).padStart(2,"0")}:${String(seconds).padStart(2,"0")}`;
}

function v2OrderDuration(order){
 const start=v2OrderTimestamp(order.created_at);
 const end=order.ready_at?v2OrderTimestamp(order.ready_at):Date.now();
 return start?Math.max(0,end-start):0;
}

function v2RefreshKitchenTimers(){
 document.querySelectorAll("[data-order-created-at]").forEach(element=>{
  const start=v2OrderTimestamp(element.dataset.orderCreatedAt);
  const readyAt=v2OrderTimestamp(element.dataset.orderReadyAt||"");
  const end=readyAt||Date.now();
  element.textContent=v2FormatOrderDuration(start?end-start:0);
 });
}

window.kitchenHome=async function kitchenHome(){

 clearInterval(timerInterval);

 document.getElementById("root").innerHTML=`

 <div class="app">

  <div class="kitchen-title">
   ${header("KITCHEN DISPLAY")}
  </div>

  <div class="panel">

   <span class="badge">
    👨‍🍳 LIVE KITCHEN
   </span>

   <h1>Kitchen Orders</h1>

   <p class="muted">Loading kitchen orders...</p>

  </div>

 </div>`;

 try{

  const response=await fetch("/api/orders");

  if(!response.ok){
   throw new Error("Unable to load kitchen orders");
  }

  const orders=await response.json();

  const kitchenOrders=
   orders
   .filter(order=>
    ["ACCEPTED","PREPARING"].includes(order.status)
   )
   .sort(
    (a,b)=>
    Number(b.order_number)-
    Number(a.order_number)
   );

  document.querySelector(".panel").innerHTML=`

   <span class="badge">
    👨‍🍳 LIVE KITCHEN
   </span>

   <h1>Kitchen Orders</h1>

   ${
    kitchenOrders.length
    ?kitchenOrders.map(kitchenCard).join("")
    :`<p class="muted">
      No orders waiting in the kitchen.
     </p>`
   }

  `;

  v2RefreshKitchenTimers();
  timerInterval=setInterval(v2RefreshKitchenTimers,1000);

 }catch(error){

  document.querySelector(".panel").innerHTML=`

   <div class="system-note">
    Unable to load kitchen orders from the restaurant server.
   </div>

  `;

 }

};

window.kitchenCard=function kitchenCard(order){

 return `

 <div class="order-card">

  <div class="order-top">

   <div>

    <div class="order-number">
     #${padOrder(order.order_number)}
    </div>

    <h2>
     ${esc(order.order_type||"")}
    </h2>

   </div>

   <div style="text-align:right">
    <span class="status">
     ${esc(order.status||"ACCEPTED")}
    </span>
    <div
     class="timer"
     style="margin-top:10px"
     data-order-created-at="${esc(order.created_at||"")}"
     data-order-ready-at="${esc(order.ready_at||"")}">
     ${v2FormatOrderDuration(v2OrderDuration(order))}
    </div>
   </div>

  </div>

  <div class="summary">

   ${
    Array.isArray(order.items) && order.items.length

    ?order.items.map(item=>`

     <div class="kitchen-item">

      ${Number(item.quantity||0)} × ${esc(item.item_name||"")}

      ${
       item.notes
       ?`
        <div class="muted">
         ${esc(item.notes)}
        </div>
       `
       :""
      }

     </div>

    `).join("")

    :`<p class="muted">
      No item details available.
     </p>`
   }

  </div>

  <div class="actions">

   ${
    order.status==="ACCEPTED"
    ?`
     <button
      class="primary"
      onclick="updateKitchenOrderStatus(${Number(order.id)},'PREPARING')">
      START PREPARING
     </button>
    `
    :""
   }

   ${
    order.status==="PREPARING"
    ?`
     <button
      class="green"
      onclick="updateKitchenOrderStatus(${Number(order.id)},'READY')">
      MARK READY
     </button>
    `
    :""
   }

  </div>

 </div>`;

};

window.updateKitchenOrderStatus=async function updateKitchenOrderStatus(id,status){

 try{

  const response=await fetch(
   `/api/orders/${id}/status`,
   {
    method:"PATCH",
    headers:{
     "Content-Type":"application/json"
    },
    body:JSON.stringify({
     status
    })
   }
  );

  const data=await response.json().catch(()=>({}));

  if(!response.ok){
   throw new Error(data.error||"Unable to update kitchen order");
  }

  await kitchenHome();

 }catch(error){

  alert(error.message||"Unable to update kitchen order status.");

 }

};

function isBackendKitchenScreen(){

 const label=document.querySelector(".logo span");

 return Boolean(
  label &&
  label.textContent.trim()==="KITCHEN DISPLAY"
 );

}

async function refreshCashierDashboardCounts(){

 if(role!=="cashier")return;

 try{

  const response=await fetch("/api/orders");

  if(!response.ok)return;

  const orders=await response.json();

  const activeCount=orders.filter(order=>
   ["NEW","ACCEPTED","PREPARING","READY"].includes(order.status)
  ).length;

  const today=new Date();

  const completedToday=orders.filter(order=>{
   if(order.status!=="COMPLETED" || !order.completed_at)return false;
   const date=new Date(`${order.completed_at}Z`);
   return (
    date.getFullYear()===today.getFullYear() &&
    date.getMonth()===today.getMonth() &&
    date.getDate()===today.getDate()
   );
  }).length;

  document.querySelectorAll(".card").forEach(card=>{
   const title=card.querySelector("h3")?.textContent.trim();
   const count=card.querySelector("strong");

   if(!count)return;

   if(title==="ACTIVE ORDERS"){
    count.textContent=activeCount;
   }

   if(title==="ORDER HISTORY"){
    count.textContent=completedToday;
   }
  });

 }catch(error){
  console.error("Unable to refresh cashier dashboard counts",error);
 }

}

window.showOrderHistory=async function showOrderHistory(){

 clearInterval(timerInterval);

 document.getElementById("root").innerHTML=`

 <div class="app">

  <button class="back" onclick="home()">
   ← BACK
  </button>

  <div class="logo">
   MR K BURGERS
   <span>ORDER HISTORY</span>
  </div>

  <div class="panel">
   <p class="muted">Loading completed orders...</p>
  </div>

 </div>`;

 try{

  const response=await fetch("/api/orders?status=COMPLETED");

  if(!response.ok){
   throw new Error("Unable to load order history");
  }

  const orders=await response.json();

  orders.sort((a,b)=>Number(b.id)-Number(a.id));

  document.querySelector(".panel").innerHTML=`

   ${
    orders.length
    ?orders.map(order=>`

     <div
      class="order-card clickable"
      onclick="backendOrderHistoryDetail(${Number(order.id)})">

      <div class="order-top">

       <div>
        <div class="order-number">
         #${padOrder(order.order_number)}
        </div>
        <div class="muted">
         ${esc(order.order_type||"")}
        </div>
       </div>

       <span class="status completed">
        COMPLETED
       </span>

      </div>

      <div class="info-row">
       <span>Payment</span>
       <strong>${esc(order.payment_status||"PENDING")}</strong>
      </div>

      <div class="info-row">
       <span>Preparation Time</span>
       <strong>${v2FormatOrderDuration(v2OrderDuration(order))}</strong>
      </div>

      <div class="info-row">
       <span>Total</span>
       <strong>${Number(order.total_amount||0).toLocaleString()} CFA</strong>
      </div>

     </div>

    `).join("")
    :`<p class="muted">No completed orders.</p>`
   }

  `;

 }catch(error){

  document.querySelector(".panel").innerHTML=`
   <div class="system-note">
    Unable to load order history from the restaurant server.
   </div>
  `;

 }

};

window.backendOrderHistoryDetail=async function backendOrderHistoryDetail(id){

 document.getElementById("root").innerHTML=`

 <div class="app">

  <button class="back" onclick="showOrderHistory()">
   ← BACK
  </button>

  <div class="logo">
   MR K BURGERS
   <span>COMPLETED ORDER</span>
  </div>

  <div class="panel">
   <p class="muted">Loading order...</p>
  </div>

 </div>`;

 try{

  const response=await fetch(`/api/orders/${id}`);

  if(!response.ok){
   throw new Error("Unable to load completed order");
  }

  const order=await response.json();

  document.querySelector(".panel").innerHTML=`

   <div class="order-top">
    <div>
     <div class="order-number">
      #${padOrder(order.order_number)}
     </div>
     <h2>${esc(order.order_type||"")}</h2>
    </div>
    <span class="status completed">COMPLETED</span>
   </div>

   <div class="info-row">
    <span>Payment</span>
    <strong>${esc(order.payment_status||"PENDING")}</strong>
   </div>

   <div class="info-row">
    <span>Method</span>
    <strong>${esc(order.payment_method||"—")}</strong>
   </div>

   <div class="info-row">
    <span>Preparation Time</span>
    <strong>${v2FormatOrderDuration(v2OrderDuration(order))}</strong>
   </div>

   <div class="info-row">
    <span>Total</span>
    <strong>${Number(order.total_amount||0).toLocaleString()} CFA</strong>
   </div>

   ${order.customer_name?`
    <div class="info-row">
     <span>Customer</span>
     <strong>${esc(order.customer_name)}</strong>
    </div>
   `:""}

   ${order.customer_phone?`
    <div class="info-row">
     <span>Phone</span>
     <strong>${esc(order.customer_phone)}</strong>
    </div>
   `:""}

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

  `;

 }catch(error){

  document.querySelector(".panel").innerHTML=`
   <div class="system-note">
    Unable to load this completed order from the restaurant server.
   </div>
  `;

 }

};

const legacyCashierHome=window.home;

window.home=function home(){
 legacyCashierHome();
 refreshCashierDashboardCounts();
};

socket.on("order-created",()=>{
 refreshCashierDashboardCounts();
});

socket.on("order-status-changed",()=>{

 if(isBackendKitchenScreen()){
  kitchenHome();
 }

 refreshCashierDashboardCounts();

});

socket.on("order-payment-status-changed",()=>{
 refreshCashierDashboardCounts();
});
