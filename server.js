const express = require("express");
const db = require("./database");
const app = express();
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
app.listen(PORT, () => {

  console.log(`Mr K POS v2 server running on port ${PORT}`);

});
