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

  res.json({
    restaurant_status: status
  });
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
