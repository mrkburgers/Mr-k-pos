const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const db = require("./database");
const registerDeliveryZonesV2 = require("./delivery-zones-api-v2");
const registerMenuAdminV2 = require("./menu-api-v2");
const registerShiftV2 = require("./shift-api-v2");
const registerOwnerAccountsV2 = require("./owner-accounts-api-v2");
const registerExpensesV2 = require("./expenses-api-v2");
const registerCombosV2 = require("./combo-api-v2");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.json());
const PORT = 3000;

function hashPin(pin){
  return crypto
    .createHash("sha256")
    .update(String(pin))
    .digest("hex");
}

registerDeliveryZonesV2(app,io,db);
registerMenuAdminV2(app,io,db);
registerShiftV2(app,io,db);
registerOwnerAccountsV2(app,io,db);
registerExpensesV2(app,io,db);
registerCombosV2(app,io,db);

app.get("/", (req, res) => {
  const indexPath = path.join(__dirname, "index.html");
  const html = fs.readFileSync(indexPath, "utf8").replace(
    "</body>",
    '<script src="/kitchen-v2.js"></script>\n<script src="/menu-v2.js"></script>\n<script src="/menu-admin-v2.js"></script>\n<script src="/menu-recipe-v2.js"></script>\n<script src="/inventory-legacy-v2.js"></script>\n<script src="/inventory-delivery-v2.js"></script>\n<script src="/cashier-v2.js"></script>\n<script src="/combo-quantity-v2.js"></script>\n<script src="/sales-v2.js"></script>\n<script src="/shift-v2.js"></script>\n<script src="/owner-accounts-v2.js"></script>\n<script src="/expenses-v2.js"></script>\n<script src="/auth-v2.js"></script>\n<script src="/combo-checkout-v2.js"></script>\n<script src="/owner-order-filter-v2.js"></script>\n<script src="/delivery-fee-v2.js"></script>\n<script src="/shift-delivery-summary-v2.js"></script>\n<script src="/delivery-zone-map-v2.js"></script>\n</body>'
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
app.get("/shift-delivery-summary-v2.js", (req, res) => {
  res.sendFile(path.join(__dirname, "shift-delivery-summary-v2.js"));
});
app.get("/delivery-zone-map-v2.js", (req, res) => {
  res.sendFile(path.join(__dirname, "delivery-zone-map-v2.js"));
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

app.get("/api/staff", (req, res) => {
  const accounts = db.prepare(`
    SELECT
      id,
      name,
      staff_id,
      role,
      active,
      created_at,
      updated_at
    FROM staff_accounts
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
    ...account,
    active: Boolean(account.active)
  })));
});

app.post("/api/login", (req, res) => {
  const staffId = String(req.body?.staff_id ?? "").trim();
  const pin = String(req.body?.pin ?? "").trim();

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

  if (!account || account.pin_hash !== hashPin(pin)) {
    return res.status(401).json({
      error: "Invalid Staff ID or PIN."
    });
  }

  if (!account.active) {
    return res.status(403).json({
      error: "This staff account is inactive."
    });
  }

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

app.patch("/api/settings/online-ordering", (req, res) => {
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

app.patch("/api/settings/restaurant-status", (req, res) => {
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

app.post("/api/orders", (req, res) => {
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

app.get("/api/orders", (req, res) => {
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

app.get("/api/orders/:id", (req, res) => {
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

app.patch("/api/orders/:id/status", (req, res) => {
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

app.patch("/api/orders/:id/payment-status", (req, res) => {
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

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Mr K POS V2 server running on port ${PORT}`);
});
