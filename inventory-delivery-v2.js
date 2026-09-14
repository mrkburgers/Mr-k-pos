// V2 delivery bridge.
// Keeps the finalized Stock In / Delivery History UI while making SQLite deliveries authoritative.

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
