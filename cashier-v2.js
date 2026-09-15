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

  addShiftSale(Number(pending.total||0),created.order_number,paymentMethod,created.id);

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
      ["NEW","ACCEPTED"].includes(order.status)
      ?`
       <button
        class="danger"
        style="width:100%;margin-top:10px"
        onclick="event.stopPropagation();cancelBackendOrderFromList(${Number(order.id)})">
        CANCEL & REFUND ORDER
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

window.cancelBackendOrderFromList=async function cancelBackendOrderFromList(id){
 if(!confirm("Cancel and refund this order?"))return;

 try{
  const response=await fetch(`/api/orders/${id}/cancel`,{
   method:"POST",
   headers:{"Content-Type":"application/json"}
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
   throw new Error(data.error||"Unable to cancel order");
  }
  await showActiveOrders();
  refreshCashierDashboardCounts();
  if(typeof v2FetchOwnerAccounts==="function"){
   v2FetchOwnerAccounts().catch(()=>{});
  }
  if(typeof v2HydrateShiftState==="function"){
   v2HydrateShiftState().catch(()=>{});
  }
 }catch(error){
  alert(error.message||"Unable to cancel this order.");
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

  const data=await response.json().catch(()=>({}));

  if(!response.ok){
   throw new Error(data.error||"Unable to accept order");
  }

  await showActiveOrders();
  refreshCashierDashboardCounts();

 }catch(error){
  alert(error.message||"Unable to accept this order.");
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

  const data=await response.json().catch(()=>({}));

  if(!response.ok){
   throw new Error(data.error||"Unable to complete order");
  }

  await showActiveOrders();
  refreshCashierDashboardCounts();

 }catch(error){
  alert(error.message||"Unable to complete this order.");
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

/* CASHIER COMBO FLOW */
let v2CashierComboState=null;
let v2CashierComboDraft=null;

async function v2LoadCashierCombos(force=false){
 if(v2CashierComboState&&!force)return v2CashierComboState;
 const response=await fetch("/api/combos/state",{cache:"no-store"});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.error||"Unable to load combos");
 v2CashierComboState=data;
 return data;
}

function v2CashierComboItem(itemId){
 return ownerMenuData.find(item=>item.id===itemId)||null;
}

function v2CashierComboIngredientName(id){
 return menuIngredients.find(item=>item.id===id)?.name||id;
}

function v2CashierComboCustomization(key){
 if(!v2CashierComboDraft.customizations[key]){
  v2CashierComboDraft.customizations[key]={removed:[],extras:{}};
 }
 return v2CashierComboDraft.customizations[key];
}

function v2CashierComboChoiceCounts(groupId){
 if(!v2CashierComboDraft.choice_counts[groupId]){
  v2CashierComboDraft.choice_counts[groupId]={};
 }
 return v2CashierComboDraft.choice_counts[groupId];
}

function v2CashierComboCustomizationHtml(itemId,key,title){
 const item=v2CashierComboItem(itemId);
 if(!item)return `<div class="card"><strong>${esc(title||"Item")}</strong><div class="no-item">Item unavailable</div></div>`;
 const custom=v2CashierComboCustomization(key);
 const removable=(item.removableIngredientIds||[]).map(id=>({id,name:v2CashierComboIngredientName(id)}));
 const extras=(item.allowedExtraIds||[])
  .map(id=>ownerMenuData.find(entry=>entry.id===id))
  .filter(extra=>extra&&extra.active!==false);
 return `<div class="card" style="margin:10px 0">
  <h3>${esc(title||item.name)}</h3>
  ${removable.length?`<div class="muted">Remove ingredients</div>${removable.map(ingredient=>`
   <div class="ingredient-row">
    <input type="checkbox" ${custom.removed.includes(ingredient.name)?"checked":""} onchange="v2CashierComboToggleRemoved('${esc(key)}','${esc(ingredient.name)}',this.checked)">
    <label>Remove ${esc(ingredient.name)}</label>
   </div>`).join("")}`:""}
  ${extras.length?`<div class="muted" style="margin-top:10px">Paid extras</div>${extras.map(extra=>{
   const qty=Number(custom.extras[extra.id]||0);
   return `<div class="extra-row">
    <div class="extra-name">${esc(extra.name)} — ${Number(extra.price||0).toLocaleString()} CFA</div>
    <div class="extra-qty">
     <button onclick="v2CashierComboExtra('${esc(key)}','${esc(extra.id)}',-1)">−</button>
     <strong>${qty}</strong>
     <button onclick="v2CashierComboExtra('${esc(key)}','${esc(extra.id)}',1)">+</button>
    </div>
   </div>`;
  }).join("")}`:""}
 </div>`;
}

window.v2CashierComboToggleRemoved=function v2CashierComboToggleRemoved(key,name,checked){
 const custom=v2CashierComboCustomization(key);
 custom.removed=custom.removed.filter(value=>value!==name);
 if(checked)custom.removed.push(name);
};

window.v2CashierComboExtra=function v2CashierComboExtra(key,extraId,delta){
 const custom=v2CashierComboCustomization(key);
 custom.extras[extraId]=Math.max(0,Number(custom.extras[extraId]||0)+Number(delta||0));
 v2RenderCashierComboBuilder();
};

function v2CashierComboChoiceTotal(group){
 const counts=v2CashierComboChoiceCounts(group.id);
 return Object.values(counts).reduce((sum,value)=>sum+Number(value||0),0);
}

window.v2CashierComboChoice=function v2CashierComboChoice(groupId,itemId,delta){
 const combo=v2CashierComboDraft?.combo;
 const group=(combo?.choice_groups||[]).find(entry=>entry.id===groupId);
 if(!group)return;
 const counts=v2CashierComboChoiceCounts(groupId);
 const current=Number(counts[itemId]||0);
 const total=v2CashierComboChoiceTotal(group);
 if(Number(delta)>0){
  if(total>=Number(group.selection_count||1))return;
  if(!group.allow_duplicates&&current>=1)return;
  counts[itemId]=current+1;
 }else{
  counts[itemId]=Math.max(0,current-1);
 }
 v2RenderCashierComboBuilder();
};

function v2CashierComboSelectedInstances(){
 const combo=v2CashierComboDraft.combo;
 const instances=[];
 (combo.components||[]).forEach(component=>{
  for(let i=0;i<Number(component.quantity||1);i++){
   instances.push({
    key:`fixed:${component.menu_item_id}:${i+1}`,
    item_id:component.menu_item_id,
    name:component.name,
    group_name:null,
    fixed:true
   });
  }
 });
 (combo.choice_groups||[]).forEach(group=>{
  const counts=v2CashierComboChoiceCounts(group.id);
  (group.items||[]).forEach(item=>{
   const qty=Number(counts[item.menu_item_id]||0);
   for(let i=0;i<qty;i++){
    instances.push({
     key:`choice:${group.id}:${item.menu_item_id}:${i+1}`,
     item_id:item.menu_item_id,
     name:item.name,
     group_name:group.name,
     fixed:false
    });
   }
  });
 });
 const categories=new Map((v2CashierComboState?.categories||[]).map((category,index)=>[category.id,Number(category.sort_order??index)]));
 const stateItems=new Map((v2CashierComboState?.items||[]).map(item=>[item.id,item]));
 return instances.sort((a,b)=>{
  const itemA=stateItems.get(a.item_id)||{};
  const itemB=stateItems.get(b.item_id)||{};
  const categoryDiff=(categories.get(itemA.category_id)??999999)-(categories.get(itemB.category_id)??999999);
  if(categoryDiff)return categoryDiff;
  const itemDiff=Number(itemA.sort_order??999999)-Number(itemB.sort_order??999999);
  if(itemDiff)return itemDiff;
  return String(a.name).localeCompare(String(b.name));
 });
}

window.v2RenderCashierComboBuilder=function v2RenderCashierComboBuilder(){
 const draft=v2CashierComboDraft;
 if(!draft?.combo)return;
 const combo=draft.combo;
 const fixedInstances=[];
 (combo.components||[]).forEach(component=>{
  for(let i=0;i<Number(component.quantity||1);i++){
   fixedInstances.push({key:`fixed:${component.menu_item_id}:${i+1}`,item_id:component.menu_item_id,name:component.name,index:i+1,quantity:Number(component.quantity||1)});
  }
 });
 document.getElementById("root").innerHTML=`
  <div class="app">
   <button class="back" onclick="v2OpenCashierComboCategory('${esc(combo.category_id)}')">← BACK</button>
   <div class="logo">MR K BURGERS<span>COMBO</span></div>
   <div class="panel">
    <h1>${esc(combo.name)}</h1>
    ${combo.description?`<p class="muted">${esc(combo.description)}</p>`:""}
    <div class="info-row"><span>Combo Price</span><strong>${Number(combo.price||0).toLocaleString()} CFA</strong></div>
    <h3 style="margin-top:22px">Fixed Components</h3>
    ${fixedInstances.map(instance=>v2CashierComboCustomizationHtml(instance.item_id,instance.key,instance.quantity>1?`${instance.name} #${instance.index}`:instance.name)).join("")}
    ${(combo.choice_groups||[]).map(group=>{
     const counts=v2CashierComboChoiceCounts(group.id);
     const total=v2CashierComboChoiceTotal(group);
     const required=Number(group.selection_count||1);
     return `<div class="card" style="margin-top:18px">
      <h3>${esc(group.name)} — Choose ${required}</h3>
      <p class="muted">Selected ${total} / ${required}${group.allow_duplicates?" — same item may be chosen more than once":""}</p>
      ${(group.items||[]).filter(item=>item.active!==false).map(item=>{
       const qty=Number(counts[item.menu_item_id]||0);
       return `<div class="extra-row">
        <div class="extra-name">${esc(item.name)}</div>
        <div class="extra-qty">
         <button onclick="v2CashierComboChoice('${esc(group.id)}','${esc(item.menu_item_id)}',-1)">−</button>
         <strong>${qty}</strong>
         <button onclick="v2CashierComboChoice('${esc(group.id)}','${esc(item.menu_item_id)}',1)">+</button>
        </div>
       </div>`;
      }).join("")}
      ${v2CashierComboSelectedInstances().filter(instance=>instance.group_name===group.name).map(instance=>v2CashierComboCustomizationHtml(instance.item_id,instance.key,instance.name)).join("")}
     </div>`;
    }).join("")}
    <button class="primary" style="width:100%;margin-top:22px" onclick="v2AddCashierComboToCart()">ADD COMBO TO ORDER</button>
   </div>
  </div>`;
};

window.v2OpenCashierCombo=function v2OpenCashierCombo(comboId){
 const combo=(v2CashierComboState?.combos||[]).find(entry=>entry.id===comboId&&entry.active);
 if(!combo)return alert("Combo unavailable.");
 v2CashierComboDraft={combo:JSON.parse(JSON.stringify(combo)),choice_counts:{},customizations:{}};
 (combo.choice_groups||[]).forEach(group=>{v2CashierComboDraft.choice_counts[group.id]={};});
 v2RenderCashierComboBuilder();
};

window.v2OpenCashierComboCategory=async function v2OpenCashierComboCategory(categoryId){
 try{
  const state=await v2LoadCashierCombos(true);
  const category=(state.categories||[]).find(entry=>entry.id===categoryId&&entry.category_type==="combo"&&entry.active);
  if(!category)throw new Error("Combo category unavailable");
  currentCategory=categoryId;
  const combos=(state.combos||[]).filter(combo=>combo.category_id===categoryId&&combo.active);
  document.getElementById("root").innerHTML=`
   <div class="app">
    <button class="back" onclick="menuCategories()">← BACK</button>
    <div class="logo">MR K BURGERS<span>${esc(category.name.toUpperCase())}</span></div>
    <div class="panel">
     <h2>${esc(category.name)}</h2>
     <div class="grid">
      ${combos.length?combos.map(combo=>{
       const fixedOkay=(combo.components||[]).every(component=>component.active!==false);
       const choiceOkay=(combo.choice_groups||[]).every(group=>{
        const active=(group.items||[]).filter(item=>item.active!==false).length;
        return active>=1&&(group.allow_duplicates||active>=Number(group.selection_count||1));
       });
       const available=fixedOkay&&choiceOkay;
       return `<div class="card">
        <h3>${esc(combo.name)}</h3>
        ${combo.description?`<p class="muted">${esc(combo.description)}</p>`:""}
        <p><strong>${Number(combo.price||0).toLocaleString()} CFA</strong></p>
        <p class="muted">${(combo.components||[]).map(component=>`${Number(component.quantity||1)} × ${esc(component.name)}`).join("<br>")}</p>
        ${(combo.choice_groups||[]).map(group=>`<p class="muted">${esc(group.name)}: choose ${Number(group.selection_count||1)}</p>`).join("")}
        <button class="primary" style="width:100%" ${available?`onclick="v2OpenCashierCombo('${esc(combo.id)}')"`:`disabled`}>${available?"SELECT COMBO":"UNAVAILABLE"}</button>
       </div>`;
      }).join(""):`<div class="card"><p class="muted">No active combos.</p></div>`}
     </div>
    </div>
   </div>`;
 }catch(error){alert(error.message||"Unable to load combo category.");}
};

window.v2AddCashierComboToCart=function v2AddCashierComboToCart(){
 const draft=v2CashierComboDraft;
 if(!draft?.combo)return;
 for(const group of draft.combo.choice_groups||[]){
  const total=v2CashierComboChoiceTotal(group);
  const required=Number(group.selection_count||1);
  if(total!==required){
   alert(`${group.name}: choose exactly ${required}.`);
   return;
  }
 }
 const components=v2CashierComboSelectedInstances().map(instance=>{
  const custom=v2CashierComboCustomization(instance.key);
  const extras=Object.entries(custom.extras||{})
   .filter(([,qty])=>Number(qty)>0)
   .map(([extraId,qty])=>{
    const extra=ownerMenuData.find(item=>item.id===extraId);
    return {item_id:extraId,name:extra?.name||extraId,qty:Number(qty),unit_price:Number(extra?.price||0)};
   });
  return {
   item_id:instance.item_id,
   name:instance.name,
   group_name:instance.group_name,
   removed:[...(custom.removed||[])],
   extras
  };
 });
 cart.push({
  name:draft.combo.name,
  qty:1,
  comboId:draft.combo.id,
  comboBasePrice:Number(draft.combo.price||0),
  comboComponents:components,
  removed:[],
  extras:[]
 });
 v2CashierComboDraft=null;
 viewCart();
};

const v2ComboOriginalOpenCategory=window.openCategory;
window.openCategory=async function openCategory(categoryId){
 try{
  const state=await v2LoadCashierCombos(true);
  const category=(state.categories||[]).find(entry=>entry.id===categoryId);
  if(category?.category_type==="combo")return v2OpenCashierComboCategory(categoryId);
 }catch(error){console.error("Combo category check failed",error);}
 return v2ComboOriginalOpenCategory(categoryId);
};

const v2ComboOriginalItemUnitPrice=window.itemUnitPrice;
window.itemUnitPrice=function itemUnitPrice(item){
 if(item?.comboId){
  const extras=(item.comboComponents||[]).reduce((sum,component)=>
   sum+(component.extras||[]).reduce((extraSum,extra)=>extraSum+Number(extra.qty||0)*Number(extra.unit_price||0),0),0);
  return Number(item.comboBasePrice||0)+extras;
 }
 return v2ComboOriginalItemUnitPrice(item);
};

const v2ComboOriginalViewCart=window.viewCart;
window.viewCart=function viewCart(){
 const result=v2ComboOriginalViewCart();
 const comboItems=cart.filter(item=>item.comboId);
 const summaries=[...document.querySelectorAll("#root .summary")];
 const used=new Set();
 comboItems.forEach(item=>{
  const summary=summaries.find((element,index)=>!used.has(index)&&String(element.textContent||"").includes(item.name));
  if(!summary)return;
  used.add(summaries.indexOf(summary));
  if(summary.querySelector(".v2-combo-cart-components"))return;
  const block=document.createElement("div");
  block.className="v2-combo-cart-components muted";
  block.style.marginTop="10px";
  block.style.paddingLeft="12px";
  block.innerHTML=(item.comboComponents||[]).map(component=>{
   const notes=[];
   if(component.group_name)notes.push(component.group_name);
   if((component.removed||[]).length)notes.push(`NO: ${(component.removed||[]).map(esc).join(", ")}`);
   if((component.extras||[]).length)notes.push(`EXTRAS: ${(component.extras||[]).map(extra=>`${Number(extra.qty||1)} × ${esc(extra.name)}`).join(", ")}`);
   return `<div style="margin:5px 0">↳ 1 × ${esc(component.name)}${notes.length?`<div style="padding-left:18px">${notes.join(" | ")}</div>`:""}</div>`;
  }).join("");
  summary.appendChild(block);
 });
 return result;
};

const v2ComboOriginalCheckoutOrder=window.checkoutOrder;
window.checkoutOrder=function checkoutOrder(){
 if(cart.some(item=>item.comboId)){
  alert("Combo selection is ready. Checkout integration with inventory and receipts will be enabled in the next combo step.");
  return;
 }
 return v2ComboOriginalCheckoutOrder();
};
