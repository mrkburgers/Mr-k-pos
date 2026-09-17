// V2 inventory compatibility bridge.
// SQLite is authoritative. Local storage is only a display/cache mirror for the
// finalized legacy inventory screens in index.html.

let v2LegacyInventorySyncPromise=null;
let v2LegacyInventoryApplying=false;

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

function v2ApplyNormalizedInventory(inventoryPayload,supplierRows,deliveryRows){
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

  suppliers=Array.isArray(supplierRows)?supplierRows:[];
  if(Array.isArray(deliveryRows)){
   inventoryDeliveries=deliveryRows;
  }

  v2RebuildLegacyInventoryItems();

  // Cache only. These values never write back over SQLite.
  localStorage.setItem("mrkInventoryStock",JSON.stringify(inventoryStock));
  localStorage.setItem("mrkSuppliers",JSON.stringify(suppliers));
  if(Array.isArray(deliveryRows)){
   localStorage.setItem("mrkInventoryDeliveries",JSON.stringify(inventoryDeliveries));
  }
 }finally{
  v2LegacyInventoryApplying=false;
 }
}

async function v2SyncLegacyInventory(force=false){
 if(v2LegacyInventorySyncPromise&&!force)return v2LegacyInventorySyncPromise;

 v2LegacyInventorySyncPromise=(async()=>{
  const canLoadDeliveries=Boolean(loggedIn&&["owner","manager"].includes(role));
  const [inventoryResponse,suppliersResponse,deliveriesResponse]=await Promise.all([
   fetch("/api/inventory",{cache:"no-store"}),
   fetch("/api/suppliers",{cache:"no-store"}),
   canLoadDeliveries
    ?fetch("/api/deliveries",{cache:"no-store"})
    :Promise.resolve(null)
  ]);

  if(!inventoryResponse.ok||!suppliersResponse.ok||(deliveriesResponse&&!deliveriesResponse.ok)){
   throw new Error("Unable to load inventory from restaurant server");
  }

  const inventoryPayload=await inventoryResponse.json();
  const supplierRows=await suppliersResponse.json();
  const deliveryRows=deliveriesResponse?await deliveriesResponse.json():null;

  v2ApplyNormalizedInventory(inventoryPayload,supplierRows,deliveryRows);
  return {inventoryPayload,supplierRows,deliveryRows};
 })();

 try{
  return await v2LegacyInventorySyncPromise;
 }finally{
  v2LegacyInventorySyncPromise=null;
 }
}

// Preserve the frozen UI's local cache helpers, but never push those snapshots
// back into SQLite. All authoritative changes go through dedicated backend APIs.
const v2OriginalSaveInventory=saveInventory;
saveInventory=function saveInventory(){
 v2RebuildLegacyInventoryItems();
 v2OriginalSaveInventory();
};

const v2OriginalSaveSuppliers=saveSuppliers;
saveSuppliers=function saveSuppliers(){
 v2OriginalSaveSuppliers();
};

const v2OriginalSaveInventoryDeliveries=saveInventoryDeliveries;
saveInventoryDeliveries=function saveInventoryDeliveries(){
 v2OriginalSaveInventoryDeliveries();
};

const v2OriginalSaveInventoryMovements=saveInventoryMovements;
saveInventoryMovements=function saveInventoryMovements(){
 v2OriginalSaveInventoryMovements();
};

function v2InventoryActor(){
 const name=String(currentStaffName||"").trim();
 const id=String(currentStaffId||"").trim();
 if(name&&id)return `${name} (${id})`;
 return id||name||(role==="owner"?"Owner":"Manager");
}

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
  await v2PostJson(`/api/inventory/${encodeURIComponent(itemId)}/adjust`,{
   quantity:-qty,
   movement_type:"STOCK OUT",
   note:null,
   created_by:v2InventoryActor()
  });

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
  await v2PostJson(`/api/inventory/${encodeURIComponent(itemId)}/adjust`,{
   quantity:-qty,
   movement_type:"WASTE / ADJUSTMENT",
   note:reason,
   created_by:v2InventoryActor()
  });

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
