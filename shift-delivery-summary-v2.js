/* Delivery-fee breakdown rendered directly through shift summary HTML */
(function(){
 function money(value){
  return `${Number(value||0).toLocaleString()} CFA`;
 }

 function pendingDeliverySnapshot(){
  const pending=typeof v2PendingCheckout!=="undefined"?v2PendingCheckout:null;
  const delivery=pending?.delivery;
  if(delivery&&(delivery.zone_id||delivery.id)){
   return {
    id:String(delivery.zone_id||delivery.id||""),
    name:String(delivery.zone_name||delivery.name||""),
    fee:Number(delivery.fee||0)
   };
  }
  if(String(orderType||"").toUpperCase()==="DELIVERY"&&customer?.deliveryZoneId){
   return {
    id:String(customer.deliveryZoneId||""),
    name:String(customer.deliveryZoneName||""),
    fee:Number(customer.deliveryFee||0)
   };
  }
  return null;
 }

 if(typeof addShiftSale==="function"){
  const previousAddShiftSale=window.addShiftSale;
  window.addShiftSale=function addShiftSale(amount,orderId=null,paymentMethod="CASH",backendOrderId=null){
   const delivery=pendingDeliverySnapshot();
   const result=previousAddShiftSale(amount,orderId,paymentMethod,backendOrderId);

   if(delivery){
    try{
     const shift=JSON.parse(localStorage.getItem("mrkActiveShift")||"null");
     if(shift&&Array.isArray(shift.orders)){
      const row=[...shift.orders].reverse().find(entry=>{
       const backendMatch=backendOrderId!=null&&Number(entry?.backendOrderId)===Number(backendOrderId);
       const orderMatch=Number(entry?.orderId)===Number(orderId)&&
        String(entry?.paymentMethod||"CASH").toUpperCase()===String(paymentMethod||"CASH").toUpperCase();
       return backendMatch||orderMatch;
      });
      if(row){
       row.backendOrderId=backendOrderId==null?row.backendOrderId:Number(backendOrderId);
       row.deliveryFee=Math.max(0,Number(delivery.fee||0));
       row.deliveryZoneId=delivery.id;
       row.deliveryZoneName=delivery.name;
       row.deliveryPaymentMethod=String(paymentMethod||"CASH").toUpperCase();
       localStorage.setItem("mrkActiveShift",JSON.stringify(shift));
       if(typeof v2ScheduleShiftSync==="function")v2ScheduleShiftSync();
      }
     }
    }catch(error){
     console.error("Unable to store delivery fee in shift sale row",error);
    }
   }

   return result;
  };
 }

 function shiftBreakdown(shift){
  const rows=Array.isArray(shift?.orders)?shift.orders:[];
  let fees=0;
  let cashFees=0;
  let cardFees=0;
  let mobileFees=0;

  rows.forEach(row=>{
   const fee=Math.max(0,Number(row?.deliveryFee||0));
   if(!fee)return;
   fees+=fee;
   const method=String(row?.deliveryPaymentMethod||row?.paymentMethod||"CASH").toUpperCase();
   if(method==="CARD")cardFees+=fee;
   else if(method==="MOBILE MONEY")mobileFees+=fee;
   else cashFees+=fee;
  });

  const gross=Number(shift?.sales||rows.reduce((sum,row)=>sum+Number(row?.amount||0),0)||0);
  return {
   gross,
   fees,
   food:Math.max(0,gross-fees),
   cashFees,
   cardFees,
   mobileFees
  };
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

 if(typeof renderShiftManagement==="function"){
  const originalRenderShiftManagement=renderShiftManagement;
  window.renderShiftManagement=function renderShiftManagement(){
   const html=originalRenderShiftManagement();
   const shift=typeof getActiveShift==="function"?getActiveShift():null;
   if(!shift)return html;
   const values=shiftBreakdown(shift);
   const target=`<p><b>Total Sales:</b> ${formatShiftMoney(Number(shift.sales||0))}</p>`;
   if(String(html).includes(target)){
    return String(html).replace(target,target+breakdownHtml(values));
   }
   const fallback="<p><b>Total Sales:</b>";
   const index=String(html).indexOf(fallback);
   if(index<0)return html;
   const end=String(html).indexOf("</p>",index);
   if(end<0)return html;
   return String(html).slice(0,end+4)+breakdownHtml(values)+String(html).slice(end+4);
  };
 }

 if(typeof renderShiftHistory==="function"){
  const originalRenderShiftHistory=renderShiftHistory;
  window.renderShiftHistory=function renderShiftHistory(selectedDate=""){
   let html=String(originalRenderShiftHistory(selectedDate));
   let history=typeof getShiftHistory==="function"?getShiftHistory():[];
   if(!Array.isArray(history))history=[];
   if(selectedDate){
    history=history.filter(shift=>{
     if(!shift?.openedAt)return false;
     const date=new Date(shift.openedAt);
     if(Number.isNaN(date.getTime()))return false;
     const text=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
     return text===selectedDate;
    });
   }

   history.forEach(shift=>{
    const target=`<p><b>Sales:</b> ${formatShiftMoney(shift.sales)}</p>`;
    if(html.includes(target)){
     html=html.replace(target,target+breakdownHtml(shiftBreakdown(shift)));
    }
   });
   return html;
  };
 }
})();
