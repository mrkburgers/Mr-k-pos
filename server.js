const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const db = require("./database");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.json());
const PORT = 3000;

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
    total_amount = 0
  } = req.body;

  if (!order_uuid || !order_type) {
    return res.status(400).json({
      error: "order_uuid and order_type are required"
    });
  }

  const result = db.prepare(`
    INSERT INTO orders (
      order_uuid,
      order_type,
      payment_status,
      payment_method,
      customer_name,
      customer_phone,
      total_amount
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    order_uuid,
    order_type,
    payment_status,
    payment_method,
    customer_name,
    customer_phone,
    total_amount
  );
io.emit("order-created", {
  id: result.lastInsertRowid,
  order_uuid,
  status: "NEW",
  order_type,
  total_amount
});
  res.status(201).json({
    id: result.lastInsertRowid,
    order_uuid,
    status: "NEW"
  });
});
app.get("/api/orders", (req, res) => {
  const orders = db.prepare(`
  SELECT *
  FROM orders
  ORDER BY id DESC
`).all();

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
io.on("connection", (socket) => {
  console.log(`Device connected: ${socket.id}`);

  socket.on("disconnect", () => {
    console.log(`Device disconnected: ${socket.id}`);
  });
});
server.listen(PORT, () => {

  console.log(`Mr K POS v2 server running on port ${PORT}`);

});
