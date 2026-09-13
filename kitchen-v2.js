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
    Number(a.order_number)-
    Number(b.order_number)
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

   <span class="status">
    ${esc(order.status||"ACCEPTED")}
   </span>

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

  if(!response.ok){
   throw new Error("Unable to update kitchen order");
  }

  await kitchenHome();

 }catch(error){

  alert("Unable to update kitchen order status.");

 }

};

function isBackendKitchenScreen(){

 const label=document.querySelector(".logo span");

 return Boolean(
  label &&
  label.textContent.trim()==="KITCHEN DISPLAY"
 );

}

socket.on("order-status-changed",()=>{

 if(isBackendKitchenScreen()){
  kitchenHome();
 }

});
