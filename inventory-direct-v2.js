// Direct V2 inventory bridge.
// Keeps the finalized V1 inventory screens, but routes normalized data directly
// through the SQLite-backed supplier/delivery endpoints.

async function v2DirectJson(url,options={}){
 const response=await fetch(url,{
  ...options,
  headers:{
   "Content-Type":"application/json",
   ...(options.headers||{})
  }
 });
 let body={};
 try{body=await response.json();}catch{}
 if(!response.ok){
  const error=new Error(body.error||"Inventory request failed");
  error.status=response.status;
  error.body=body;
  throw error;
 }
 return body;
}

async function v2RefreshSuppliersDirect(){
 const rows=await v2DirectJson("/api/suppliers",{cache:"no-store"});
 suppliers=Array.isArray(rows)?rows:[];
 localStorage.setItem("mrkSuppliers",JSON.stringify(suppliers));
 return suppliers;
}

async function v2RefreshDeliveriesDirect(){
 const rows=await v2DirectJson("/api/deliveries",{cache:"no-store"});
 inventoryDeliveries=Array.isArray(rows)?rows:[];
 localStorage.setItem("mrkInventoryDeliveries",JSON.stringify(inventoryDeliveries));
 return inventoryDeliveries;
}

const v2PreviousManagerStockIn=window.managerStockIn;
if(typeof v2PreviousManagerStockIn==="function"){
 window.managerStockIn=async function managerStockIn(...args){
  try{
   await v2RefreshSuppliersDirect();
  }catch(error){
   console.error("Direct supplier load failed",error);
   alert("Unable to load suppliers from the restaurant server.");
   return;
  }
  return v2PreviousManagerStockIn.apply(this,args);
 };
}

window.managerAddStock=async function managerAddStock(){
 const supplierId=document.getElementById("stockInSupplier")?.value||"";
 const selectedSupplier=(Array.isArray(suppliers)?suppliers:[]).find(
  supplier=>String(supplier.id)===String(supplierId)
 );
 const reference=document.getElementById("stockInReference")?.value.trim()||"";
 const note=document.getElementById("stockInNote")?.value.trim()||"";

 if(!supplierId||!selectedSupplier){
  alert("Please select a supplier.");
  return;
 }
 if(!Array.isArray(currentDeliveryItems)||!currentDeliveryItems.length){
  alert("Please add at least one item to the delivery.");
  return;
 }

 const items=[];
 for(const deliveryItem of currentDeliveryItems){
  const item=(Array.isArray(inventoryItems)?inventoryItems:[]).find(
   inventoryItem=>inventoryItem.id===deliveryItem.itemId
  );
  const qty=Number(deliveryItem.qty||0);
  if(!item||!Number.isInteger(qty)||qty<=0){
   alert("One of the delivery items is invalid. Please check the delivery and try again.");
   return;
  }
  items.push({ingredient_id:item.id,quantity:qty});
 }

 try{
  await v2DirectJson("/api/deliveries",{
   method:"POST",
   body:JSON.stringify({
    id:Date.now(),
    supplier_id:Number(supplierId),
    reference,
    note,
    created_by:typeof v2InventoryActor==="function"
     ?v2InventoryActor()
     :(String(currentStaffName||currentStaffId||"").trim()||null),
    items
   })
  });

  currentDeliveryItems=[];

  // Refresh the normalized backend state, then mirror it locally only for the
  // unchanged legacy screen renderers. SQLite remains authoritative.
  await Promise.all([
   v2RefreshSuppliersDirect(),
   v2RefreshDeliveriesDirect()
  ]);
  if(typeof v2SyncLegacyInventory==="function"){
   await v2SyncLegacyInventory(true);
  }

  alert("Delivery received successfully.");
  window.managerStockIn();
 }catch(error){
  console.error("Transactional Stock In failed",error);
  alert(
   "Unable to receive this delivery.\n\n"+
   (error?.message||"Please try again.")
  );
 }
};

const v2PreviousManagerDeliveryHistory=window.managerDeliveryHistory;
if(typeof v2PreviousManagerDeliveryHistory==="function"){
 window.managerDeliveryHistory=async function managerDeliveryHistory(...args){
  try{
   await Promise.all([
    v2RefreshSuppliersDirect(),
    v2RefreshDeliveriesDirect()
   ]);
  }catch(error){
   console.error("Direct delivery history load failed",error);
   alert("Unable to load delivery history from the restaurant server.");
   return;
  }
  return v2PreviousManagerDeliveryHistory.apply(this,args);
 };
}
