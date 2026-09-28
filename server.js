const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");
const db = require("./database");
const registerDeliveryZonesV2 = require("./delivery-zones-api-v2");
const registerMenuAdminV2 = require("./menu-api-v2");
const registerShiftV2 = require("./shift-api-v2");
const registerOwnerAccountsV2 = require("./owner-accounts-api-v2");
const registerExpensesV2 = require("./expenses-api-v2");
const registerCombosV2 = require("./combo-api-v2");
const registerDatabaseBackupV2 = require("./backup-api-v2");
const registerFinanceReportV2 = require("./finance-report-api-v2");
const registerCustomersV2 = require("./customers-api-v2");
const createSecurityAuthV2 = require("./security-auth-v2");
const loginRateV2 = require("./security-login-rate-v2");
const pinSecurityV2 = require("./security-pin-v2");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.json());
const configuredPort=Number(process.env.PORT||3000);
const PORT=Number.isInteger(configuredPort)&&configuredPort>0&&configuredPort<=65535
  ?configuredPort
  :3000;
const HOST=String(process.env.HOST||"0.0.0.0").trim()||"0.0.0.0";
const securityAuthV2 = createSecurityAuthV2();
const orderReadAccess = securityAuthV2.requireRole("owner","manager","cashier","kitchen");
const orderCashierAccess = securityAuthV2.requireRole("owner","manager","cashier");
const orderCreateAccess = securityAuthV2.requireRole("cashier");
const orderPaymentAccess = securityAuthV2.requireRole("cashier");

function fallbackOrderStatusAccess(req,res,next){
  const session=securityAuthV2.getSession(req);
  if(!session){
    return res.status(401).json({error:"Authentication required."});
  }

  const status=String(req.body?.status||"").toUpperCase();
  const role=String(session.role||"");
  let allowed=false;

  if(status==="ACCEPTED"||status==="COMPLETED"){
    allowed=["owner","manager","cashier"].includes(role);
  }else if(status==="PREPARING"||status==="READY"){
    allowed=["owner","manager","kitchen"].includes(role);
  }else if(status==="CANCELLED"){
    allowed=["owner","manager","cashier"].includes(role);
  }else{
    allowed=["owner","manager","cashier","kitchen"].includes(role);
  }

  if(!allowed){
    return res.status(403).json({error:"You do not have permission to perform this order action."});
  }

  req.v2Session=session;
  next();
}

app.use((req,res,next)=>{
  const method=String(req.method||"GET").toUpperCase();
  if(!["POST","PUT","PATCH","DELETE"].includes(method)){
    return next();
  }

  const session=securityAuthV2.getSession(req);
  if(!session){
    return next();
  }

  const fetchSite=String(req.headers["sec-fetch-site"]||"").toLowerCase();
  if(fetchSite==="cross-site"){
    return res.status(403).json({error:"Cross-site request blocked."});
  }

  const origin=String(req.headers.origin||"").trim();
  if(origin){
    try{
      const originHost=new URL(origin).host.toLowerCase();
      const requestHost=String(req.headers.host||"").toLowerCase();
      if(!originHost||!requestHost||originHost!==requestHost){
        return res.status(403).json({error:"Cross-origin request blocked."});
      }
    }catch(error){
      return res.status(403).json({error:"Invalid request origin."});
    }
  }

  next();
});

registerCustomersV2(app,io,db);
registerDeliveryZonesV2(app,io,db);
registerMenuAdminV2(app,io,db);
registerShiftV2(app,io,db);
registerOwnerAccountsV2(app,io,db);
registerExpensesV2(app,io,db);
registerCombosV2(app,io,db);
registerDatabaseBackupV2(app,io,db);
registerFinanceReportV2(app,db);

app.get("/", (req, res) => {
  const indexPath = path.join(__dirname, "index.html");
  const html = fs.readFileSync(indexPath, "utf8").replace(
    "</body>",
    '<script src="/kitchen-v2.js"></script>\n<script src="/menu-v2.js"></script>\n<script src="/menu-admin-v2.js"></script>\n<script src="/menu-recipe-v2.js"></script>\n<script src="/inventory-legacy-v2.js"></script>\n<script src="/inventory-delivery-v2.js"></script>\n<script src="/cashier-v2.js"></script>\n<script src="/combo-quantity-v2.js"></script>\n<script src="/sales-v2.js"></script>\n<script src="/shift-v2.js"></script>\n<script src="/owner-accounts-v2.js"></script>\n<script src="/staff-employees-v2.js"></script>\n<script src="/payroll-v2.js"></script>\n<script src="/auth-v2.js"></script>\n<script src="/expenses-sync-v2.js?v=20260928-expense-sync-3"></script>\n<script src="/finance-report-v2.js?v=20260928-money-report-1"></script>\n<script src="/combo-checkout-v2.js"></script>\n<script src="/owner-order-filter-v2.js"></script>\n<script src="/delivery-fee-v2.js"></script>\n<script src="/customers-v2.js?v=20260928-customers-2"></script>\n<script src="/shift-delivery-summary-v2.js"></script>\n<script src="/delivery-zone-map-v2.js"></script>\n<script src="/backup-v2.js"></script>\n</body>'
  );
  res.type("html").send(html);
});

app.get("/kitchen-v2.js", (req, res) => {
  res.sendFile(path.join(__dirname, "kitchen-v2.js"));
});
app.get("/menu-v2.js", (req, res) => {
  res.sendFile(path.join(__dirname, "menu-v2.js"));
});
app.get("/menu-admin-v2.js", (req, res) => {
  res.sendFile(path.join(__dirname, "menu-admin-v2.js"));
});
app.get("/menu-recipe-v2.js", (req, res) => {
  res.sendFile(path.join(__dirname, "menu-recipe-v2.js"));
});
app.get("/inventory-legacy-v2.js", (req, res) => {
  res.sendFile(path.join(__dirname, "inventory-legacy-v2.js"));
});
app.get("/inventory-delivery-v2.js", (req, res) => {
  res.sendFile(path.join(__dirname, "inventory-delivery-v2.js"));
});
app.get("/cashier-v2.js", (req, res) => {
  res.sendFile(path.join(__dirname, "cashier-v2.js"));
});
app.get("/combo-quantity-v2.js", (req, res) => {
  res.sendFile(path.join(__dirname, "combo-quantity-v2.js"));
});
app.get("/sales-v2.js", (req, res) => {
  res.sendFile(path.join(__dirname, "sales-v2.js"));
});
app.get("/shift-v2.js", (req, res) => {
  res.sendFile(path.join(__dirname, "shift-v2.js"));
});
app.get("/owner-accounts-v2.js", (req, res) => {
  res.sendFile(path.join(__dirname, "owner-accounts-v2.js"));
});
app.get("/expenses-v2.js", (req, res) => {
  res.sendFile(path.join(__dirname, "expenses-v2.js"));
});
app.get("/expenses-sync-v2.js", (req, res) => {
  res.sendFile(path.join(__dirname, "expenses-sync-v2.js"));
});
app.get("/auth-v2.js", (req, res) => {
  res.sendFile(path.join(__dirname, "auth-v2.js"));
});
app.get("/combo-checkout-v2.js", (req, res) => {
  res.sendFile(path.join(__dirname, "combo-checkout-v2.js"));
});
app.get("/owner-order-filter-v2.js", (req, res) => {
  res.sendFile(path.join(__dirname, "owner-order-filter-v2.js"));
});
app.get("/delivery-fee-v2.js", (req, res) => {
  res.sendFile(path.join(__dirname, "delivery-fee-v2.js"));
});
app.get("/customers-v2.js", (req, res) => {
  res.sendFile(path.join(__dirname, "customers-v2.js"));
});
app.get("/shift-delivery-summary-v2.js", (req, res) => {
  res.sendFile(path.join(__dirname, "shift-delivery-summary-v2.js"));
});
app.get("/delivery-zone-map-v2.js", (req, res) => {
  res.sendFile(path.join(__dirname, "delivery-zone-map-v2.js"));
});

app.get("/backup-v2.js", (req, res) => {
  res.sendFile(path.join(__dirname, "backup-v2.js"));
});
app.get("/finance-report-v2.js", (req, res) => {
  res.sendFile(path.join(__dirname, "finance-report-v2.js"));
});

app.get("/api/health", (req, res) => {
  const databaseCheck = db
    .prepare("SELECT restaurant_name FROM system_settings WHERE id = 1")
    .get();

  res.json({
    app: "Mr K POS",
    version: "2.0.0",
    status: "server online",
    database: "online",
    restaurant: databaseCheck.restaurant_name
  });
});

app.get("/api/bootstrap-status", (req, res) => {
  const row = db.prepare("SELECT COUNT(*) AS count FROM staff_accounts").get();
  res.json({
    requires_setup: Number(row?.count || 0) === 0
  });
});

app.post("/api/bootstrap-owner", (req, res) => {
  const fetchSite = String(req.headers["sec-fetch-site"] || "").toLowerCase();
  if (fetchSite === "cross-site") {
    return res.status(403).json({error:"Cross-site request blocked."});
  }

  const origin = String(req.headers.origin || "").trim();
  if (origin) {
    try {
      const originHost = new URL(origin).host.toLowerCase();
      const requestHost = String(req.headers.host || "").toLowerCase();
      if (!originHost || !requestHost || originHost !== requestHost) {
        return res.status(403).json({error:"Cross-origin request blocked."});
      }
    } catch (error) {
      return res.status(403).json({error:"Invalid request origin."});
    }
  }

  const name = String(req.body?.name || "").trim();
  const staffId = String(req.body?.staff_id || "").trim();
  const pin = String(req.body?.pin || "").trim();

  if (!name || name.length > 120) {
    return res.status(400).json({error:"Owner name is required and must be 120 characters or fewer."});
  }
  if (!staffId || staffId.length > 120) {
    return res.status(400).json({error:"Staff ID is required and must be 120 characters or fewer."});
  }
  if (!/^\d{8}$/.test(pin)) {
    return res.status(400).json({error:"Owner PIN must be exactly 8 numeric digits."});
  }

  const createOwner = db.transaction(() => {
    const count = db.prepare("SELECT COUNT(*) AS count FROM staff_accounts").get();
    if (Number(count?.count || 0) !== 0) {
      const error = new Error("SETUP_ALREADY_COMPLETED");
      throw error;
    }

    const result = db.prepare(`
      INSERT INTO staff_accounts(name,staff_id,pin_hash,role,active)
      VALUES(?,?,?,?,1)
    `).run(name,staffId,pinSecurityV2.hashPin(pin),"owner");

    return db.prepare(`
      SELECT id,name,staff_id,role,active
      FROM staff_accounts
      WHERE id=?
      LIMIT 1
    `).get(result.lastInsertRowid);
  });

  try {
    const owner = createOwner();
    res.status(201).json({
      id: Number(owner.id),
      name: owner.name,
      staff_id: owner.staff_id,
      role: owner.role,
      active: Boolean(owner.active)
    });
  } catch (error) {
    if (error.message === "SETUP_ALREADY_COMPLETED") {
      return res.status(409).json({error:"Initial Owner setup has already been completed."});
    }
    if (String(error?.code || "").includes("CONSTRAINT")) {
      return res.status(409).json({error:"That Staff ID is already in use."});
    }
    throw error;
  }
});

app.get("/api/staff", (req, res) => {
  const accounts = db.prepare(`
    SELECT
      name,
      staff_id
    FROM staff_accounts
    WHERE active = 1
    ORDER BY
      CASE role
        WHEN 'owner' THEN 1
        WHEN 'manager' THEN 2
        WHEN 'cashier' THEN 3
        WHEN 'kitchen' THEN 4
        ELSE 5
      END,
      id ASC
  `).all();

  res.json(accounts.map(account => ({
    name:String(account.name||""),
    staff_id:String(account.staff_id||"")
  })));
});

app.post("/api/logout", (req, res) => {
  securityAuthV2.clearSession(req,res);
  res.json({logged_out:true});
});

app.post("/api/login", (req, res) => {
  const staffId = String(req.body?.staff_id ?? "").trim();
  const pin = String(req.body?.pin ?? "").trim();

  if (loginRateV2.isLimited(req,staffId)) {
    return res.status(429).json({
      error: "Too many failed login attempts. Please try again later."
    });
  }

  if (!staffId || !pin) {
    return res.status(400).json({
      error: "staff_id and pin are required"
    });
  }

  const account = db.prepare(`
    SELECT
      id,
      name,
      staff_id,
      role,
      active,
      pin_hash
    FROM staff_accounts
    WHERE staff_id = ? COLLATE NOCASE
    LIMIT 1
  `).get(staffId);

  const pinCheck=account
    ?pinSecurityV2.verifyPin(pin,account.pin_hash)
    :{ok:false,needsUpgrade:false};

  if (!account || !pinCheck.ok) {
    loginRateV2.recordFailure(req,staffId);
    return res.status(401).json({
      error: "Invalid Staff ID or PIN."
    });
  }

  if (!account.active) {
    loginRateV2.recordFailure(req,staffId);
    return res.status(403).json({
      error: "This staff account is inactive."
    });
  }

  if (pinCheck.needsUpgrade) {
    const upgradedHash=pinSecurityV2.hashPin(pin);
    db.prepare(`
      UPDATE staff_accounts
      SET pin_hash=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(upgradedHash,account.id);
    account.pin_hash=upgradedHash;
  }

  loginRateV2.clearSuccess(req,staffId);
  securityAuthV2.createSession(res,account);

  res.json({
    id: account.id,
    name: account.name,
    staff_id: account.staff_id,
    role: account.role,
    active: true
  });
});

app.get("/api/menu", (req, res) => {
  const categories = db.prepare(`
    SELECT id, name, icon, active, sort_order, created_at, updated_at
    FROM menu_categories
    ORDER BY sort_order ASC, name ASC
  `).all().map(category => ({
    ...category,
    active: Boolean(category.active)
  }));

  const ingredients = db.prepare(`
    SELECT id, name, active, created_at, updated_at
    FROM menu_ingredients
    ORDER BY name ASC
  `).all().map(ingredient => ({
    ...ingredient,
    active: Boolean(ingredient.active)
  }));

  const items = db.prepare(`
    SELECT id, name, category_id, price, active, sort_order, created_at, updated_at
    FROM menu_items
    ORDER BY category_id ASC, sort_order ASC, name ASC
  `).all().map(item => {
    const itemIngredients = db.prepare(`
      SELECT
        i.id,
        i.name,
        mii.removable,
        mii.sort_order,
        COALESCE(mii.quantity,1) AS quantity
      FROM menu_item_ingredients mii
      JOIN menu_ingredients i
        ON i.id = mii.ingredient_id
      WHERE mii.menu_item_id = ?
      ORDER BY mii.sort_order ASC, i.name ASC
    `).all(item.id).map(ingredient => ({
      ...ingredient,
      removable: Boolean(ingredient.removable),
      quantity: Number(ingredient.quantity||1)
    }));

    const extras = db.prepare(`
      SELECT mi.id, mi.name, mi.price, mi.active
      FROM menu_item_extras mie
      JOIN menu_items mi
        ON mi.id = mie.extra_item_id
      WHERE mie.menu_item_id = ?
      ORDER BY mi.sort_order ASC, mi.name ASC
    `).all(item.id).map(extra => ({
      ...extra,
      active: Boolean(extra.active)
    }));

    return {
      ...item,
      active: Boolean(item.active),
      ingredients: itemIngredients,
      extras
    };
  });

  res.json({categories,items,ingredients});
});

app.get("/api/settings", (req, res) => {
  const settings = db
    .prepare(`
      SELECT
        restaurant_name,
        restaurant_status,
        online_ordering_enabled
      FROM system_settings
      WHERE id = 1
    `)
    .get();

  res.json({
    restaurant_name: settings.restaurant_name,
    restaurant_status: settings.restaurant_status,
    online_ordering_enabled: Boolean(settings.online_ordering_enabled)
  });
});

app.patch("/api/settings/online-ordering", securityAuthV2.requireRole("owner","manager"), (req, res) => {
  const { enabled } = req.body;

  if (typeof enabled !== "boolean") {
    return res.status(400).json({
      error: "enabled must be true or false"
    });
  }

  db.prepare(`
    UPDATE system_settings
    SET
      online_ordering_enabled = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
  `).run(enabled ? 1 : 0);

  io.emit("online-ordering-changed", {
    online_ordering_enabled: enabled
  });
  io.emit("settings-changed", {
    online_ordering_enabled: enabled
  });

  res.json({
    online_ordering_enabled: enabled
  });
});

app.patch("/api/settings/restaurant-status", securityAuthV2.requireRole("owner","manager"), (req, res) => {
  const { status } = req.body;

  if (!["OPEN", "CLOSED"].includes(status)) {
    return res.status(400).json({
      error: "status must be OPEN or CLOSED"
    });
  }

  db.prepare(`
    UPDATE system_settings
    SET
      restaurant_status = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
  `).run(status);

  io.emit("restaurant-status-changed", {
    restaurant_status: status
  });
  io.emit("settings-changed", {
    restaurant_status: status
  });

  res.json({
    restaurant_status: status
  });
});

app.post("/api/orders", orderCreateAccess, (req, res) => {
  const {
    order_uuid,
    order_type,
    payment_status = "PENDING",
    payment_method = null,
    customer_name = null,
    customer_phone = null,
    total_amount = 0,
    items = []
  } = req.body;

  if (!order_uuid || !order_type) {
    return res.status(400).json({
      error: "order_uuid and order_type are required"
    });
  }

  if (!Array.isArray(items)) {
    return res.status(400).json({
      error: "items must be an array"
    });
  }

  const createOrder = db.transaction(() => {
    const nextOrderNumber = db.prepare(`
      SELECT COALESCE(MAX(order_number), 0) + 1 AS next_number
      FROM orders
      WHERE date(created_at, 'localtime') = date('now', 'localtime')
    `).get().next_number;

    const result = db.prepare(`
      INSERT INTO orders (
        order_uuid,
        order_number,
        order_type,
        payment_status,
        payment_method,
        customer_name,
        customer_phone,
        total_amount
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      order_uuid,
      nextOrderNumber,
      order_type,
      payment_status,
      payment_method,
      customer_name,
      customer_phone,
      total_amount
    );

    const orderId = result.lastInsertRowid;

    const insertItem = db.prepare(`
      INSERT INTO order_items (
        order_id,
        item_name,
        quantity,
        unit_price,
        notes
      )
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const item of items) {
      insertItem.run(
        orderId,
        item.item_name,
        item.quantity ?? 1,
        item.unit_price ?? 0,
        item.notes ?? null
      );
    }

    return {
      orderId,
      orderNumber: nextOrderNumber
    };
  });

  let orderId;
  let orderNumber;

  try {
    const createdOrder = createOrder();
    orderId = createdOrder.orderId;
    orderNumber = createdOrder.orderNumber;
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({
        error: "order_uuid already exists"
      });
    }
    throw error;
  }

  io.emit("order-created", {
    id: orderId,
    order_number: orderNumber,
    order_uuid,
    status: "NEW",
    order_type,
    total_amount,
    items
  });

  res.status(201).json({
    id: orderId,
    order_number: orderNumber,
    order_uuid,
    status: "NEW",
    items
  });
});

app.get("/api/orders", orderReadAccess, (req, res) => {
  const { status, payment_status } = req.query;

  let query = `
    SELECT *
    FROM orders
    WHERE 1 = 1
  `;

  const params = [];

  if (status) {
    query += ` AND status = ?`;
    params.push(status);
  }

  if (payment_status) {
    query += ` AND payment_status = ?`;
    params.push(payment_status);
  }

  query += ` ORDER BY id DESC`;

  const orders = db.prepare(query).all(...params);

  for (const order of orders) {
    order.items = db.prepare(`
      SELECT *
      FROM order_items
      WHERE order_id = ?
      ORDER BY id ASC
    `).all(order.id);
  }

  res.json(orders);
});

app.get("/api/orders/:id", orderReadAccess, (req, res) => {
  const orderId = Number(req.params.id);

  const order = db.prepare(`
    SELECT *
    FROM orders
    WHERE id = ?
  `).get(orderId);

  if (!order) {
    return res.status(404).json({
      error: "order not found"
    });
  }

  order.items = db.prepare(`
    SELECT *
    FROM order_items
    WHERE order_id = ?
    ORDER BY id ASC
  `).all(orderId);

  res.json(order);
});

app.patch("/api/orders/:id/status", fallbackOrderStatusAccess, (req, res) => {
  const orderId = Number(req.params.id);
  const { status } = req.body;

  const allowedStatuses = [
    "NEW",
    "ACCEPTED",
    "PREPARING",
    "READY",
    "COMPLETED",
    "CANCELLED"
  ];

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({
      error: "Invalid order status"
    });
  }

  const order = db.prepare(`
    SELECT id, order_number, order_uuid
    FROM orders
    WHERE id = ?
  `).get(orderId);

  if (!order) {
    return res.status(404).json({
      error: "order not found"
    });
  }

  if (status === "COMPLETED") {
    db.prepare(`
      UPDATE orders
      SET
        status = ?,
        completed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, orderId);
  } else {
    db.prepare(`
      UPDATE orders
      SET
        status = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, orderId);
  }

  io.emit("order-status-changed", {
    id: orderId,
    order_number: order.order_number,
    order_uuid: order.order_uuid,
    status
  });

  res.json({
    id: orderId,
    order_number: order.order_number,
    order_uuid: order.order_uuid,
    status
  });
});

app.patch("/api/orders/:id/payment-status", orderPaymentAccess, (req, res) => {
  const orderId = Number(req.params.id);
  const { payment_status } = req.body;

  const allowedPaymentStatuses = [
    "PENDING",
    "PAID",
    "REFUNDED"
  ];

  if (!allowedPaymentStatuses.includes(payment_status)) {
    return res.status(400).json({
      error: "Invalid payment status"
    });
  }

  const order = db.prepare(`
    SELECT id, order_number, order_uuid
    FROM orders
    WHERE id = ?
  `).get(orderId);

  if (!order) {
    return res.status(404).json({
      error: "order not found"
    });
  }

  db.prepare(`
    UPDATE orders
    SET
      payment_status = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(payment_status, orderId);

  io.emit("order-payment-status-changed", {
    id: orderId,
    order_number: order.order_number,
    order_uuid: order.order_uuid,
    payment_status
  });

  res.json({
    id: orderId,
    order_number: order.order_number,
    order_uuid: order.order_uuid,
    payment_status
  });
});

app.listen = undefined;

let shuttingDown=false;

function shutdownMrKServer(signal){
  if(shuttingDown)return;
  shuttingDown=true;

  console.log(`Mr K POS V2 shutting down (${signal})...`);

  const forceTimer=setTimeout(()=>{
    console.error("Forced shutdown after timeout.");
    process.exit(1);
  },10000);
  forceTimer.unref();

  io.close(()=>{
    try{
      if(db.open)db.close();
    }catch(error){
      console.error("Database close during shutdown failed",error);
    }

    clearTimeout(forceTimer);
    process.exit(0);
  });
}

process.on("SIGINT",()=>shutdownMrKServer("SIGINT"));
process.on("SIGTERM",()=>shutdownMrKServer("SIGTERM"));

server.listen(PORT, HOST, () => {
  console.log(`Mr K POS V2 server running on http://${HOST}:${PORT}`);
});