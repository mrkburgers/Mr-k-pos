/* Combo checkout / inventory / kitchen / receipt integration */
(function(){
 function comboComponentNotes(component){
  const details=[];
  if(component.group_name)details.push(component.group_name);
  if(Array.isArray(component.removed)&&component.removed.length){
   details.push(`NO: ${component.removed.join(", ")}`);
  }
  if(Array.isArray(component.extras)&&component.extras.length){
   details.push(`EXTRAS: ${component.extras.map(extra=>`${Number(extra.qty||1)} x ${extra.name}`).join(", ")}`);
  }
  return `${component.name}${details.length?` (${details.join(" | ")})`:""}`;
 }

 const originalOrderNotes=window.v2OrderNotes;
 window.v2OrderNotes=function v2OrderNotes(item){
  if(item?.comboId){
   const parts=(item.comboComponents||[]).map(component=>comboComponentNotes(component));
   return parts.length?`COMBO: ${parts.join(" ; ")}`:"COMBO";
  }
  return typeof originalOrderNotes==="function"?originalOrderNotes(item):null;
 };

 const originalBuildSnapshot=window.v2BuildReceiptSnapshot;
 window.v2BuildReceiptSnapshot=function v2BuildReceiptSnapshot(cartItem,requestItem){
  if(!cartItem?.comboId){
   return typeof originalBuildSnapshot==="function"
    ?originalBuildSnapshot(cartItem,requestItem)
    :null;
  }

  const quantity=Math.max(1,Number(requestItem?.quantity||cartItem?.qty||1));
  const chargedUnitPrice=Number(requestItem?.unit_price||0);
  const components=(cartItem.comboComponents||[]).map(component=>({
   item_id:String(component.item_id||""),
   item_name:String(component.name||""),
   group_name:component.group_name?String(component.group_name):null,
   removed:Array.isArray(component.removed)?component.removed.map(String):[],
   extras:(Array.isArray(component.extras)?component.extras:[]).map(extra=>({
    name:String(extra.name||""),
    qty:Math.max(1,Number(extra.qty||1)),
    unit_price:Number(extra.unit_price||0)
   }))
  }));

  return {
   version:2,
   combo:true,
   combo_id:String(cartItem.comboId||""),
   item_name:String(requestItem?.item_name||cartItem.name||""),
   quantity,
   base_unit_price:Number(cartItem.comboBasePrice||0),
   charged_unit_price:chargedUnitPrice,
   combo_components:components,
   item_subtotal:chargedUnitPrice*quantity
  };
 };

 const originalReceiptItemsHtml=window.v2ReceiptItemsHtml;
 window.v2ReceiptItemsHtml=function v2ReceiptItemsHtml(order){
  return (Array.isArray(order?.items)?order.items:[]).map(item=>{
   const snapshot=typeof v2ParseReceiptSnapshot==="function"?v2ParseReceiptSnapshot(item):null;
   if(snapshot?.combo===true){
    const quantity=Math.max(1,Number(snapshot.quantity||item.quantity||1));
    const baseUnit=Number(snapshot.base_unit_price||0);
    const chargedUnit=Number(snapshot.charged_unit_price||item.unit_price||0);
    const components=Array.isArray(snapshot.combo_components)?snapshot.combo_components:[];
    return `
     <div class="receipt-item">
      <div class="receipt-row"><span>${quantity} × ${esc(snapshot.item_name||item.item_name||"")} @ ${baseUnit.toLocaleString()}</span><strong>${(chargedUnit*quantity).toLocaleString()}</strong></div>
      ${components.map(component=>{
       const extras=Array.isArray(component.extras)?component.extras:[];
       const removed=Array.isArray(component.removed)?component.removed:[];
       return `<div class="receipt-note" style="padding-left:8px;margin-top:4px">↳ ${quantity} × ${esc(component.item_name||"")}${component.group_name?` <span style="font-size:9px">(${esc(component.group_name)})</span>`:""}
        ${removed.length?`<div style="padding-left:8px">NO: ${esc(removed.join(", "))}</div>`:""}
        ${extras.map(extra=>`<div class="receipt-row receipt-extra"><span>+ ${Number(extra.qty||1)*quantity} × ${esc(extra.name||"")} @ ${Number(extra.unit_price||0).toLocaleString()}</span><span>${(Number(extra.qty||1)*quantity*Number(extra.unit_price||0)).toLocaleString()}</span></div>`).join("")}
       </div>`;
      }).join("")}
      <div class="receipt-row receipt-sub"><span>Combo subtotal</span><strong>${(chargedUnit*quantity).toLocaleString()}</strong></div>
     </div>`;
   }
   if(typeof originalReceiptItemsHtml==="function"){
    return originalReceiptItemsHtml({items:[item]});
   }
   return "";
  }).join("");
 };

 window.checkoutOrder=function checkoutOrder(){
  if(!cart.length){
   return alert("Add at least one item before checkout.");
  }

  v2PendingCheckout={
   orderType,
   customer:{...customer},
   cart:JSON.parse(JSON.stringify(cart)),
   total:cartTotal()
  };

  document.getElementById("root").innerHTML=`
   <div class="app">
    <div class="logo">MR K BURGERS<span>PAYMENT</span></div>
    <div class="panel">
     <h2>${esc(orderType||"")}</h2>
     <div class="info-row"><span>Total</span><strong>${Number(v2PendingCheckout.total||0).toLocaleString()} CFA</strong></div>
     <h3>Select Payment Method</h3>
     <button class="green" style="width:100%;margin-top:10px;color:white;font-weight:800;" onclick="confirmOrderPayment(null,'CASH')">💵 CASH</button>
     <button class="secondary" style="width:100%;margin-top:10px;color:white;font-weight:800;" onclick="confirmOrderPayment(null,'CARD')">💳 CARD</button>
     <button class="secondary" style="width:100%;margin-top:10px;color:white;font-weight:800;" onclick="confirmOrderPayment(null,'MOBILE MONEY')">📱 MOBILE MONEY</button>
    </div>
   </div>`;
 };
})();
