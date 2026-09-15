module.exports=function registerShiftV2(app,io,db){
 db.exec(`
  CREATE TABLE IF NOT EXISTS shifts (
   id INTEGER PRIMARY KEY,
   status TEXT NOT NULL DEFAULT 'OPEN',
   opened_at TEXT NOT NULL,
   closed_at TEXT,
   opened_by TEXT,
   opened_role TEXT,
   closed_by TEXT,
   closed_role TEXT,
   opening_cash REAL NOT NULL DEFAULT 0,
   cash_in REAL NOT NULL DEFAULT 0,
   cash_out REAL NOT NULL DEFAULT 0,
   cash_sales REAL NOT NULL DEFAULT 0,
   card_sales REAL NOT NULL DEFAULT 0,
   mobile_money_sales REAL NOT NULL DEFAULT 0,
   sales_total REAL NOT NULL DEFAULT 0,
   sales_count INTEGER NOT NULL DEFAULT 0,
   expected_cash REAL,
   actual_cash REAL,
   difference REAL,
   actual_cash_edits_json TEXT NOT NULL DEFAULT '[]',
   updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS shift_sales (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   shift_id INTEGER NOT NULL,
   backend_order_id INTEGER,
   order_number INTEGER,
   amount REAL NOT NULL DEFAULT 0,
   payment_method TEXT NOT NULL DEFAULT 'CASH',
   created_at TEXT NOT NULL,
   FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE,
   FOREIGN KEY (backend_order_id) REFERENCES orders(id),
   UNIQUE (backend_order_id)
  );

  CREATE INDEX IF NOT EXISTS idx_shift_sales_shift
  ON shift_sales(shift_id,id ASC);

  CREATE UNIQUE INDEX IF NOT EXISTS idx_shift_sales_legacy_order_unique
  ON shift_sales(shift_id,order_number)
  WHERE backend_order_id IS NULL AND order_number IS NOT NULL;

  CREATE TABLE IF NOT EXISTS shift_movements (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   shift_id INTEGER NOT NULL,
   movement_type TEXT NOT NULL,
   amount REAL NOT NULL DEFAULT 0,
   note TEXT,
   created_by TEXT,
   created_at TEXT NOT NULL,
   FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_shift_movements_shift
  ON shift_movements(shift_id,id ASC);
 `);

 function safeJson(value,fallback=[]){
  try{return JSON.parse(value||JSON.stringify(fallback));}catch{return fallback;}
 }

 function number(value,fallback=0){
  const parsed=Number(value);
  return Number.isFinite(parsed)?parsed:fallback;
 }

 function shiftRows(){
  const saleStmt=db.prepare(`
   SELECT backend_order_id,order_number,amount,payment_method,created_at
   FROM shift_sales
   WHERE shift_id=?
   ORDER BY id ASC
  `);
  const movementStmt=db.prepare(`
   SELECT movement_type,amount,note,created_by,created_at
   FROM shift_movements
   WHERE shift_id=?
   ORDER BY id ASC
  `);

  return db.prepare(`
   SELECT * FROM shifts
   ORDER BY opened_at DESC,id DESC
  `).all().map(row=>({
   id:Number(row.id),
   openedAt:row.opened_at,
   closedAt:row.closed_at,
   openedBy:row.opened_by||"",
   role:row.opened_role||"",
   closedBy:row.closed_by||"",
   closedRole:row.closed_role||"",
   openingCash:number(row.opening_cash),
   sales:number(row.sales_total),
   salesCount:Number(row.sales_count||0),
   cashIn:number(row.cash_in),
   cashOut:number(row.cash_out),
   cashSales:number(row.cash_sales),
   cardSales:number(row.card_sales),
   mobileMoneySales:number(row.mobile_money_sales),
   closingCashExpected:row.expected_cash===null?null:number(row.expected_cash),
   closingCashActual:row.actual_cash===null?null:number(row.actual_cash),
   difference:row.difference===null?null:number(row.difference),
   actualCashEdits:safeJson(row.actual_cash_edits_json,[]),
   orders:saleStmt.all(row.id).map(sale=>({
    orderId:sale.order_number===null?null:Number(sale.order_number),
    backendOrderId:sale.backend_order_id===null?null:Number(sale.backend_order_id),
    amount:number(sale.amount),
    paymentMethod:sale.payment_method||"CASH",
    time:sale.created_at
   })),
   movements:movementStmt.all(row.id).map(movement=>({
    type:movement.movement_type,
    amount:number(movement.amount),
    note:movement.note||"",
    createdBy:movement.created_by||"",
    time:movement.created_at
   }))
  }));
 }

 function recalculateShift(id){
  const totals=db.prepare(`
   SELECT
    COALESCE(SUM(amount),0) AS sales_total,
    COUNT(*) AS sales_count,
    COALESCE(SUM(CASE WHEN payment_method='CASH' THEN amount ELSE 0 END),0) AS cash_sales,
    COALESCE(SUM(CASE WHEN payment_method='CARD' THEN amount ELSE 0 END),0) AS card_sales,
    COALESCE(SUM(CASE WHEN payment_method='MOBILE MONEY' THEN amount ELSE 0 END),0) AS mobile_money_sales
   FROM shift_sales
   WHERE shift_id=?
  `).get(id);

  const shift=db.prepare(`
   SELECT opening_cash,cash_in,cash_out,actual_cash
   FROM shifts WHERE id=?
  `).get(id);
  if(!shift)return;

  const expected=
   number(shift.opening_cash)+
   number(totals.cash_sales)+
   number(shift.cash_in)-
   number(shift.cash_out);
  const actual=shift.actual_cash===null?null:number(shift.actual_cash);

  db.prepare(`
   UPDATE shifts
   SET
    sales_total=?,sales_count=?,cash_sales=?,card_sales=?,mobile_money_sales=?,
    expected_cash=?,difference=?,updated_at=CURRENT_TIMESTAMP
   WHERE id=?
  `).run(
   number(totals.sales_total),Number(totals.sales_count||0),
   number(totals.cash_sales),number(totals.card_sales),number(totals.mobile_money_sales),
   expected,
   actual===null?null:actual-expected,
   id
  );
 }

 function saveShift(shift,status){
  if(!shift||!Number.isFinite(Number(shift.id)))return;
  const id=Number(shift.id);
  const orders=Array.isArray(shift.orders)?shift.orders:[];
  const movements=Array.isArray(shift.movements)?shift.movements:[];

  db.prepare(`
   INSERT INTO shifts(
    id,status,opened_at,closed_at,opened_by,opened_role,closed_by,closed_role,
    opening_cash,cash_in,cash_out,cash_sales,card_sales,mobile_money_sales,
    sales_total,sales_count,expected_cash,actual_cash,difference,actual_cash_edits_json,
    updated_at
   ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
   ON CONFLICT(id) DO UPDATE SET
    status=excluded.status,
    opened_at=excluded.opened_at,
    closed_at=excluded.closed_at,
    opened_by=excluded.opened_by,
    opened_role=excluded.opened_role,
    closed_by=excluded.closed_by,
    closed_role=excluded.closed_role,
    opening_cash=excluded.opening_cash,
    cash_in=excluded.cash_in,
    cash_out=excluded.cash_out,
    actual_cash=excluded.actual_cash,
    actual_cash_edits_json=excluded.actual_cash_edits_json,
    updated_at=CURRENT_TIMESTAMP
  `).run(
   id,status,String(shift.openedAt||new Date().toISOString()),shift.closedAt||null,
   String(shift.openedBy||""),String(shift.role||""),String(shift.closedBy||""),String(shift.closedRole||""),
   number(shift.openingCash),number(shift.cashIn),number(shift.cashOut),0,0,0,0,0,null,
   shift.closingCashActual===null||shift.closingCashActual===undefined?null:number(shift.closingCashActual),
   null,
   JSON.stringify(Array.isArray(shift.actualCashEdits)?shift.actualCashEdits:[])
  );

  db.prepare("DELETE FROM shift_sales WHERE shift_id=?").run(id);
  const insertSale=db.prepare(`
   INSERT OR IGNORE INTO shift_sales(
    shift_id,backend_order_id,order_number,amount,payment_method,created_at
   ) VALUES(?,?,?,?,?,?)
  `);
  orders.forEach(order=>{
   const backendId=Number(order?.backendOrderId);
   const orderNumber=Number(order?.orderId);
   insertSale.run(
    id,
    Number.isSafeInteger(backendId)&&backendId>0?backendId:null,
    Number.isFinite(orderNumber)?orderNumber:null,
    number(order?.amount),
    String(order?.paymentMethod||"CASH"),
    String(order?.time||shift.openedAt||new Date().toISOString())
   );
  });

  db.prepare("DELETE FROM shift_movements WHERE shift_id=?").run(id);
  const insertMovement=db.prepare(`
   INSERT INTO shift_movements(
    shift_id,movement_type,amount,note,created_by,created_at
   ) VALUES(?,?,?,?,?,?)
  `);
  movements.forEach(movement=>{
   insertMovement.run(
    id,
    String(movement?.type||movement?.movementType||"ADJUSTMENT"),
    number(movement?.amount),
    String(movement?.note||movement?.reason||""),
    String(movement?.createdBy||movement?.by||""),
    String(movement?.time||movement?.createdAt||shift.openedAt||new Date().toISOString())
   );
  });

  recalculateShift(id);
 }

 const saveState=db.transaction(payload=>{
  const active=payload?.active&&typeof payload.active==="object"?payload.active:null;
  const history=Array.isArray(payload?.history)?payload.history:[];
  history.forEach(shift=>saveShift(shift,"CLOSED"));
  if(active)saveShift(active,"OPEN");

  const activeIds=active&&Number.isFinite(Number(active.id))?[Number(active.id)]:[];
  if(activeIds.length){
   db.prepare("UPDATE shifts SET status='CLOSED' WHERE status='OPEN' AND id<>?").run(activeIds[0]);
  }else{
   db.prepare("UPDATE shifts SET status='CLOSED' WHERE status='OPEN'").run();
  }
 });

 app.get("/api/shifts/state",(req,res)=>{
  const rows=shiftRows();
  res.json({
   active:rows.find(shift=>!shift.closedAt)||null,
   history:rows.filter(shift=>Boolean(shift.closedAt))
  });
 });

 app.put("/api/shifts/state",(req,res)=>{
  try{saveState(req.body||{});}
  catch(error){
   if(String(error.code||"").includes("CONSTRAINT")){
    return res.status(409).json({error:"shift data conflicts with an existing order or shift"});
   }
   throw error;
  }
  io.emit("shift-changed",{});
  const rows=shiftRows();
  res.json({
   active:rows.find(shift=>!shift.closedAt)||null,
   history:rows.filter(shift=>Boolean(shift.closedAt))
  });
 });
};
