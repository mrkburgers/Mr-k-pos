/* Shift delivery-fee reporting — backend orders are the single source of truth */
(function(){
 function money(value){
  return `${Number(value||0).toLocaleString()} CFA`;
 }

 function emptyBreakdown(shift){
  const rows=Array.isArray(shift?.orders)?shift.orders:[];
  const gross=Number(shift?.sales||rows.reduce((sum,row)=>sum+Number(row?.amount||0),0)||0);
  return {gross,fees:0,food:gross,cashFees:0,cardFees:0,mobileFees:0};
 }

 function breakdownHtml(values){
  return `
   <div class="v2-shift-delivery-breakdown" style="margin:12px 0;padding:12px;background:#101010;border:1px solid #3b3b3b;border-radius:12px">
    <div class="info-row"><span>Food Sales</span><strong>${money(values.food)}</strong></div>
    <div class="info-row"><span>Delivery Fees</span><strong>${money(values.fees)}</strong></div>
    <div class="info-row"><span>Cash Delivery Fees</span><strong>${money(values.cashFees)}</strong></div>
    <div class="info-row"><span>Card Delivery Fees</span><strong>${money(values.cardFees)}</strong></div>
    <div class="info-row"><span>Mobile Money Delivery Fees</span><strong>${money(values.mobileFees)}</strong></div>
    <div class="info-row"><span>Total Sales Collected</span><strong>${money(values.gross)}</strong></div>
   </div>`;
 }

 async function fetchBackendOrders(){
  const response=await fetch("/api/orders",{cache:"no-store"});
  if(!response.ok)throw new Error("Unable to load backend orders for shift delivery fees");
  const orders=await response.json();
  return Array.isArray(orders)?orders:[];
 }

 function parseBackendTime(value){
  if(!value)return NaN;
  const text=String(value);
  const date=new Date(text.includes("T")?text:text.replace(" ","T")+"Z");
  return date.getTime();
 }

 function orderBelongsToShift(order,shift){
  const created=parseBackendTime(order?.created_at);
  const opened=new Date(shift?.openedAt||0).getTime();
  const closed=shift?.closedAt?new Date(shift.closedAt).getTime():Date.now()+60000;
  if(!Number.isFinite(created)||!Number.isFinite(opened)||!Number.isFinite(closed))return true;
  return created>=opened-60000&&created<=closed+60000;
 }

 function backendOrderForShiftRow(row,shift,orders){
  if(row?.backendOrderId!=null){
   const exact=orders.find(order=>Number(order.id)===Number(row.backendOrderId));
   if(exact)return exact;
  }
  if(row?.orderId!=null){
   const matches=orders.filter(order=>
    Number(order.order_number)===Number(row.orderId)&&orderBelongsToShift(order,shift)
   );
   if(matches.length===1)return matches[0];
   if(matches.length>1){
    const rowTime=row?.time?new Date(row.time).getTime():NaN;
    if(Number.isFinite(rowTime)){
     matches.sort((a,b)=>Math.abs(parseBackendTime(a.created_at)-rowTime)-Math.abs(parseBackendTime(b.created_at)-rowTime));
    }
    return matches[0];
   }
  }
  return null;
 }

 function backendBreakdown(shift,orders){
  const rows=Array.isArray(shift?.orders)?shift.orders:[];
  const gross=Number(shift?.sales||rows.reduce((sum,row)=>sum+Number(row?.amount||0),0)||0);
  let fees=0;
  let cashFees=0;
  let cardFees=0;
  let mobileFees=0;

  rows.forEach(row=>{
   const order=backendOrderForShiftRow(row,shift,orders);
   if(!order)return;
   if(String(order.payment_status||"").toUpperCase()==="REFUNDED")return;
   if(String(order.status||"").toUpperCase()==="CANCELLED")return;
   const fee=Math.max(0,Number(order.delivery_fee||0));
   if(!fee)return;
   fees+=fee;
   const method=String(order.payment_method||row?.paymentMethod||"CASH").toUpperCase();
   if(method==="CARD")cardFees+=fee;
   else if(method==="MOBILE MONEY")mobileFees+=fee;
   else cashFees+=fee;
  });

  return {
   gross,
   fees,
   food:Math.max(0,gross-fees),
   cashFees,
   cardFees,
   mobileFees
  };
 }

 function replaceBreakdown(container,values){
  const current=container?.querySelector(".v2-shift-delivery-breakdown");
  if(!current)return;
  const holder=document.createElement("div");
  holder.innerHTML=breakdownHtml(values).trim();
  current.replaceWith(holder.firstElementChild);
 }

 async function refreshCurrentShiftBreakdown(){
  const shift=typeof getActiveShift==="function"?getActiveShift():null;
  if(!shift)return;
  try{
   const orders=await fetchBackendOrders();
   const card=[...document.querySelectorAll("#root .card")].find(entry=>
    String(entry.querySelector("h2")?.textContent||"").includes("Current Shift")
   );
   if(card)replaceBreakdown(card,backendBreakdown(shift,orders));
  }catch(error){
   console.error("Unable to refresh shift delivery fees from backend",error);
  }
 }

 function filteredHistory(selectedDate=""){
  let history=typeof getShiftHistory==="function"?getShiftHistory():[];
  if(!Array.isArray(history))history=[];
  if(!selectedDate)return history;
  return history.filter(shift=>{
   if(!shift?.openedAt)return false;
   const date=new Date(shift.openedAt);
   if(Number.isNaN(date.getTime()))return false;
   const text=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
   return text===selectedDate;
  });
 }

 async function refreshHistoryBreakdowns(selectedDate=""){
  try{
   const orders=await fetchBackendOrders();
   const history=filteredHistory(selectedDate);
   const cards=[...document.querySelectorAll("#root .card")].filter(card=>{
    const text=String(card.textContent||"");
    return text.includes("Opened:")&&text.includes("Closed:")&&card.querySelector(".v2-shift-delivery-breakdown");
   });
   cards.forEach((card,index)=>{
    const shift=history[index];
    if(shift)replaceBreakdown(card,backendBreakdown(shift,orders));
   });
  }catch(error){
   console.error("Unable to refresh shift history delivery fees from backend",error);
  }
 }

 if(typeof renderShiftManagement==="function"){
  const originalRenderShiftManagement=renderShiftManagement;
  window.renderShiftManagement=function renderShiftManagement(){
   const html=originalRenderShiftManagement();
   const shift=typeof getActiveShift==="function"?getActiveShift():null;
   if(!shift)return html;
   const target=`<p><b>Total Sales:</b> ${formatShiftMoney(Number(shift.sales||0))}</p>`;
   const block=breakdownHtml(emptyBreakdown(shift));
   if(String(html).includes(target))return String(html).replace(target,target+block);
   const fallback="<p><b>Total Sales:</b>";
   const index=String(html).indexOf(fallback);
   if(index<0)return html;
   const end=String(html).indexOf("</p>",index);
   if(end<0)return html;
   return String(html).slice(0,end+4)+block+String(html).slice(end+4);
  };
 }

 if(typeof renderShiftHistory==="function"){
  const originalRenderShiftHistory=renderShiftHistory;
  window.renderShiftHistory=function renderShiftHistory(selectedDate=""){
   let html=String(originalRenderShiftHistory(selectedDate));
   const history=filteredHistory(selectedDate);
   history.forEach(shift=>{
    const target=`<p><b>Sales:</b> ${formatShiftMoney(shift.sales)}</p>`;
    if(html.includes(target))html=html.replace(target,target+breakdownHtml(emptyBreakdown(shift)));
   });
   return html;
  };
 }

 if(typeof shiftManagementPageRender==="function"){
  const originalShiftManagementPageRender=window.shiftManagementPageRender;
  window.shiftManagementPageRender=function shiftManagementPageRender(...args){
   const result=originalShiftManagementPageRender.apply(this,args);
   refreshCurrentShiftBreakdown();
   return result;
  };
 }

 if(typeof shiftHistoryPageRender==="function"){
  const originalShiftHistoryPageRender=window.shiftHistoryPageRender;
  window.shiftHistoryPageRender=function shiftHistoryPageRender(selectedDate=""){
   const result=originalShiftHistoryPageRender(selectedDate);
   refreshHistoryBreakdowns(selectedDate);
   return result;
  };
 }
})();

/* Expense history real-time refresh across Owner / Manager devices */
(function(){
 if(typeof socket==="undefined"||!socket)return;

 socket.on("expenses-changed",async()=>{
  if(typeof v2FetchExpenses!=="function")return;
  try{
   const root=document.getElementById("root");
   const screenText=String(root?.textContent||"");
   const historyOpen=screenText.includes("EXPENSE HISTORY");
   const selectedDate=historyOpen
    ?String(root?.querySelector('input[type="date"]')?.value||"")
    :"";

   await v2FetchExpenses();

   if(historyOpen&&typeof expenseHistoryPage==="function"){
    expenseHistoryPage(selectedDate);
   }
  }catch(error){
   console.error("Real-time expense history refresh failed",error);
  }
 });
})();
