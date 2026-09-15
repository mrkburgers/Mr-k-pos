module.exports=function registerOrderLifecycleV2(app,io,db){
 const columns=db.prepare("PRAGMA table_info(orders)").all();
 if(!columns.some(column=>column.name==="ready_at"))db.exec("ALTER TABLE orders ADD COLUMN ready_at TEXT");
 if(!columns.some(column=>column.name==="cancelled_at"))db.exec("ALTER TABLE orders ADD COLUMN cancelled_at TEXT");
 if(!columns.some(column=>column.name==="customer_address"))db.exec("ALTER TABLE orders ADD COLUMN customer_address TEXT");
 if(!columns.some(column=>column.name==="table_number"))db.exec("ALTER TABLE orders ADD COLUMN table_number TEXT");
 if(!columns.some(column=>column.name==="cancel_reason"))db.exec("ALTER TABLE orders ADD COLUMN cancel_reason TEXT");
 db.exec(`
  CREATE TABLE IF NOT EXISTS order_timeline_events (
   id INTEGER PRIMARY KEY AUTOINCREMENT,order_id INTEGER NOT NULL,event_type TEXT NOT NULL,label TEXT NOT NULL,
   actor_name TEXT NOT NULL DEFAULT '',actor_staff_id TEXT NOT NULL DEFAULT '',actor_role TEXT NOT NULL DEFAULT '',
   detail TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
   FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_order_timeline_order ON order_timeline_events(order_id,id ASC);
 `);
 function number(value,fallback=0){const parsed=Number(value);return Number.isFinite(parsed)?parsed:fallback;}
 function actorFromBody(body){return {name:String(body?.actor_name||body?.created_by||"").trim(),staffId:String(body?.actor_staff_id||"").trim(),role:String(body?.actor_role||"").trim()};}
 function addTimeline(orderId,eventType,label,actor={},detail="",createdAt=null,{unique=false}={}){
  if(unique&&db.prepare(`SELECT 1 FROM order_timeline_events WHERE order_id=? AND event_type=? LIMIT 1`).get(orderId,eventType))return;
  if(createdAt){
   db.prepare(`INSERT INTO order_timeline_events(order_id,event_type,label,actor_name,actor_staff_id,actor_role,detail,created_at) VALUES(?,?,?,?,?,?,?,?)`).run(orderId,eventType,label,actor.name||"",actor.staffId||"",actor.role||"",detail||"",createdAt);
  }else{
   db.prepare(`INSERT INTO order_timeline_events(order_id,event_type,label,actor_name,actor_staff_id,actor_role,detail) VALUES(?,?,?,?,?,?,?)`).run(orderId,eventType,label,actor.name||"",actor.staffId||"",actor.role||"",detail||"");
  }
 }
 function ensureBaselineTimeline(order,actor={}){addTimeline(order.id,"ORDER_CREATED_PAID",order.payment_status==="PAID"?"Order created / paid":"Order created",actor,"",order.created_at,{unique:true});}
 function timelineRows(orderId){return db.prepare(`SELECT id,event_type,label,actor_name,actor_staff_id,actor_role,detail,created_at FROM order_timeline_events WHERE order_id=? ORDER BY created_at ASC,id ASC`).all(orderId);}
 function orderDetails(orderId){
  const order=db.prepare("SELECT * FROM orders WHERE id=?").get(orderId);if(!order)return null;
  if(!db.prepare("SELECT 1 FROM order_timeline_events WHERE order_id=? LIMIT 1").get(orderId)){
   const legacy={name:"System / legacy",staffId:"",role:"system"};ensureBaselineTimeline(order,legacy);
   if(["ACCEPTED","PREPARING","READY","COMPLETED"].includes(order.status))addTimeline(order.id,"SENT_TO_KITCHEN","Sent to kitchen",legacy,"",order.created_at,{unique:true});
   if(["PREPARING","READY","COMPLETED"].includes(order.status))addTimeline(order.id,"PREPARATION_STARTED","Preparation started",legacy,"",order.created_at,{unique:true});
   if(["READY","COMPLETED"].includes(order.status)&&order.ready_at)addTimeline(order.id,"READY","Marked ready",legacy,"",order.ready_at,{unique:true});
   if(order.status==="COMPLETED"&&order.completed_at)addTimeline(order.id,"COMPLETED","Completed",legacy,"",order.completed_at,{unique:true});
   if(order.status==="CANCELLED"&&order.cancelled_at)addTimeline(order.id,"CANCELLED_REFUNDED","Cancelled & refunded",legacy,order.cancel_reason||"",order.cancelled_at,{unique:true});
  }
  order.items=db.prepare(`SELECT * FROM order_items WHERE order_id=? ORDER BY id ASC`).all(orderId);order.timeline=timelineRows(orderId);return order;
 }
 function recalculateShift(shiftId){
  if(!shiftId)return;const totals=db.prepare(`SELECT COALESCE(SUM(amount),0) AS sales_total,COUNT(*) AS sales_count,COALESCE(SUM(CASE WHEN payment_method='CASH' THEN amount ELSE 0 END),0) AS cash_sales,COALESCE(SUM(CASE WHEN payment_method='CARD' THEN amount ELSE 0 END),0) AS card_sales,COALESCE(SUM(CASE WHEN payment_method='MOBILE MONEY' THEN amount ELSE 0 END),0) AS mobile_money_sales FROM shift_sales WHERE shift_id=?`).get(shiftId);
  const shift=db.prepare(`SELECT opening_cash,cash_in,cash_out,actual_cash FROM shifts WHERE id=?`).get(shiftId);if(!shift)return;
  const expected=number(shift.opening_cash)+number(totals.cash_sales)+number(shift.cash_in)-number(shift.cash_out);const actual=shift.actual_cash===null?null:number(shift.actual_cash);
  db.prepare(`UPDATE shifts SET sales_total=?,sales_count=?,cash_sales=?,card_sales=?,mobile_money_sales=?,expected_cash=?,difference=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(number(totals.sales_total),Number(totals.sales_count||0),number(totals.cash_sales),number(totals.card_sales),number(totals.mobile_money_sales),expected,actual===null?null:actual-expected,shiftId);
 }
 function restoreInventory(order){
  const reference=`Order #${String(order.order_number).padStart(3,"0")}`;if(db.prepare(`SELECT 1 FROM inventory_movements WHERE movement_type='CANCEL RESTOCK' AND note=? LIMIT 1`).get(`Cancelled order ${order.order_uuid}`))return [];
  const sales=db.prepare(`SELECT ingredient_id,SUM(quantity) AS quantity FROM inventory_movements WHERE movement_type='SALE' AND note=? AND date(created_at)=date(?) GROUP BY ingredient_id`).all(reference,order.created_at);
  const getInventory=db.prepare(`SELECT inv.stock,i.name FROM inventory_items inv JOIN menu_ingredients i ON i.id=inv.ingredient_id WHERE inv.ingredient_id=?`),update=db.prepare(`UPDATE inventory_items SET stock=?,updated_at=CURRENT_TIMESTAMP WHERE ingredient_id=?`),movement=db.prepare(`INSERT INTO inventory_movements(ingredient_id,movement_type,quantity,stock_before,stock_after,note,created_by) VALUES(?,?,?,?,?,?,?)`),restored=[];
  sales.forEach(sale=>{const qty=Math.max(0,-number(sale.quantity));if(qty<=0)return;const current=getInventory.get(sale.ingredient_id);if(!current)return;const before=number(current.stock),after=before+qty;update.run(after,sale.ingredient_id);movement.run(sale.ingredient_id,"CANCEL RESTOCK",qty,before,after,`Cancelled order ${order.order_uuid}`,"system");restored.push({ingredient_id:sale.ingredient_id,name:current.name,quantity:qty,stock_after:after});});return restored;
 }
 function ensureDigitalRefund(order,actor){
  const accountType=String(order.payment_method||"").toUpperCase();if(!["CARD","MOBILE MONEY"].includes(accountType))return null;const saleReference=`ORDER_${order.order_number}`,refundReference=`REFUND_ORDER_${order.id}`;
  const existingRefund=db.prepare(`SELECT id FROM owner_account_transactions WHERE account_type=? AND source='REFUND' AND reference=? LIMIT 1`).get(accountType,refundReference);if(existingRefund)return existingRefund.id;
  const original=db.prepare(`SELECT id FROM owner_account_transactions WHERE account_type=? AND source='SALE' AND reference=? LIMIT 1`).get(accountType,saleReference);
  if(!original)db.prepare(`INSERT INTO owner_account_transactions(id,account_type,type,amount,description,source,reference,created_at_ms,created_by,created_by_staff_id,balance_after) VALUES(?,?,?,?,?,?,?,?,?,?,NULL)`).run(`system-sale-order-${order.id}`,accountType,"IN",number(order.total_amount),`${accountType==='CARD'?'Card':'Mobile Money'} sale - Order #${String(order.order_number).padStart(3,"0")}`,"SALE",saleReference,Date.parse(String(order.created_at).replace(" ","T")+"Z")||Date.now(),"system","");
  const id=`refund-order-${order.id}`;db.prepare(`INSERT INTO owner_account_transactions(id,account_type,type,amount,description,source,reference,created_at_ms,created_by,created_by_staff_id,balance_after) VALUES(?,?,?,?,?,?,?,?,?,?,NULL)`).run(id,accountType,"OUT",number(order.total_amount),`Refund - Order #${String(order.order_number).padStart(3,"0")}`,"REFUND",refundReference,Date.now(),actor?.name||"system",actor?.staffId||"");return id;
 }
 const cancelOrder=db.transaction((orderId,reason,actor)=>{
  const order=db.prepare("SELECT * FROM orders WHERE id=?").get(orderId);if(!order)throw new Error("ORDER_NOT_FOUND");if(order.status==="CANCELLED")return {order,restored:[],alreadyCancelled:true};if(!["NEW","ACCEPTED"].includes(order.status))throw new Error("PREPARATION_ALREADY_STARTED");
  const restored=restoreInventory(order),linkedShifts=db.prepare(`SELECT DISTINCT shift_id FROM shift_sales WHERE backend_order_id=?`).all(orderId);db.prepare("DELETE FROM shift_sales WHERE backend_order_id=?").run(orderId);linkedShifts.forEach(row=>recalculateShift(row.shift_id));if(order.payment_status==="PAID")ensureDigitalRefund(order,actor);ensureBaselineTimeline(order,actor);addTimeline(orderId,"CANCELLED_REFUNDED",order.payment_status==="PAID"?"Cancelled & refunded":"Cancelled",actor,reason,null,{unique:true});
  db.prepare(`UPDATE orders SET status='CANCELLED',payment_status=CASE WHEN payment_status='PAID' THEN 'REFUNDED' ELSE payment_status END,cancel_reason=?,cancelled_at=COALESCE(cancelled_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(reason,orderId);
  return {order:{...order,status:"CANCELLED",payment_status:order.payment_status==="PAID"?"REFUNDED":order.payment_status},restored,alreadyCancelled:false};
 });
 function sendCancellation(req,res){
  const orderId=Number(req.params.id),reason=String(req.body?.reason||"").trim();if(!reason)return res.status(400).json({error:"Cancellation reason is required."});const actor=actorFromBody(req.body);let result;
  try{result=cancelOrder(orderId,reason,actor);}catch(error){if(error.message==="ORDER_NOT_FOUND")return res.status(404).json({error:"order not found"});if(error.message==="PREPARATION_ALREADY_STARTED")return res.status(409).json({error:"Order cancellation is not allowed after preparation has started."});throw error;}
  io.emit("order-status-changed",{id:orderId,order_number:result.order.order_number,order_uuid:result.order.order_uuid,status:"CANCELLED"});io.emit("order-payment-status-changed",{id:orderId,order_number:result.order.order_number,order_uuid:result.order.order_uuid,payment_status:result.order.payment_status});io.emit("inventory-changed",{reason:"order-cancelled",order_id:orderId});io.emit("shift-changed",{reason:"order-cancelled",order_id:orderId});io.emit("owner-accounts-changed",{reason:"order-refunded",order_id:orderId});res.json({id:orderId,order_number:result.order.order_number,status:"CANCELLED",payment_status:result.order.payment_status,inventory_restored:result.restored,already_cancelled:result.alreadyCancelled});
 }
 app.post("/api/orders/:id/initialize",(req,res)=>{
  const orderId=Number(req.params.id),order=db.prepare("SELECT * FROM orders WHERE id=?").get(orderId);if(!order)return res.status(404).json({error:"order not found"});const actor=actorFromBody(req.body);ensureBaselineTimeline(order,actor);
  db.prepare(`UPDATE orders SET customer_address=COALESCE(?,customer_address),table_number=COALESCE(?,table_number),updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(String(req.body?.customer_address||"").trim()||null,String(req.body?.table_number||"").trim()||null,orderId);res.json({ok:true,id:orderId});
 });
 app.get("/api/order-details/:id",(req,res)=>{const details=orderDetails(Number(req.params.id));if(!details)return res.status(404).json({error:"order not found"});res.json(details);});
 app.post("/api/orders/:id/cancel",sendCancellation);
 app.patch("/api/orders/:id/status",(req,res,next)=>{
  const orderId=Number(req.params.id),status=String(req.body?.status||""),order=db.prepare("SELECT * FROM orders WHERE id=?").get(orderId);if(!order)return res.status(404).json({error:"order not found"});if(status==="CANCELLED")return sendCancellation(req,res);
  const allowed={NEW:new Set(["NEW","ACCEPTED"]),ACCEPTED:new Set(["ACCEPTED","PREPARING"]),PREPARING:new Set(["PREPARING","READY"]),READY:new Set(["READY","COMPLETED"]),COMPLETED:new Set(["COMPLETED"]),CANCELLED:new Set(["CANCELLED"])};if(!allowed[order.status]||!allowed[order.status].has(status))return res.status(409).json({error:`Invalid order transition from ${order.status} to ${status}.`});
  const actor=actorFromBody(req.body);ensureBaselineTimeline(order,actor);
  if(status==="ACCEPTED"){addTimeline(orderId,"SENT_TO_KITCHEN","Sent to kitchen",actor,"",null,{unique:true});db.prepare("UPDATE orders SET status='ACCEPTED',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(orderId);}
  else if(status==="PREPARING"){addTimeline(orderId,"PREPARATION_STARTED","Preparation started",actor,"",null,{unique:true});db.prepare("UPDATE orders SET status='PREPARING',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(orderId);}
  else if(status==="READY"){db.prepare(`UPDATE orders SET status='READY',ready_at=COALESCE(ready_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(orderId);const ready=db.prepare("SELECT created_at,ready_at FROM orders WHERE id=?").get(orderId),start=Date.parse(String(ready.created_at).replace(" ","T")+"Z"),end=Date.parse(String(ready.ready_at).replace(" ","T")+"Z"),seconds=Number.isFinite(start)&&Number.isFinite(end)?Math.max(0,Math.floor((end-start)/1000)):0;addTimeline(orderId,"READY","Marked ready",actor,`Preparation time: ${Math.floor(seconds/60)}m ${seconds%60}s`,ready.ready_at,{unique:true});}
  else if(status==="COMPLETED"){db.prepare(`UPDATE orders SET status='COMPLETED',completed_at=COALESCE(completed_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(orderId);const completed=db.prepare("SELECT completed_at FROM orders WHERE id=?").get(orderId);addTimeline(orderId,"COMPLETED","Completed",actor,"",completed.completed_at,{unique:true});}
  else db.prepare("UPDATE orders SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(status,orderId);
  io.emit("order-status-changed",{id:orderId,order_number:order.order_number,order_uuid:order.order_uuid,status});res.json({id:orderId,order_number:order.order_number,order_uuid:order.order_uuid,status});
 });
 app.patch("/api/orders/:id/payment-status",(req,res,next)=>{const orderId=Number(req.params.id),paymentStatus=String(req.body?.payment_status||"");if(paymentStatus!=="REFUNDED")return next();const order=db.prepare("SELECT * FROM orders WHERE id=?").get(orderId);if(!order)return res.status(404).json({error:"order not found"});if(!["NEW","ACCEPTED"].includes(order.status))return res.status(409).json({error:"Refund is not allowed after preparation has started."});res.status(409).json({error:"Cancel the order to process its refund and inventory restoration together."});});
};
