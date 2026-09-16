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

 function kitchenVisibleNotes(item){
  const notes=String(item?.notes||"");
  const marker="RECEIPT_JSON:";
  const markerIndex=notes.indexOf(marker);
  const visible=(markerIndex>=0?notes.slice(0,markerIndex):notes)
   .replace(/\s*[|;]\s*$/," ")
   .trim();
  return visible;
 }

 function kitchenSnapshot(item){
  try{
   return typeof window.v2ParseReceiptSnapshot==="function"
    ?window.v2ParseReceiptSnapshot(item)
    :null;
  }catch(error){
   return null;
  }
 }

 function kitchenItemBodyHtml(item){
  const snapshot=kitchenSnapshot(item);
  if(snapshot?.combo===true){
   const components=Array.isArray(snapshot.combo_components)?snapshot.combo_components:[];
   return components.map(component=>{
    const removed=Array.isArray(component.removed)?component.removed:[];
    const extras=Array.isArray(component.extras)?component.extras:[];
    return `
     <div style="margin-top:10px;padding-left:14px;border-left:2px solid rgba(255,255,255,.15)">
      <strong>↳ ${esc(component.item_name||"")}</strong>
      ${component.group_name?`<div class="muted" style="font-size:.86em">${esc(component.group_name)}</div>`:""}
      ${removed.length?`<div class="muted">NO: ${esc(removed.join(", "))}</div>`:""}
      ${extras.length?`<div class="muted">EXTRAS: ${extras.map(extra=>`${Number(extra.qty||1)} × ${esc(extra.name||"")}`).join(", ")}</div>`:""}
     </div>`;
   }).join("");
  }
  const visibleNotes=kitchenVisibleNotes(item);
  return visibleNotes?`<div class="muted">${esc(visibleNotes)}</div>`:"";
 }

 function kitchenTicketItemHtml(item){
  const snapshot=kitchenSnapshot(item);
  const qty=Math.max(1,Number(item?.quantity||snapshot?.quantity||1));
  if(snapshot?.combo===true){
   const components=Array.isArray(snapshot.combo_components)?snapshot.combo_components:[];
   return `
    <div class="ticket-item">
     <div class="ticket-main">${qty} × ${esc(snapshot.item_name||item.item_name||"")}</div>
     ${components.map(component=>{
      const removed=Array.isArray(component.removed)?component.removed:[];
      const extras=Array.isArray(component.extras)?component.extras:[];
      return `<div class="ticket-component">
       ↳ ${esc(component.item_name||"")}${component.group_name?` <span>(${esc(component.group_name)})</span>`:""}
       ${removed.length?`<div>NO: ${esc(removed.join(", "))}</div>`:""}
       ${extras.length?`<div>EXTRAS: ${extras.map(extra=>`${Number(extra.qty||1)} × ${esc(extra.name||"")}`).join(", ")}</div>`:""}
      </div>`;
     }).join("")}
    </div>`;
  }
  const visibleNotes=kitchenVisibleNotes(item);
  return `<div class="ticket-item"><div class="ticket-main">${qty} × ${esc(item?.item_name||"")}</div>${visibleNotes?`<div class="ticket-note">${esc(visibleNotes)}</div>`:""}</div>`;
 }

 window.printKitchenTicket=async function printKitchenTicket(orderId){
  const printWindow=window.open("","_blank","width=420,height=720");
  if(!printWindow){
   alert("Please allow pop-ups to print the kitchen ticket.");
   return;
  }
  printWindow.document.write("<p style='font-family:Arial,sans-serif;padding:20px'>Loading kitchen ticket...</p>");
  try{
   const response=await fetch(`/api/orders/${Number(orderId)}`);
   if(!response.ok)throw new Error("Unable to load order");
   const order=await response.json();
   const items=Array.isArray(order.items)?order.items:[];
   const created=order.created_at?new Date(String(order.created_at).replace(" ","T")+"Z"):null;
   const timeText=created&&!Number.isNaN(created.getTime())?created.toLocaleString():String(order.created_at||"");
   printWindow.document.open();
   printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Kitchen #${esc(String(order.order_number||""))}</title><style>
    @page{size:80mm auto;margin:4mm}body{font-family:Arial,sans-serif;color:#000;width:72mm;margin:0 auto;font-size:13px}.center{text-align:center}.brand{font-weight:900;font-size:20px}.sub{font-weight:800;font-size:13px}.rule{border-top:1px dashed #000;margin:8px 0}.order-no{font-size:26px;font-weight:900}.meta{margin:3px 0}.ticket-item{padding:7px 0;border-bottom:1px dashed #aaa}.ticket-main{font-size:16px;font-weight:900}.ticket-component{padding:4px 0 0 12px;font-weight:700}.ticket-component div,.ticket-note{padding-left:8px;font-weight:700}.ticket-component span{font-size:11px;font-weight:400}@media print{button{display:none}}
   </style></head><body>
    <div class="center brand">MR K BURGERS</div><div class="center sub">KITCHEN TICKET</div><div class="rule"></div>
    <div class="center order-no">#${esc(String(order.order_number||""))}</div>
    <div class="center" style="font-size:17px;font-weight:900">${esc(order.order_type||"")}</div>
    <div class="rule"></div>
    <div class="meta"><strong>Time:</strong> ${esc(timeText)}</div>
    ${order.customer_name?`<div class="meta"><strong>Customer:</strong> ${esc(order.customer_name)}</div>`:""}
    ${order.customer_phone?`<div class="meta"><strong>Phone:</strong> ${esc(order.customer_phone)}</div>`:""}
    ${order.customer_address?`<div class="meta"><strong>Address:</strong> ${esc(order.customer_address)}</div>`:""}
    ${order.table_number?`<div class="meta"><strong>Table:</strong> ${esc(String(order.table_number))}</div>`:""}
    <div class="rule"></div>
    ${items.map(kitchenTicketItemHtml).join("")||"<div>No item details available.</div>"}
    <div class="rule"></div><div class="center" style="font-weight:900">END OF KITCHEN TICKET</div>
    <script>window.onload=function(){setTimeout(function(){window.print();},150)};<\/script>
   </body></html>`);
   printWindow.document.close();
  }catch(error){
   printWindow.document.open();
   printWindow.document.write("<p style='font-family:Arial,sans-serif;padding:20px'>Unable to load kitchen ticket.</p>");
   printWindow.document.close();
  }
 };

 const originalKitchenCard=window.kitchenCard;
 if(typeof originalKitchenCard==="function"){
  window.kitchenCard=function kitchenCard(order){
   return `
    <div class="order-card">
     <div class="order-top">
      <div>
       <div class="order-number">#${padOrder(order.order_number)}</div>
       <h2>${esc(order.order_type||"")}</h2>
      </div>
      <div style="text-align:right">
       <span class="status">${esc(order.status||"ACCEPTED")}</span>
       <div class="timer" style="margin-top:10px" data-order-created-at="${esc(order.created_at||"")}" data-order-ready-at="${esc(order.ready_at||"")}">${v2FormatOrderDuration(v2OrderDuration(order))}</div>
      </div>
     </div>
     <div class="summary">
      ${Array.isArray(order.items)&&order.items.length
       ?order.items.map(item=>`<div class="kitchen-item"><strong>${Number(item.quantity||0)} × ${esc(item.item_name||"")}</strong>${kitchenItemBodyHtml(item)}</div>`).join("")
       :`<p class="muted">No item details available.</p>`}
     </div>
     <div class="actions">
      <button class="secondary" onclick="printKitchenTicket(${Number(order.id)})">🖨️ PRINT KITCHEN TICKET</button>
      ${order.status==="ACCEPTED"?`<button class="primary" onclick="updateKitchenOrderStatus(${Number(order.id)},'PREPARING')">START PREPARING</button>`:""}
      ${order.status==="PREPARING"?`<button class="green" onclick="updateKitchenOrderStatus(${Number(order.id)},'READY')">MARK READY</button>`:""}
     </div>
    </div>`;
  };
 }

 const originalShowActiveOrders=window.showActiveOrders;
 if(typeof originalShowActiveOrders==="function"){
  window.showActiveOrders=async function showActiveOrders(){
   await originalShowActiveOrders();
   try{
    const response=await fetch("/api/orders");
    if(!response.ok)return;
    const orders=await response.json();
    const orderMap=new Map((Array.isArray(orders)?orders:[]).map(order=>[Number(order.id),order]));
    document.querySelectorAll("#root .order-card.clickable").forEach(card=>{
     const onclick=String(card.getAttribute("onclick")||"");
     const match=onclick.match(/activeOrderDetail\((\d+)\)/);
     if(!match)return;
     const order=orderMap.get(Number(match[1]));
     if(!order||!Array.isArray(order.items))return;
     const summaries=[...card.querySelectorAll(":scope > .summary")];
     summaries.forEach((summary,index)=>{
      const item=order.items[index];
      if(!item)return;
      summary.innerHTML=`<strong>${Number(item.quantity||0)} × ${esc(item.item_name||"")}</strong>${kitchenItemBodyHtml(item)}`;
     });
    });
   }catch(error){
    console.error("Unable to clean active order combo display",error);
   }
  };
 }
})();
