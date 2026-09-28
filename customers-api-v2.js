const createSecurityAuthV2=require("./security-auth-v2");

module.exports=function registerCustomersV2(app,io,db){
 const customerAccess=createSecurityAuthV2().requireRole("owner","manager","cashier");
 const ownerOnly=createSecurityAuthV2().requireRole("owner");

 db.exec(`
  CREATE TABLE IF NOT EXISTS customers(
   phone_key TEXT PRIMARY KEY,
   phone TEXT NOT NULL DEFAULT '',
   name TEXT NOT NULL DEFAULT '',
   address TEXT NOT NULL DEFAULT '',
   delivery_zone_id TEXT NOT NULL DEFAULT '',
   delivery_zone_name TEXT NOT NULL DEFAULT '',
   first_order_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
   last_order_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
   order_count INTEGER NOT NULL DEFAULT 0,
   created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
   updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_customers_name
  ON customers(name COLLATE NOCASE);
 `);

 const orderColumns=db.prepare("PRAGMA table_info(orders)").all();
 if(!orderColumns.some(column=>column.name==="customer_address")){
  db.exec("ALTER TABLE orders ADD COLUMN customer_address TEXT");
 }

 function normalizePhone(value){
  let digits=String(value||"").replace(/\D/g,"");
  if(digits.startsWith("00"))digits=digits.slice(2);
  if(digits.length===8)digits="223"+digits;
  return digits;
 }

 function customerRow(row){
  if(!row)return null;
  return {
   phoneKey:row.phone_key,
   phone:row.phone,
   name:row.name,
   address:row.address,
   deliveryZoneId:row.delivery_zone_id,
   deliveryZoneName:row.delivery_zone_name,
   firstOrderAt:row.first_order_at,
   lastOrderAt:row.last_order_at,
   orderCount:Number(row.order_count||0)
  };
 }

 app.get("/api/customers/by-phone",customerAccess,(req,res)=>{
  const phoneKey=normalizePhone(req.query.phone);
  if(!phoneKey)return res.status(400).json({error:"A valid phone number is required."});

  const row=db.prepare(`
   SELECT *
   FROM customers
   WHERE phone_key=?
   LIMIT 1
  `).get(phoneKey);

  if(!row)return res.status(404).json({found:false});
  res.json({found:true,customer:customerRow(row)});
 });

 function customerHistoryData(){
  const customers=db.prepare(`
   SELECT *
   FROM customers
   ORDER BY name COLLATE NOCASE ASC,phone ASC
  `).all();

  const orders=db.prepare(`
   SELECT
    id,order_number,customer_name,customer_phone,customer_address,
    delivery_zone_id,delivery_zone_name,delivery_fee,total_amount,
    payment_method,payment_status,status,created_at,completed_at,updated_at
   FROM orders
   WHERE upper(order_type)='DELIVERY'
   ORDER BY id DESC
  `).all();

  const ordersByPhone=new Map();
  for(const order of orders){
   const key=normalizePhone(order.customer_phone);
   if(!key)continue;
   if(!ordersByPhone.has(key))ordersByPhone.set(key,[]);
   ordersByPhone.get(key).push(order);
  }

  return customers.map(row=>{
   const saved=customerRow(row);
   const history=ordersByPhone.get(row.phone_key)||[];
   const chronological=[...history].sort((a,b)=>Number(a.id)-Number(b.id));
   const completedPaid=history.filter(order=>
    String(order.status||"").toUpperCase()==="COMPLETED"&&
    String(order.payment_status||"").toUpperCase()==="PAID"
   );
   const totalSpent=completedPaid.reduce((sum,order)=>sum+Number(order.total_amount||0),0);

   return {
    ...saved,
    firstOrderAt:chronological[0]?.created_at||saved.firstOrderAt,
    lastOrderAt:history[0]?.created_at||saved.lastOrderAt,
    totalOrders:history.length,
    completedPaidOrders:completedPaid.length,
    totalSpent,
    history:history.map(order=>({
     id:Number(order.id),
     orderNumber:Number(order.order_number||0),
     name:order.customer_name||"",
     phone:order.customer_phone||"",
     address:order.customer_address||"",
     deliveryZoneId:order.delivery_zone_id||"",
     deliveryZoneName:order.delivery_zone_name||"",
     deliveryFee:Number(order.delivery_fee||0),
     total:Number(order.total_amount||0),
     paymentMethod:order.payment_method||"",
     paymentStatus:order.payment_status||"",
     status:order.status||"",
     createdAt:order.created_at,
     completedAt:order.completed_at,
     updatedAt:order.updated_at
    }))
   };
  });
 }

 app.get("/api/customers",ownerOnly,(req,res)=>{
  const search=String(req.query.search||"").trim().toLowerCase();
  const phoneSearch=normalizePhone(search);

  let rows=customerHistoryData();
  if(search){
   rows=rows.filter(customer=>
    String(customer.name||"").toLowerCase().includes(search)||
    String(customer.phone||"").toLowerCase().includes(search)||
    (phoneSearch&&String(customer.phoneKey||"").includes(phoneSearch))
   );
  }

  res.json(rows.map(({history,...customer})=>customer));
 });

 app.get("/api/customers/:phoneKey/history",ownerOnly,(req,res)=>{
  const phoneKey=normalizePhone(req.params.phoneKey);
  if(!phoneKey)return res.status(400).json({error:"A valid customer phone number is required."});

  const customer=customerHistoryData().find(entry=>entry.phoneKey===phoneKey);
  if(!customer)return res.status(404).json({error:"Customer not found."});

  res.json(customer);
 });

 function attachCustomerSnapshot(req,res,next){
  if(String(req.method||"").toUpperCase()!=="POST")return next();
  if(String(req.body?.order_type||"").toUpperCase()!=="DELIVERY")return next();

  const name=String(req.body?.customer_name||"").trim();
  const phone=String(req.body?.customer_phone||"").trim();
  const address=String(req.body?.customer_address||"").trim();
  const phoneKey=normalizePhone(phone);

  if(!name||!phoneKey||!address){
   return res.status(400).json({error:"Delivery customer name, phone and address are required."});
  }

  const originalJson=res.json.bind(res);
  res.json=function customerSnapshotJson(payload){
   try{
    if(res.statusCode<400&&payload?.id){
     const orderId=Number(payload.id);
     const zoneId=String(req.body?.delivery_zone_id||"").trim();
     const zoneName=String(req.body?.delivery_zone_name||"").trim();

     db.prepare(`
      UPDATE orders
      SET customer_address=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=?
     `).run(address,orderId);

     db.prepare(`
      INSERT INTO customers(
       phone_key,phone,name,address,delivery_zone_id,delivery_zone_name,
       first_order_at,last_order_at,order_count,updated_at
      )
      VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,1,CURRENT_TIMESTAMP)
      ON CONFLICT(phone_key) DO UPDATE SET
       phone=excluded.phone,
       name=excluded.name,
       address=excluded.address,
       delivery_zone_id=excluded.delivery_zone_id,
       delivery_zone_name=excluded.delivery_zone_name,
       last_order_at=CURRENT_TIMESTAMP,
       order_count=customers.order_count+1,
       updated_at=CURRENT_TIMESTAMP
     `).run(phoneKey,phone,name,address,zoneId,zoneName);

     const saved=db.prepare("SELECT * FROM customers WHERE phone_key=?").get(phoneKey);
     payload={...payload,customer_address:address,customer:customerRow(saved)};
     io.emit("customers-changed",{phoneKey});
    }
   }catch(error){
    console.error("Unable to save delivery customer",error);
   }
   return originalJson(payload);
  };

  next();
 }

 app.use("/api/orders-with-inventory",attachCustomerSnapshot);
 app.use("/api/orders",attachCustomerSnapshot);
};
