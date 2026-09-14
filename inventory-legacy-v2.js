let v2LegacyInventorySyncPromise=null;
let v2LegacyInventoryApplying=false;

function v2ReadLocalJson(key,fallback){
 try{
  const raw=localStorage.getItem(key);
  if(raw===null)return fallback;
  const value=JSON.parse(raw);
  return value??fallback;
 }catch(error){
  return fallback;
 }
}

async function v2PutJson(url,body){
 const response=await fetch(url,{
  method:"PUT",
  headers:{"Content-Type":"application/json"},
  body:JSON.stringify(body)
 });
 if(!response.ok){
  const data=await response.json().catch(()=>({}));
  throw new Error(data.error||"Inventory sync failed");
 }
 return response.json().catch(()=>({}));
}

async function v2PostJson(url,body){
 const response=await fetch(url,{
  method:"POST",
  headers:{"Content-Type":"application/json"},
  body:JSON.stringify(body)
 });
 let data={};
 try{data=await response.json();}catch{}
 if(!response.ok){
  const error=new Error(data.error||"Inventory action failed");
  error.status=response.status;
  error.body=data;
  throw error;
 }
 return data;
}

function v2InventoryIngredientSnapshot(){
 return (Array.isArray(menuIngredients)?menuIngredients:[]).map(item=>({
  id:item.id,
  tracked:Boolean(item.tracked),
  lowStockLevel:Number(item.lowStockLevel||0),
  unit:item.unit||"unit"
 }));
}

function v2RebuildLegacyInventoryItems(){
 if(typeof syncTrackedIngredientsToInventory==="function"){
  syncTrackedIngredientsToInventory();
 }
 if(Array.isArray(inventoryItems)){
  inventoryItems.forEach(item=>{
   const value=Number(inventoryStock?.[item.id]);
   inventoryStock[item.id]=Number.isFinite(value)?value:0;
  });
 }
}

async function v2PushInventoryStock(){
 if(v2LegacyInventoryApplying)return;
 try{
  await v2PutJson("/api/inventory/stock-snapshot",{
   stock:inventoryStock&&typeof inventoryStock==="object"?inventoryStock:{},
   ingredients:v2InventoryIngredientSnapshot()
  });
 }catch(error){
  console.error("Backend inventory stock save failed",error);
 }
}

async function v2PushInventoryLegacyState(){
 if(v2LegacyInventoryApplying)return;
 try{
  await v2PutJson("/api/inventory/legacy-state",{
   suppliers:Array.isArray(suppliers)?suppliers:[],
   deliveries:Array.isArray(inventoryDeliveries)?inventoryDeliveries:[],
   movements:Array.isArray(inventoryMovements)?inventoryMovements:[]
  });
 }catch(error){
  console.error("Backend inventory history save failed",error);
 }
}

function v2ApplyInventoryPayload(inventoryPayload,statePayload){
 v2LegacyInventoryApplying=true;
 try{
  const items=Array.isArray(inventoryPayload?.items)?inventoryPayload.items:[];
  inventoryStock={};
  items.forEach(item=>{
   inventoryStock[item.id]=Number(item.stock||0);
   const ingredient=Array.isArray(menuIngredients)
    ?menuIngredients.find(entry=>entry.id===item.id)
    :null;
   if(ingredient){
    ingredient.tracked=Boolean(item.tracked);
    ingredient.lowStockLevel=Number(item.low_stock_level||0);
    ingredient.unit=item.unit||"unit";
   }
  });

  suppliers=Array.isArray(statePayload?.suppliers)?statePayload.suppliers:[];
  inventoryDeliveries=Array.isArray(statePayload?.deliveries)?statePayload.deliveries:[];
  inventoryMovements=Array.isArray(statePayload?.movements)?statePayload.movements:[];

  v2RebuildLegacyInventoryItems();

  localStorage.setItem("mrkInventoryStock",JSON.stringify(inventoryStock));
  localStorage.setItem("mrkSuppliers",JSON.stringify(suppliers));
  localStorage.setItem("mrkInventoryDeliveries",JSON.stringify(inventoryDeliveries));
  localStorage.setItem("mrkInventoryMovements",JSON.stringify(inventoryMovements));
 }finally{
  v2LegacyInventoryApplying=false;
 }
}

async function v2SyncLegacyInventory(force=false){
 if(v2LegacyInventorySyncPromise && !force)return v2LegacyInventorySyncPromise;

 v2LegacyInventorySyncPromise=(async()=>{
  let [inventoryResponse,stateResponse]=await Promise.all([
   fetch("/api/inventory",{cache:"no-store"}),
   fetch("/api/inventory/legacy-state",{cache:"no-store"})
  ]);
  if(!inventoryResponse.ok||!stateResponse.ok){
   throw new Error("Unable to load inventory from restaurant server");
  }

  let inventoryPayload=await inventoryResponse.json();
  let statePayload=await stateResponse.json();

  const localStock=v2ReadLocalJson("mrkInventoryStock",{});
  const localIngredients=v2ReadLocalJson("mrkMenuIngredients",[]);
  const localSuppliers=v2ReadLocalJson("mrkSuppliers",[]);
  const localDeliveries=v2ReadLocalJson("mrkInventoryDeliveries",[]);
  const localMovements=v2ReadLocalJson("mrkInventoryMovements",[]);

  const backendInventoryPristine=(inventoryPayload.items||[]).every(item=>
   Number(item.stock||0)===0 && !item.tracked && Number(item.low_stock_level||0)===0
  );
  const localInventoryHasData=
   Object.values(localStock||{}).some(value=>Number(value||0)!==0) ||
   (Array.isArray(localIngredients)&&localIngredients.some(item=>item.tracked||Number(item.lowStockLevel||0)>0));

  if(backendInventoryPristine && localInventoryHasData){
   await v2PutJson("/api/inventory/stock-snapshot",{
    stock:localStock,
    ingredients:(Array.isArray(localIngredients)?localIngredients:[]).map(item=>({
     id:item.id,
     tracked:Boolean(item.tracked),
     lowStockLevel:Number(item.lowStockLevel||0),
     unit:item.unit||"unit"
    }))
   });
   inventoryResponse=await fetch("/api/inventory",{cache:"no-store"});
   inventoryPayload=await inventoryResponse.json();
  }

  const backendLegacyEmpty=
   !(statePayload.suppliers||[]).length &&
   !(statePayload.deliveries||[]).length &&
   !(statePayload.movements||[]).length;
  const localLegacyHasData=
   localSuppliers.length||localDeliveries.length||localMovements.length;

  if(backendLegacyEmpty && localLegacyHasData){
   await v2PutJson("/api/inventory/legacy-state",{
    suppliers:localSuppliers,
    deliveries:localDeliveries,
    movements:localMovements
   });
   stateResponse=await fetch("/api/inventory/legacy-state",{cache:"no-store"});
   statePayload=await stateResponse.json();
  }

  v2ApplyInventoryPayload(inventoryPayload,statePayload);
  return {inventoryPayload,statePayload};
 })();

 try{
  return await v2LegacyInventorySyncPromise;
 }finally{
  v2LegacyInventorySyncPromise=null;
 }
}

const v2OriginalSaveInventory=saveInventory;
saveInventory=function saveInventory(){
 v2RebuildLegacyInventoryItems();
 v2OriginalSaveInventory();
 v2PushInventoryStock();
};

const v2OriginalSaveSuppliers=saveSuppliers;
saveSuppliers=function saveSuppliers(){
 v2OriginalSaveSuppliers();
 v2PushInventoryLegacyState();
};

const v2OriginalSaveInventoryDeliveries=saveInventoryDeliveries;
saveInventoryDeliveries=function saveInventoryDeliveries(){
 v2OriginalSaveInventoryDeliveries();
 v2PushInventoryLegacyState();
};

const v2OriginalSaveInventoryMovements=saveInventoryMovements;
saveInventoryMovements=function saveInventoryMovements(){
 v2OriginalSaveInventoryMovements();
 v2PushInventoryLegacyState();
};

function v2InventoryActor(){
 const name=String(currentStaffName||"").trim();
 const id=String(currentStaffId||"").trim();
 if(name&&id)return `${name} (${id})`;
 return id||name||(role==="owner"?"Owner":"Manager");
}

async function v2SaveLegacyInventoryHistory(){
 v2OriginalSaveInventoryDeliveries();
 v2OriginalSaveInventoryMovements();
 await v2PutJson("/api/inventory/legacy-state",{
  suppliers:Array.isArray(suppliers)?suppliers:[],
  deliveries:Array.isArray(inventoryDeliveries)?inventoryDeliveries:[],
  movements:Array.isArray(inventoryMovements)?inventoryMovements:[]
 });
}

window.managerAddStock=async function managerAddStock(){
 const supplierId=document.getElementById("stockInSupplier").value;
 const selectedSupplier=suppliers.find(
  supplier=>String(supplier.id)===String(supplierId)
 );
 const supplier=selectedSupplier?selectedSupplier.name:"";
 const reference=document.getElementById("stockInReference").value.trim();
 const note=document.getElementById("stockInNote").value.trim();

 if(!supplierId||!selectedSupplier){
  alert("Please select a supplier.");
  return;
 }
 if(!supplier){
  alert("Please enter the supplier name.");
  return;
 }
 if(!currentDeliveryItems.length){
  alert("Please add at least one item to the delivery.");
  return;
 }

 const deliveryId=Date.now();
 const deliveryItems=[];
 const legacyMovements=[];

 try{
  for(const deliveryItem of currentDeliveryItems){
   const item=inventoryItems.find(i=>i.id===deliveryItem.itemId);
   if(!item)continue;
   const qty=Number(deliveryItem.qty||0);
   if(!Number.isInteger(qty)||qty<=0)continue;

   const detailParts=[
    supplier?`Supplier: ${supplier}`:"",
    reference?`Reference: ${reference}`:"",
    note||""
   ].filter(Boolean);

   const result=await v2PostJson(`/api/inventory/${encodeURIComponent(item.id)}/adjust`,{
    quantity:qty,
    movement_type:"STOCK IN",
    note:detailParts.join(" | ")||null,
    created_by:v2InventoryActor()
   });

   const previousStock=Number(result.stock_before||0);
   const newStock=Number(result.stock_after||0);

   deliveryItems.push({
    itemId:item.id,
    itemName:item.name,
    qty,
    previousStock,
    newStock
   });

   legacyMovements.push({
    id:Date.now()+Math.random(),
    type:"STOCK IN",
    itemId:item.id,
    itemName:item.name,
    qty,
    previousStock,
    newStock,
    supplierId,
    supplier,
    reference,
    note,
    deliveryId,
    actorRole:role==="owner"?"OWNER":"MANAGER",
    actorName:currentStaffName,
    actorStaffId:currentStaffId,
    createdAt:Date.now()
   });
  }

  inventoryMovements.push(...legacyMovements);
  inventoryDeliveries.push({
   id:deliveryId,
   supplierId,
   supplier,
   reference,
   note,
   items:deliveryItems,
   actorRole:role==="owner"?"OWNER":"MANAGER",
   actorName:currentStaffName,
   actorStaffId:currentStaffId,
   createdAt:Date.now()
  });

  await v2SaveLegacyInventoryHistory();
  currentDeliveryItems=[];
  await v2SyncLegacyInventory(true);

  alert("Delivery received successfully.");
  managerStockIn();
 }catch(error){
  console.error("Stock In backend save failed",error);
  alert(
   "Unable to receive this delivery.\n\n"+
   (error?.message||"Please try again.")
  );
 }
};

window.managerRemoveStock=async function managerRemoveStock(){
 const itemId=document.getElementById("stockOutItem").value;
 const qty=Number(document.getElementById("stockOutQty").value);

 if(!itemId){
  alert("Please select an inventory item.");
  return;
 }
 if(!Number.isInteger(qty)||qty<=0){
  alert("Please enter a valid whole-number quantity.");
  return;
 }

 const item=inventoryItems.find(i=>i.id===itemId);
 if(!item){
  alert("Inventory item not found.");
  return;
 }

 const current=Number(inventoryStock[itemId]||0);
 if(qty>current){
  alert(`Not enough ${item.name} in stock. Current stock: ${current}.`);
  return;
 }

 try{
  const result=await v2PostJson(`/api/inventory/${encodeURIComponent(itemId)}/adjust`,{
   quantity:-qty,
   movement_type:"STOCK OUT",
   note:null,
   created_by:v2InventoryActor()
  });

  inventoryMovements.push({
   id:Date.now(),
   type:"STOCK OUT",
   itemId,
   itemName:item.name,
   qty:-qty,
   previousStock:Number(result.stock_before||0),
   newStock:Number(result.stock_after||0),
   actorRole:role==="owner"?"OWNER":"MANAGER",
   actorName:currentStaffName,
   actorStaffId:currentStaffId,
   createdAt:Date.now()
  });

  await v2SaveLegacyInventoryHistory();
  await v2SyncLegacyInventory(true);

  alert(`${item.name}: -${qty} units removed.`);
  managerStockOut();
 }catch(error){
  console.error("Stock Out backend save failed",error);
  const message=error?.status===409
   ?`Not enough ${item.name} in stock.`
   :(error?.message||"Please try again.");
  alert("Unable to remove stock.\n\n"+message);
 }
};

window.managerRecordWaste=async function managerRecordWaste(){
 const itemId=document.getElementById("wasteItem").value;
 const qty=Number(document.getElementById("wasteQty").value);
 const reason=document.getElementById("wasteReason").value;

 if(!itemId){
  alert("Please select an inventory item.");
  return;
 }
 if(!Number.isInteger(qty)||qty<=0){
  alert("Please enter a valid whole-number quantity.");
  return;
 }
 if(!reason){
  alert("Please select a reason.");
  return;
 }

 const item=inventoryItems.find(i=>i.id===itemId);
 if(!item){
  alert("Inventory item not found.");
  return;
 }

 const current=Number(inventoryStock[itemId]||0);
 if(qty>current){
  alert(`Not enough ${item.name} in stock. Current stock: ${current}.`);
  return;
 }

 try{
  const result=await v2PostJson(`/api/inventory/${encodeURIComponent(itemId)}/adjust`,{
   quantity:-qty,
   movement_type:"WASTE / ADJUSTMENT",
   note:reason,
   created_by:v2InventoryActor()
  });

  inventoryMovements.push({
   id:Date.now(),
   type:"WASTE / ADJUSTMENT",
   itemId,
   itemName:item.name,
   qty:-qty,
   previousStock:Number(result.stock_before||0),
   newStock:Number(result.stock_after||0),
   reason,
   actorRole:role==="owner"?"OWNER":"MANAGER",
   actorName:currentStaffName,
   actorStaffId:currentStaffId,
   createdAt:Date.now()
  });

  await v2SaveLegacyInventoryHistory();
  await v2SyncLegacyInventory(true);

  alert(`${item.name}: -${qty} units recorded as ${reason}.`);
  managerWasteAdjustment();
 }catch(error){
  console.error("Waste adjustment backend save failed",error);
  const message=error?.status===409
   ?`Not enough ${item.name} in stock.`
   :(error?.message||"Please try again.");
  alert("Unable to record waste / adjustment.\n\n"+message);
 }
};

function v2WrapInventoryScreen(functionName){
 const original=window[functionName];
 if(typeof original!=="function")return;
 window[functionName]=async function(...args){
  try{
   await v2SyncLegacyInventory(true);
  }catch(error){
   console.error(error);
   alert("Unable to load inventory from the restaurant server.");
   return;
  }
  v2RebuildLegacyInventoryItems();
  return original.apply(this,args);
 };
}

[
 "managerCurrentStock",
 "managerStockIn",
 "managerStockOut",
 "managerWasteAdjustment",
 "managerDeliveryHistory",
 "managerLowStock",
 "managerProductAvailability",
 "ownerSuppliers"
].forEach(v2WrapInventoryScreen);

const v2OriginalManagerStockHistory=window.managerStockHistory;
window.managerStockHistory=async function managerStockHistory(selectedDate,selectedSupplierId){
 const firstOpen=selectedDate===undefined && selectedSupplierId===undefined;
 if(firstOpen){
  try{
   await v2SyncLegacyInventory(true);
  }catch(error){
   console.error(error);
   alert("Unable to load inventory from the restaurant server.");
   return;
  }
  v2RebuildLegacyInventoryItems();
 }

 v2OriginalManagerStockHistory(selectedDate,selectedSupplierId);

 const panel=document.querySelector("#root .panel");
 if(!panel)return;

 const dateInput=panel.querySelector('input[type="date"]');
 const supplierSelect=document.getElementById("stockHistorySupplier");
 if(!dateInput)return;

 dateInput.removeAttribute("onchange");
 dateInput.onchange=null;

 [...panel.querySelectorAll("button")].forEach(button=>{
  if(button.textContent.trim().toUpperCase()==="ALL DATES"){
   button.remove();
  }
 });

 const applyButton=document.createElement("button");
 applyButton.id="stockHistoryApplyDate";
 applyButton.className="primary";
 applyButton.style.margin="10px 0 20px 0";
 applyButton.textContent="APPLY DATE";
 applyButton.onclick=()=>{
  window.managerStockHistory(dateInput.value,supplierSelect?.value||"");
 };
 dateInput.insertAdjacentElement("afterend",applyButton);
};

async function v2RenderInventoryDashboard(isOwner){
 try{
  await v2SyncLegacyInventory(true);
 }catch(error){
  console.error(error);
  alert("Unable to load inventory from the restaurant server.");
  return;
 }

 clearInterval(timerInterval);
 const backAction=isOwner?"ownerHome()":"managerHome()";
 const roleLabel=isOwner?"OWNER":"MANAGER";

 document.getElementById("root").innerHTML=`
 <div class="app">
  <button class="back" onclick="${backAction}">← BACK</button>
  <div class="logo">
   MR K BURGERS
   <span>${roleLabel} — INVENTORY</span>
  </div>
  <div class="panel">
   <span class="badge">📦 INVENTORY</span>
   <h1>Inventory</h1>
   <div class="grid">
    <div class="card" onclick="managerCurrentStock()" style="cursor:pointer">
     <div class="category-icon">📋</div>
     <h3>CURRENT STOCK</h3>
     <p class="muted">View inventory levels</p>
    </div>
    <div class="card" onclick="managerStockIn()" style="cursor:pointer">
     <div class="category-icon">📥</div>
     <h3>STOCK IN</h3>
     <p class="muted">Record deliveries</p>
    </div>
    <div class="card" onclick="managerStockOut()" style="cursor:pointer">
     <div class="category-icon">📤</div>
     <h3>STOCK OUT</h3>
     <p class="muted">Record stock usage</p>
    </div>
    <div class="card" onclick="managerWasteAdjustment()" style="cursor:pointer">
     <div class="category-icon">🗑️</div>
     <h3>WASTE / ADJUSTMENT</h3>
     <p class="muted">Record waste or corrections</p>
    </div>
    <div class="card" onclick="managerDeliveryHistory()" style="cursor:pointer">
     <div class="category-icon">🚚</div>
     <h3>DELIVERY HISTORY</h3>
     <p class="muted">View supplier deliveries</p>
    </div>
    <div class="card" onclick="managerStockHistory()" style="cursor:pointer">
     <div class="category-icon">📜</div>
     <h3>STOCK HISTORY</h3>
     <p class="muted">View inventory movements</p>
    </div>
    <div class="card clickable" onclick="managerLowStock()">
     <div class="category-icon">⚠️</div>
     <h3>LOW STOCK</h3>
     <p class="muted">View low-stock items</p>
    </div>
    <div class="card clickable" onclick="managerProductAvailability()">
     <div class="category-icon">🟢</div>
     <h3>PRODUCT AVAILABILITY</h3>
     <p class="muted">View menu availability</p>
    </div>
    ${isOwner?`
    <div class="card clickable" onclick="ownerSuppliers()">
     <div class="category-icon">🏢</div>
     <h3>SUPPLIERS</h3>
     <p class="muted">Create and manage suppliers</p>
    </div>`:""}
   </div>
  </div>
 </div>`;
}

window.ownerInventory=function ownerInventory(){
 return v2RenderInventoryDashboard(true);
};

window.managerInventory=function managerInventory(){
 return v2RenderInventoryDashboard(false);
};

if(typeof socket!=="undefined"&&socket?.on){
 socket.on("inventory-changed",async()=>{
  try{
   await v2SyncLegacyInventory(true);
  }catch(error){
   console.error("Live inventory refresh failed",error);
  }
 });
}

v2SyncLegacyInventory().catch(error=>{
 console.error("Initial backend inventory sync failed",error);
});
