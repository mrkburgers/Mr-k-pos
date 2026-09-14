// V2 delivery bridge.
// Keeps the finalized Stock In / Delivery History UI while making SQLite deliveries authoritative.

async function v2LoadSuppliersDirect(){
 const response=await fetch("/api/suppliers",{cache:"no-store"});
 if(!response.ok)throw new Error("Unable to load suppliers");
 const rows=await response.json();
 suppliers=Array.isArray(rows)?rows:[];
 localStorage.setItem("mrkSuppliers",JSON.stringify(suppliers));
 return suppliers;
}

async function v2LoadDeliveriesDirect(){
 const response=await fetch("/api/deliveries",{cache:"no-store"});
 if(!response.ok)throw new Error("Unable to load delivery history");
 const rows=await response.json();
 inventoryDeliveries=Array.isArray(rows)?rows:[];
 localStorage.setItem("mrkInventoryDeliveries",JSON.stringify(inventoryDeliveries));
 return inventoryDeliveries;
}

const v2PreviousManagerStockIn=window.managerStockIn;
if(typeof v2PreviousManagerStockIn==="function"){
 window.managerStockIn=async function managerStockIn(...args){
  try{
   await v2LoadSuppliersDirect();
  }catch(error){
   console.error("Direct supplier load failed",error);
   alert("Unable to load suppliers from the restaurant server.");
   return;
  }
  return v2PreviousManagerStockIn.apply(this,args);
 };
}

window.managerAddStock=async function managerAddStock(){
 const supplierId=document.getElementById("stockInSupplier").value;
 const selectedSupplier=suppliers.find(
  supplier=>String(supplier.id)===String(supplierId)
 );
 const reference=document.getElementById("stockInReference").value.trim();
 const note=document.getElementById("stockInNote").value.trim();

 if(!supplierId||!selectedSupplier){
  alert("Please select a supplier.");
  return;
 }
 if(!currentDeliveryItems.length){
  alert("Please add at least one item to the delivery.");
  return;
 }

 const items=[];
 for(const deliveryItem of currentDeliveryItems){
  const item=inventoryItems.find(entry=>entry.id===deliveryItem.itemId);
  const qty=Number(deliveryItem.qty||0);
  if(!item||!Number.isInteger(qty)||qty<=0){
   alert("Every delivery item needs a valid whole-number quantity.");
   return;
  }
  items.push({
   ingredient_id:item.id,
   quantity:qty
  });
 }

 try{
  await v2PostJson("/api/deliveries",{
   id:Date.now(),
   supplier_id:Number(supplierId),
   reference,
   note,
   created_by:v2InventoryActor(),
   items
  });

  currentDeliveryItems=[];
  await Promise.all([
   v2LoadSuppliersDirect(),
   v2LoadDeliveriesDirect()
  ]);
  await v2SyncLegacyInventory(true);

  alert("Delivery received successfully.");
  managerStockIn();
 }catch(error){
  console.error("Delivery backend save failed",error);
  alert(
   "Unable to receive this delivery.\n\n"+
   (error?.message||"Please try again.")
  );
 }
};

// menu-admin-v2 finalizes the Delivery History filter during the window load event.
// Register this listener afterwards so the final screen always refreshes normalized
// suppliers/deliveries directly from SQLite before it renders.
window.addEventListener("load",()=>{
 const v2PreviousManagerDeliveryHistory=window.managerDeliveryHistory;
 if(typeof v2PreviousManagerDeliveryHistory!=="function")return;

 window.managerDeliveryHistory=async function managerDeliveryHistory(...args){
  try{
   await Promise.all([
    v2LoadSuppliersDirect(),
    v2LoadDeliveriesDirect()
   ]);
  }catch(error){
   console.error("Direct delivery history load failed",error);
   alert("Unable to load delivery history from the restaurant server.");
   return;
  }
  return v2PreviousManagerDeliveryHistory.apply(this,args);
 };
});
