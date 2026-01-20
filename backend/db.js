const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();

const DB_DIR = path.join(__dirname, "..", "db");
const DB_PATH = path.join(DB_DIR, "chemsus.sqlite");
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new sqlite3.Database(DB_PATH);

function exec(sql) {
  return new Promise((resolve, reject) => db.exec(sql, (e) => (e ? reject(e) : resolve())));
}
function get(sql, p = []) {
  return new Promise((resolve, reject) => db.get(sql, p, (e, r) => (e ? reject(e) : resolve(r))));
}
function run(sql, p = []) {
  return new Promise((resolve, reject) =>
    db.run(sql, p, function (e) {
      if (e) reject(e);
      else resolve(this);
    })
  );
}

async function seed() {
  const st = await get(`SELECT COUNT(*) AS c FROM site_settings`);
  if ((st?.c || 0) === 0) {
    await run(`INSERT INTO site_settings(key,value) VALUES ('brochure_url','assets/broucher.pdf')`);
    console.log("✅ Seeded brochure_url");
  }
}

async function initDb() {
  await exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS products_page (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      image TEXT NOT NULL DEFAULT '',
      link TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS shop_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      subtitle TEXT NOT NULL DEFAULT '',
      features_json TEXT NOT NULL DEFAULT '[]',
      price REAL NOT NULL DEFAULT 0,
      stockStatus TEXT NOT NULL DEFAULT 'in-stock',
      showBadge INTEGER NOT NULL DEFAULT 0,
      badge TEXT NOT NULL DEFAULT '',
      moreLink TEXT NOT NULL DEFAULT '',
      image TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS site_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );

    -- ✅ safer defaults (no NOT NULL failures if a field is missing)
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customername TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      companyName TEXT DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      region TEXT NOT NULL DEFAULT '',
      pincode TEXT NOT NULL DEFAULT '',
      country TEXT NOT NULL DEFAULT 'India',
      productname TEXT NOT NULL DEFAULT '',
      quantity REAL NOT NULL DEFAULT 1,
      unitprice REAL NOT NULL DEFAULT 0,
      totalprice REAL NOT NULL DEFAULT 0,
      payment_status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING/VERIFYING/PAID/FAILED
      paymentmode TEXT NOT NULL DEFAULT 'PENDING',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(payment_status);
    CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      provider TEXT NOT NULL DEFAULT 'UPI',
      payment_ref TEXT NOT NULL DEFAULT '',
      amount REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'INR',
      status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING/SUCCESS/FAILED
      receipt_path TEXT NOT NULL DEFAULT '',
      rating INTEGER NOT NULL DEFAULT 0,
      feedback TEXT NOT NULL DEFAULT '',
      customername TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
    CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
  `);

  await seed();
  console.log("✅ SQLite ready");
}

module.exports = { db, initDb, exec, get, run };
