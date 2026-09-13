const Database = require("better-sqlite3");
const crypto = require("crypto");

const db = new Database("mr-k-pos.db");

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function hashPin(pin){
  return crypto
    .createHash("sha256")
    .update(String(pin))
    .digest("hex");
}

db.exec(`
  CREATE TABLE IF NOT EXISTS system_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    restaurant_name TEXT NOT NULL DEFAULT 'Mr K Burgers',
    restaurant_status TEXT NOT NULL DEFAULT 'OPEN',
    online_ordering_enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  INSERT OR IGNORE INTO system_settings (id)
  VALUES (1);

  CREATE TABLE IF NOT EXISTS staff_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    staff_id TEXT NOT NULL COLLATE NOCASE UNIQUE,
    pin_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner','manager','cashier','kitchen')),
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_staff_accounts_role
  ON staff_accounts(role);

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_uuid TEXT NOT NULL UNIQUE,
    order_number INTEGER,
    order_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'NEW',
    payment_status TEXT NOT NULL DEFAULT 'PENDING',
    payment_method TEXT,
    customer_name TEXT,
    customer_phone TEXT,
    total_amount INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    item_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id)
  );
`);

const seedStaff = db.prepare(`
  INSERT OR IGNORE INTO staff_accounts (
    name,
    staff_id,
    pin_hash,
    role,
    active
  )
  VALUES (?, ?, ?, ?, 1)
`);

seedStaff.run("Owner", "Tarek", hashPin("1991"), "owner");
seedStaff.run("Manager", "manager01", hashPin("9012"), "manager");
seedStaff.run("Cashier", "cashier01", hashPin("1234"), "cashier");
seedStaff.run("Kitchen", "kitchen01", hashPin("5678"), "kitchen");

module.exports = db;
