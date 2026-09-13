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

const seedCategory = db.prepare(`
  INSERT OR IGNORE INTO menu_categories (id, name, icon, active, sort_order)
  VALUES (?, ?, ?, 1, ?)
`);

[
  ["burgers", "Burgers", "🍔", 1],
  ["sides", "Sides", "🍟", 2],
  ["salads", "Salads", "🥗", 3],
  ["softDrinks", "Soft Drinks", "🥤", 4],
  ["sauces", "Sauces", "🥣", 5],
  ["extraToppings", "Extra Toppings", "➕", 6]
].forEach(row => seedCategory.run(...row));

const seedItem = db.prepare(`
  INSERT OR IGNORE INTO menu_items (
    id,
    name,
    category_id,
    price,
    active,
    sort_order
  )
  VALUES (?, ?, ?, ?, 1, ?)
`);

[
  ["burger-classic", "Mr K Classic", "burgers", 3000, 1],
  ["burger-mushroom", "Mushroom & Swiss", "burgers", 5500, 2],
  ["burger-honky", "Honky Tonk", "burgers", 5000, 3],
  ["burger-philly", "Philly Cheesesteak", "burgers", 5500, 4],
  ["burger-brave", "Only The Brave", "burgers", 9000, 5],
  ["burger-bohemian", "Bohemian", "burgers", 5000, 6],
  ["burger-chicken", "Chicken Chimichurri", "burgers", 5500, 7],

  ["side-fries", "French Fries", "sides", 1000, 1],
  ["side-plantain", "Plantain Tostones", "sides", 1000, 2],
  ["side-onion", "Onion Rings", "sides", 1000, 3],
  ["side-cheese", "Cheese Fries", "sides", 3500, 4],
  ["side-fajita", "Fajita Cheese Fries", "sides", 4500, 5],
  ["side-dirty", "Dirty Fries", "sides", 4500, 6],

  ["salad-coleslaw", "Mr K Coleslaw", "salads", 1000, 1],
  ["salad-cheeseburger", "Cheeseburger Salad", "salads", 3500, 2],

  ["drink-small-water", "Small Water", "softDrinks", 500, 1],
  ["drink-big-water", "Big Water", "softDrinks", 1000, 2],
  ["drink-coke", "Coca Cola", "softDrinks", 1000, 3],
  ["drink-sprite", "Sprite", "softDrinks", 1000, 4],
  ["drink-fanta", "Fanta", "softDrinks", 1000, 5],

  ["sauce-mrk", "Mr K Sauce", "sauces", 500, 1],
  ["sauce-chimichurri", "Chimichurri", "sauces", 500, 2],
  ["sauce-ketchup", "Ketchup", "sauces", 0, 3],
  ["sauce-mayo", "Mayonnaise", "sauces", 0, 4],
  ["sauce-honey-mustard", "Honey Mustard", "sauces", 500, 5],
  ["sauce-honey-bbq", "Honey BBQ", "sauces", 500, 6],

  ["extra-beef", "Extra beef patty", "extraToppings", 2000, 1],
  ["extra-chicken", "Extra chicken steak", "extraToppings", 2500, 2],
  ["extra-cheddar", "Extra cheddar cheese", "extraToppings", 1000, 3],
  ["extra-emmental", "Extra emmental cheese", "extraToppings", 1000, 4],
  ["extra-swiss", "Extra Swiss cheese", "extraToppings", 1000, 5],
  ["extra-mushroom", "Extra mushroom", "extraToppings", 1000, 6],
  ["extra-onion-rings", "Extra onion rings", "extraToppings", 1000, 7],
  ["extra-bacon", "Extra bacon", "extraToppings", 1500, 8],
  ["extra-grated-cheese", "Extra grated cheese", "extraToppings", 1500, 9]
].forEach(row => seedItem.run(...row));

const seedIngredient = db.prepare(`
  INSERT OR IGNORE INTO menu_ingredients (id, name, active)
  VALUES (?, ?, 1)
`);

const ingredientNames = [
  "Beef patty 120g",
  "Grilled chicken breast 120g",
  "Tomato",
  "Onions",
  "Green pepper",
  "Pickled cucumbers",
  "Rocket lettuce",
  "Sautéed mushrooms",
  "Caramelised onions",
  "Cheddar cheese",
  "Emmental cheese",
  "Swiss cheese",
  "Onion rings",
  "Bacon",
  "Smoked turkey",
  "Fresh cucumber",
  "Mr K Sauce",
  "BBQ sauce",
  "Pesto mayo sauce",
  "Mayonnaise",
  "Chimichurri sauce",
  "Sautéed beef tenderloin 100g"
];

ingredientNames.forEach((name, index) => {
  const id = `ingredient-${index + 1}`;
  seedIngredient.run(id, name);
});

const ingredientIdByName = new Map(
  db.prepare("SELECT id, name FROM menu_ingredients").all()
    .map(row => [row.name, row.id])
);

const itemIdByName = new Map(
  db.prepare("SELECT id, name FROM menu_items").all()
    .map(row => [row.name, row.id])
);

const seedItemIngredient = db.prepare(`
  INSERT OR IGNORE INTO menu_item_ingredients (
    menu_item_id,
    ingredient_id,
    removable,
    sort_order
  )
  VALUES (?, ?, 1, ?)
`);

const burgerIngredients = {
  "Mr K Classic": [
    "Beef patty 120g", "Tomato", "Onions", "Pickled cucumbers", "Mr K Sauce"
  ],
  "Mushroom & Swiss": [
    "Beef patty 120g", "Sautéed mushrooms", "Caramelised onions", "Swiss cheese", "Pickled cucumbers", "Rocket lettuce", "Mr K Sauce"
  ],
  "Honky Tonk": [
    "Beef patty 120g", "Cheddar cheese", "Emmental cheese", "Onion rings", "Pickled cucumbers", "Rocket lettuce", "BBQ sauce", "Mr K Sauce"
  ],
  "Philly Cheesesteak": [
    "Beef patty 120g", "Sautéed beef tenderloin 100g", "Onions", "Green pepper", "Emmental cheese", "Cheddar cheese", "Mr K Sauce"
  ],
  "Only The Brave": [
    "Beef patty 120g", "Cheddar cheese", "Pickled cucumbers", "Bacon", "Mr K Sauce"
  ],
  "Bohemian": [
    "Beef patty 120g", "Emmental cheese", "Smoked turkey", "Tomato", "Fresh cucumber", "Rocket lettuce", "Pesto mayo sauce"
  ],
  "Chicken Chimichurri": [
    "Grilled chicken breast 120g", "Emmental cheese", "Rocket lettuce", "Pickled cucumbers", "Mayonnaise", "Chimichurri sauce"
  ]
};

Object.entries(burgerIngredients).forEach(([itemName, ingredients]) => {
  const menuItemId = itemIdByName.get(itemName);
  ingredients.forEach((ingredientName, index) => {
    const ingredientId = ingredientIdByName.get(ingredientName);
    if (menuItemId && ingredientId) {
      seedItemIngredient.run(menuItemId, ingredientId, index + 1);
    }
  });
});

const seedExtra = db.prepare(`
  INSERT OR IGNORE INTO menu_item_extras (menu_item_id, extra_item_id)
  VALUES (?, ?)
`);

const beefExtras = [
  "Extra beef patty",
  "Extra cheddar cheese",
  "Extra emmental cheese",
  "Extra Swiss cheese",
  "Extra mushroom",
  "Extra onion rings",
  "Extra bacon"
];

const chickenExtras = [
  "Extra chicken steak",
  "Extra cheddar cheese",
  "Extra emmental cheese",
  "Extra Swiss cheese",
  "Extra mushroom",
  "Extra onion rings",
  "Extra bacon"
];

Object.keys(burgerIngredients).forEach(itemName => {
  const itemId = itemIdByName.get(itemName);
  const extras = itemName === "Chicken Chimichurri" ? chickenExtras : beefExtras;
  extras.forEach(extraName => {
    const extraId = itemIdByName.get(extraName);
    if (itemId && extraId) {
      seedExtra.run(itemId, extraId);
    }
  });
});

module.exports = db;
