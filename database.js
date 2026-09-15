const Database = require("better-sqlite3");

const db = new Database("mr-k-pos.db");

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS system_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    restaurant_name TEXT NOT NULL DEFAULT 'Mr K Burgers',
    restaurant_status TEXT NOT NULL DEFAULT 'OPEN',
    online_ordering_enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  INSERT