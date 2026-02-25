const path = require("path");
const fs = require("fs");
const os = require("os");
const sqlite3 = require("sqlite3").verbose();

const ROOT = path.join(__dirname, "..");
const DEFAULT_DB_PATH = path.join(ROOT, "db", "chemsus.sqlite");
const PRIMARY_DB_PATH = resolveDbPath(process.env.DB_PATH);
const FALLBACK_DB_PATH = resolveDbPath(
  process.env.DB_FALLBACK_PATH || path.join(os.tmpdir(), "chemsus.sqlite")
);

function resolveDbPath(rawPath) {
  const val = String(rawPath || "").trim();
  if (!val) return DEFAULT_DB_PATH;
  return path.isAbsolute(val) ? val : path.join(ROOT, val);
}

function ensureDirFor(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function isWritable(filePath) {
  try {
    ensureDirFor(filePath);
    const dir = path.dirname(filePath);
    const probeName = `.chemsus_write_probe_${process.pid}_${Date.now()}.tmp`;
    const probePath = path.join(dir, probeName);

    // Real write probe to avoid false positives from permission bits only.
    fs.writeFileSync(probePath, "ok");
    fs.unlinkSync(probePath);

    // Ensure DB file itself can be opened in read-write mode if it already exists.
    if (fs.existsSync(filePath)) {
      const fd = fs.openSync(filePath, "r+");
      fs.closeSync(fd);
    }

    return true;
  } catch {
    return false;
  }
}

function pickDbPath() {
  const primary = PRIMARY_DB_PATH;
  const forceFallback = String(process.env.DB_FORCE_FALLBACK || "").toLowerCase() === "true";
  if (!forceFallback && isWritable(primary)) return primary;

  const fallback = FALLBACK_DB_PATH;
  ensureDirFor(fallback);

  // Seed fallback DB with existing data once when possible.
  if (fs.existsSync(primary) && !fs.existsSync(fallback)) {
    try {
      fs.copyFileSync(primary, fallback);
    } catch (e) {
      console.warn("[DB] Failed to seed fallback DB:", e.message || e);
    }
  }

  if (isWritable(fallback)) {
    console.warn(
      `[DB] Primary DB path is not writable: ${primary}. Using fallback: ${fallback}`
    );
    return fallback;
  }

  // Last resort: return primary so startup still surfaces a clear SQLite error.
  return primary;
}

function seedFallbackFromPrimary(primary, fallback) {
  if (primary === fallback) return;
  if (fs.existsSync(primary) && !fs.existsSync(fallback)) {
    try {
      fs.copyFileSync(primary, fallback);
      console.warn(`[DB] Seeded fallback DB from primary: ${fallback}`);
    } catch (e) {
      console.warn("[DB] Failed to seed fallback DB:", e.message || e);
    }
  }
}

let ACTIVE_DB_PATH = pickDbPath();
let activeDb = new sqlite3.Database(ACTIVE_DB_PATH);
console.log(`[DB] SQLite path: ${ACTIVE_DB_PATH}`);

function isReadonlyError(err) {
  const code = String(err?.code || "");
  const msg = String(err?.message || err || "");
  return code === "SQLITE_READONLY" || /readonly database/i.test(msg);
}

function switchToFallbackIfReadonly(err) {
  if (!isReadonlyError(err)) return false;
  if (ACTIVE_DB_PATH === FALLBACK_DB_PATH) return false;

  ensureDirFor(FALLBACK_DB_PATH);
  seedFallbackFromPrimary(ACTIVE_DB_PATH, FALLBACK_DB_PATH);
  if (!isWritable(FALLBACK_DB_PATH)) return false;

  const oldPath = ACTIVE_DB_PATH;
  const oldDb = activeDb;
  activeDb = new sqlite3.Database(FALLBACK_DB_PATH);
  ACTIVE_DB_PATH = FALLBACK_DB_PATH;
  console.warn(
    `[DB] SQLite became read-only at ${oldPath}. Switched to fallback DB: ${FALLBACK_DB_PATH}`
  );

  try {
    oldDb.close(() => {});
  } catch {
    // ignore close errors while failing over
  }
  return true;
}

function invokeWithReadonlyRetry(methodName, args) {
  const userCb = typeof args[args.length - 1] === "function" ? args[args.length - 1] : null;
  if (!userCb) return activeDb[methodName](...args);

  const callArgs = args.slice(0, -1);
  const runAttempt = (allowRetry) =>
    activeDb[methodName](...callArgs, function (err, ...rest) {
      if (err && allowRetry && switchToFallbackIfReadonly(err)) {
        return runAttempt(false);
      }
      return userCb.call(this, err, ...rest);
    });

  return runAttempt(true);
}

const db = {
  run(...args) {
    return invokeWithReadonlyRetry("run", args);
  },
  get(...args) {
    return invokeWithReadonlyRetry("get", args);
  },
  all(...args) {
    return invokeWithReadonlyRetry("all", args);
  },
  exec(...args) {
    return invokeWithReadonlyRetry("exec", args);
  },
  close(...args) {
    return activeDb.close(...args);
  },
};

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

function all(sql, p = []) {
  return new Promise((resolve, reject) =>
    db.all(sql, p, (e, rows) => (e ? reject(e) : resolve(rows)))
  );
}

async function seed() {
  const st = await get(`SELECT COUNT(*) AS c FROM site_settings`);
  if ((st?.c || 0) === 0) {
    await run(`INSERT INTO site_settings(key,value) VALUES ('brochure_url','assets/brochure.pdf')`);
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

    CREATE TABLE IF NOT EXISTS pack_pricing (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_item_id INTEGER NOT NULL,
      pack_size TEXT NOT NULL,
      biofm_usd REAL NOT NULL DEFAULT 0,
      biofm_inr REAL NOT NULL DEFAULT 0,
      our_price REAL NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(shop_item_id) REFERENCES shop_items(id) ON DELETE CASCADE,
      UNIQUE(shop_item_id, pack_size)
    );

    CREATE INDEX IF NOT EXISTS idx_pack_pricing_item ON pack_pricing(shop_item_id);

    CREATE TABLE IF NOT EXISTS site_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );

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
      payment_status TEXT NOT NULL DEFAULT 'PENDING',
      paymentmode TEXT NOT NULL DEFAULT 'PENDING',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(payment_status);
    CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);

    CREATE TABLE IF NOT EXISTS email_otp_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      challenge_id TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL,
      otp_hash TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      expires_at TEXT NOT NULL,
      cooldown_until TEXT NOT NULL,
      verified_at TEXT DEFAULT NULL,
      verification_token TEXT DEFAULT NULL,
      token_expires_at TEXT DEFAULT NULL,
      used_at TEXT DEFAULT NULL,
      order_id INTEGER DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_email_otp_email ON email_otp_sessions(email);
    CREATE INDEX IF NOT EXISTS idx_email_otp_challenge ON email_otp_sessions(challenge_id);
    CREATE INDEX IF NOT EXISTS idx_email_otp_token ON email_otp_sessions(verification_token);

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      shop_item_id INTEGER NOT NULL,
      product_name TEXT NOT NULL DEFAULT '',
      pack_size TEXT NOT NULL DEFAULT '',
      unit_price REAL NOT NULL DEFAULT 0,
      quantity REAL NOT NULL DEFAULT 1,
      total_price REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY(shop_item_id) REFERENCES shop_items(id) ON DELETE RESTRICT
    );

    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      provider TEXT NOT NULL DEFAULT 'UPI',
      payment_ref TEXT NOT NULL DEFAULT '',
      amount REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'INR',
      status TEXT NOT NULL DEFAULT 'PENDING',
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
  console.log("✅ SQLite ready with pack_pricing table");
}

module.exports = { db, initDb, exec, get, run, all };
