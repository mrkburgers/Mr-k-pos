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

function v2InventoryIngredientSnapshot(){
 return (Array.isArray(menuIngredients)?menuIngredients:[]).map(item=>({
  id:item.id,
  tracked:Boolean(item.tracked),
  lowStockLevel:Number(item.lowStockLevel||0),
  unit:item.unit||"unit"
 }));
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
  return original.apply(this,args);
 };
}

[
 "ownerInventory",
 "managerInventory",
 "managerCurrentStock",
 "managerStockIn",
 "managerStockOut",
 "managerWasteAdjustment",
 "managerDeliveryHistory",
 "managerStockHistory",
 "ownerSuppliers"
].forEach(v2WrapInventoryScreen);

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
