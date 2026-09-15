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

  CREATE TABLE IF NOT EXISTS menu_categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT '🍽️',
    active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS menu_items (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    category_id TEXT NOT NULL,
    price INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES menu_categories(id)
  );

  CREATE TABLE IF NOT EXISTS menu_ingredients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS menu_item_ingredients (
    menu_item_id TEXT NOT NULL,
    ingredient_id TEXT NOT NULL,
    removable INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (menu_item_id, ingredient_id),
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
    FOREIGN KEY (ingredient_id) REFERENCES menu_ingredients(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS menu_item_extras (
    menu_item_id TEXT NOT NULL,
    extra_item_id TEXT NOT NULL,
    PRIMARY KEY (menu_item_id, extra_item_id),
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
    FOREIGN KEY (extra_item_id) REFERENCES menu_items(id) ON DELETE CASCADE
  );

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
    completed_at TEXT,
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

const orderColumns = db.prepare("PRAGMA table_info(orders)").all();
if(!orderColumns.some(column=>column.name==="completed_at")){
  db.exec("ALTER TABLE orders ADD COLUMN completed_at TEXT");
}

db.prepare(`
  UPDATE orders
  SET completed_at = COALESCE(completed_at, updated_at)
  WHERE status = 'COMPLETED' AND completed_at IS NULL
`).run();

// Temporary bootstrap accounts only. Menu data is intentionally NOT seeded here.
// Categories, menu items, ingredients, recipes and extras are managed through the POS
// and must never be recreated automatically when the server restarts.
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

seedStaff.run("Owner", "Tarek", "8e9b669109df89620b94f2387dc53206a82ddc71d658f8f7a2b3a9b417370d3e", "owner");
seedStaff.run("Manager", "manager01", "8cce10345c5e1de90d277b9869465f5972b828afbbbfd7ef08b1d835eedee993", "manager");
seedStaff.run("Cashier", "cashier01", "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4", "cashier");
seedStaff.run("Kitchen", "kitchen01", "f8638b979b2f4f793ddb6dbd197e0ee25a7a6ea32b0ae22f5e3c5d119d839e75", "kitchen");

module.exports = db;
