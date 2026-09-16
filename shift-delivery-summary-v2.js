/* Delivery-fee breakdown rendered directly through shift summary HTML */
(function(){
 function money(value){
  return `${Number(value||0).toLocaleString()} CFA`;
 }

 function shiftBreakdown(shift){
  const rows=Array.isArray(shift?.orders)?shift.orders:[];
  const fees=rows.reduce((sum,row)=>sum+Math.max(0,Number(row?.deliveryFee||0)),0);
  const gross=Number(shift?.sales||rows.reduce((sum,row)=>sum+Number(row?.amount||0),0)||0);
  return {gross,fees,food:Math.max(0,gross-fees)};
 }

 function breakdownHtml(values){
  return `
   <div class="v2-shift-delivery-breakdown" style="margin:12px 0;padding:12px;background:#101010;border:1px solid #3b3b3b;border-radius:12px">
    <div class="info-row"><span>Food Sales</span><strong>${money(values.food)}</strong></div>
    <div class="info-row"><span>Delivery Fees</span><strong>${money(values.fees)}</strong></div>
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
