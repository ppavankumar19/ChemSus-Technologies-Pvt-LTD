try { require("dotenv").config(); } catch { /* dotenv optional */ }
const { Pool } = require("pg");

if (!process.env.DATABASE_URL && !process.env.DB_HOST) {
  console.error("[DB] FATAL: No database connection configured.");
  console.error("[DB] Add DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME to your .env file.");
  process.exit(1);
}

// Build connection config — supports two modes:
//
// MODE 1 (recommended for Supabase — avoids URL-encoding issues with special chars in password):
//   DB_HOST=aws-0-ap-south-1.pooler.supabase.com
//   DB_PORT=6543
//   DB_USER=postgres.yourprojectref
//   DB_PASSWORD=YourPasswordHere   ← paste as-is, no URL encoding needed
//   DB_NAME=postgres
//
// MODE 2 (single URL — password must be URL-encoded if it has special chars):
//   DATABASE_URL=postgresql://user:password@host:port/dbname
//
// SSL auto-enables for Supabase hosts. Set DATABASE_SSL=false to force-disable (local dev).

const dbUrl = process.env.DATABASE_URL || "";
const dbHost = process.env.DB_HOST || "";

// Determine if SSL is needed
function resolveSSL(host) {
  if (process.env.DATABASE_SSL === "false") return false;
  const h = host || "";
  if (h.includes("supabase.co") || h.includes("supabase.com")) return { rejectUnauthorized: false };
  if (process.env.NODE_ENV === "production") return { rejectUnauthorized: false };
  return false;
}

// Trim all DB vars defensively (guards against accidental leading spaces in .env)
const t = (k, def = "") => (process.env[k] || "").trim() || def;

let poolConfig;
if (dbHost) {
  // Mode 1: individual params (safe with any password)
  const user = t("DB_USER", "postgres");
  const db   = t("DB_NAME", "postgres");
  const port = Number(t("DB_PORT", "5432")) || 5432;
  poolConfig = {
    host:     dbHost,
    port,
    user,
    password: t("DB_PASSWORD"),
    database: db,
    ssl:      resolveSSL(dbHost),
  };
  console.log(`[DB] Connecting as '${user}' to ${dbHost}:${port}/${db}`);
} else if (dbUrl) {
  // Mode 2: connection URL
  let urlHost = "";
  try { urlHost = new URL(dbUrl).hostname; } catch { /* ignore */ }
  poolConfig = {
    connectionString: dbUrl,
    ssl: resolveSSL(urlHost),
  };
} else {
  console.error("[DB] FATAL: Set DATABASE_URL or DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME in your .env file.");
  process.exit(1);
}

const pool = new Pool(poolConfig);

pool.on("error", (err) => {
  console.error("[DB] Unexpected pool error:", err.message);
});

// ── Core query helpers ────────────────────────────────────────────────────────

/** Returns the first row or null. */
async function get(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows[0] || null;
}

/** Returns all rows as an array. */
async function all(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

/**
 * Executes a write statement.
 * For INSERT ... RETURNING id, exposes lastID.
 * Exposes rowCount for UPDATE/DELETE affected-row counts.
 */
async function run(sql, params = []) {
  const result = await pool.query(sql, params);
  return {
    lastID: result.rows[0]?.id ?? null,
    rowCount: result.rowCount,
  };
}

// ── Schema ────────────────────────────────────────────────────────────────────

async function initDb() {
  // Products displayed on the /products page
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products_page (
      id          SERIAL PRIMARY KEY,
      name        TEXT    NOT NULL,
      description TEXT    NOT NULL DEFAULT '',
      image       TEXT    NOT NULL DEFAULT '',
      link        TEXT    NOT NULL DEFAULT '',
      is_active   INTEGER NOT NULL DEFAULT 1,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Buyable products shown in the shop
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shop_items (
      id           SERIAL PRIMARY KEY,
      name         TEXT             NOT NULL,
      subtitle     TEXT             NOT NULL DEFAULT '',
      features_json TEXT            NOT NULL DEFAULT '[]',
      price        DOUBLE PRECISION NOT NULL DEFAULT 0,
      stock_status TEXT             NOT NULL DEFAULT 'in-stock',
      show_badge   INTEGER          NOT NULL DEFAULT 0,
      badge        TEXT             NOT NULL DEFAULT '',
      more_link    TEXT             NOT NULL DEFAULT '',
      image        TEXT             NOT NULL DEFAULT '',
      is_active    INTEGER          NOT NULL DEFAULT 1,
      sort_order   INTEGER          NOT NULL DEFAULT 0,
      created_at   TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ      NOT NULL DEFAULT NOW()
    )
  `);

  // Pack sizes & tiered pricing per shop item
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pack_pricing (
      id           SERIAL PRIMARY KEY,
      shop_item_id INTEGER          NOT NULL REFERENCES shop_items(id) ON DELETE CASCADE,
      pack_size    TEXT             NOT NULL,
      biofm_usd    DOUBLE PRECISION NOT NULL DEFAULT 0,
      biofm_inr    DOUBLE PRECISION NOT NULL DEFAULT 0,
      our_price    DOUBLE PRECISION NOT NULL DEFAULT 0,
      is_active    INTEGER          NOT NULL DEFAULT 1,
      sort_order   INTEGER          NOT NULL DEFAULT 0,
      created_at   TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
      UNIQUE(shop_item_id, pack_size)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_pack_pricing_item ON pack_pricing(shop_item_id)`);

  // Key-value store for site configuration
  await pool.query(`
    CREATE TABLE IF NOT EXISTS site_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    )
  `);

  // Customer orders
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id             SERIAL PRIMARY KEY,
      customername   TEXT             NOT NULL DEFAULT '',
      email          TEXT             NOT NULL DEFAULT '',
      phone          TEXT             NOT NULL DEFAULT '',
      company_name   TEXT                      DEFAULT '',
      address        TEXT             NOT NULL DEFAULT '',
      city           TEXT             NOT NULL DEFAULT '',
      region         TEXT             NOT NULL DEFAULT '',
      pincode        TEXT             NOT NULL DEFAULT '',
      country        TEXT             NOT NULL DEFAULT 'India',
      productname    TEXT             NOT NULL DEFAULT '',
      quantity       DOUBLE PRECISION NOT NULL DEFAULT 1,
      unitprice      DOUBLE PRECISION NOT NULL DEFAULT 0,
      totalprice     DOUBLE PRECISION NOT NULL DEFAULT 0,
      payment_status TEXT             NOT NULL DEFAULT 'PENDING',
      paymentmode    TEXT             NOT NULL DEFAULT 'PENDING',
      notes          TEXT                      DEFAULT '',
      user_id        TEXT                      DEFAULT NULL,
      order_status   TEXT             NOT NULL DEFAULT 'Processing',
      created_at     TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ      NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_status   ON orders(payment_status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_created  ON orders(created_at)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_user     ON orders(user_id)`);

  // Email OTP sessions for order verification
  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_otp_sessions (
      id                 SERIAL PRIMARY KEY,
      challenge_id       TEXT        NOT NULL UNIQUE,
      email              TEXT        NOT NULL,
      otp_hash           TEXT        NOT NULL,
      attempts           INTEGER     NOT NULL DEFAULT 0,
      max_attempts       INTEGER     NOT NULL DEFAULT 5,
      expires_at         TIMESTAMPTZ NOT NULL,
      cooldown_until     TIMESTAMPTZ NOT NULL,
      verified_at        TIMESTAMPTZ          DEFAULT NULL,
      verification_token TEXT                 DEFAULT NULL,
      token_expires_at   TIMESTAMPTZ          DEFAULT NULL,
      used_at            TIMESTAMPTZ          DEFAULT NULL,
      order_id           INTEGER              DEFAULT NULL REFERENCES orders(id) ON DELETE SET NULL,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_email_otp_email     ON email_otp_sessions(email)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_email_otp_challenge ON email_otp_sessions(challenge_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_email_otp_token     ON email_otp_sessions(verification_token)`);

  // Line items within an order (cart purchases)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_items (
      id           SERIAL PRIMARY KEY,
      order_id     INTEGER          NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      shop_item_id INTEGER          NOT NULL REFERENCES shop_items(id) ON DELETE RESTRICT,
      product_name TEXT             NOT NULL DEFAULT '',
      pack_size    TEXT             NOT NULL DEFAULT '',
      unit_price   DOUBLE PRECISION NOT NULL DEFAULT 0,
      quantity     DOUBLE PRECISION NOT NULL DEFAULT 1,
      total_price  DOUBLE PRECISION NOT NULL DEFAULT 0,
      created_at   TIMESTAMPTZ      NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id)`);

  // Payment records & receipt uploads
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id           SERIAL PRIMARY KEY,
      order_id     INTEGER          NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      provider     TEXT             NOT NULL DEFAULT 'UPI',
      payment_ref  TEXT             NOT NULL DEFAULT '',
      amount       DOUBLE PRECISION NOT NULL DEFAULT 0,
      currency     TEXT             NOT NULL DEFAULT 'INR',
      status       TEXT             NOT NULL DEFAULT 'PENDING',
      receipt_path TEXT             NOT NULL DEFAULT '',
      rating       INTEGER          NOT NULL DEFAULT 0,
      feedback     TEXT             NOT NULL DEFAULT '',
      customername TEXT             NOT NULL DEFAULT '',
      email        TEXT             NOT NULL DEFAULT '',
      phone        TEXT             NOT NULL DEFAULT '',
      created_at   TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ      NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_payments_order  ON payments(order_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status)`);

  // Order messages — user queries and admin replies
  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_messages (
      id         SERIAL PRIMARY KEY,
      order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      sender     TEXT    NOT NULL DEFAULT 'user',
      message    TEXT    NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_order_messages_order ON order_messages(order_id)`);

  // Seed default site settings (idempotent)
  await pool.query(`
    INSERT INTO site_settings (key, value)
    VALUES ('brochure_url', 'assets/brochure.pdf')
    ON CONFLICT (key) DO NOTHING
  `);

  console.log("✅ PostgreSQL database ready");
}

module.exports = { pool, get, all, run, initDb };
