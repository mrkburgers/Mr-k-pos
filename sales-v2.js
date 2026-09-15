function v2SalesTimestamp(value){
 if(!value)return 0;
 const text=String(value).trim();
 const normalized=/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)
  ?text.replace(" ","T")+"Z"
  :text;
 const parsed=new Date(normalized).getTime();
 return Number.isFinite(parsed)?parsed:0;
}

function v2SalesOrderToLegacy(order){
 const completedAt=v2SalesTimestamp(order.completed_at||order.updated_at);
 const paymentMethod=String(order.payment_method||"CASH").toUpperCase();
 const orderType=String(order.order_type||"");
 const total=Number(order.total_amount||0);
 const items=(Array.isArray(order.items)?order.items:[]).map(item=>({
  id:item.id,
  name:item.item_name||"",
  itemName:item.item_name||"",
  qty:Number(item.quantity||0),
  quantity:Number(item.quantity||0),
  price:Number(item.unit_price||0),
  unitPrice:Number(item.unit_price||0),
  total:Number(item.unit_price||0)*Number(item.quantity||0),
  notes:item.notes||"",
  removed:[],
  extras:[]
 }));

 return {
  id:Number(order.id),
  backendId:Number(order.id),
  orderId:Number(order.order_number),
  number:Number(order.order_number),
  orderNumber:Number(order.order_number),
  order_uuid:order.order_uuid,
  orderUuid:order.order_uuid,
  type:orderType,
  orderType,
  status:order.status,
  paymentStatus:order.payment_status,
  paymentMethod,
  customerName:order.customer_name||"",
  customerPhone:order.customer_phone||"",
  total,
  totalAmount:total,
  items,
  cart:items,
  createdAt:v2SalesTimestamp(order.created_at),
  completedAt
 };
}

async function v2SyncCompletedSales(){
 try{
  const response=await fetch(
   "/api/orders?status=COMPLETED&payment_status=PAID",
   {cache:"no-store"}
  );
  if(!response.ok)throw new Error("Unable to load sales");
  const rows=await response.json();
  completedOrders=(Array.isArray(rows)?rows:[])
   .filter(order=>order.status==="COMPLETED"&&order.payment_status==="PAID")
   .map(v2SalesOrderToLegacy);
  return true;
 }catch(error){
  console.error("Unable to sync backend sales history",error);
  return false;
 }
}

function v2SalesLoadFailed(){
 alert("Unable to load sales from the restaurant server.");
}

const v2LegacyOwnerSales=typeof ownerSales==="function"?ownerSales:null;
if(v2LegacyOwnerSales){
 ownerSales=async function ownerSales(){
  if(!await v2SyncCompletedSales())return v2SalesLoadFailed();
  return v2LegacyOwnerSales();
 };
}

const v2LegacyOwnerSalesHistory=typeof ownerSalesHistory==="function"?ownerSalesHistory:null;
if(v2LegacyOwnerSalesHistory){
 ownerSalesHistory=async function ownerSalesHistory(){
  if(!await v2SyncCompletedSales())return v2SalesLoadFailed();
  return v2LegacyOwnerSalesHistory();
 };
}

const v2LegacyManagerSales=typeof managerSales==="function"?managerSales:null;
if(v2LegacyManagerSales){
 managerSales=async function managerSales(){
  if(!await v2SyncCompletedSales())return v2SalesLoadFailed();
  return v2LegacyManagerSales();
 };
}

const v2LegacyManagerSalesHistory=typeof managerSalesHistory==="function"?managerSalesHistory:null;
if(v2LegacyManagerSalesHistory){
 managerSalesHistory=async function managerSalesHistory(selectedDate){
  if(!await v2SyncCompletedSales())return v2SalesLoadFailed();
  return v2LegacyManagerSalesHistory(selectedDate);
 };
}

if(typeof socket!=="undefined"&&socket){
 socket.on("order-status-changed",()=>{
  v2SyncCompletedSales();
 });
 socket.on("order-payment-status-changed",()=>{
  v2SyncCompletedSales();
 });
}

v2SyncCompletedSales();
