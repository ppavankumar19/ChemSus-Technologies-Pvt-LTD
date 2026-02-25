const express = require("express");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const fs = require("fs");
let nodemailer = null;
try {
  nodemailer = require("nodemailer");
} catch {
  nodemailer = null;
}
const { db, initDb, getActivePath } = require("./db");

const app = express();
const ROOT = path.join(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const SESSION_TTL_SEC = Math.floor(SESSION_TTL_MS / 1000);
const OTP_TTL_MIN = Math.max(1, Number(process.env.OTP_TTL_MIN || 10));
const OTP_RESEND_SEC = Math.max(15, Number(process.env.OTP_RESEND_SEC || 60));
const OTP_MAX_ATTEMPTS = Math.max(1, Number(process.env.OTP_MAX_ATTEMPTS || 5));
const OTP_TOKEN_TTL_MIN = Math.max(
  5,
  Number(process.env.OTP_TOKEN_TTL_MIN || 30)
);
const OTP_HASH_SECRET =
  process.env.OTP_HASH_SECRET || "change_me_for_production";

app.use(express.json({ limit: "2mb" }));

// ---------------- Helpers: Promise wrappers ----------------
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

function clampInt(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function safeNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function isValidEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());
}

function isValidPhone(s) {
  return /^[0-9]{10,15}$/.test(String(s || "").trim());
}

function normalizeEmail(s) {
  return String(s || "").trim().toLowerCase();
}

function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashOtp(email, otp, challengeId) {
  return crypto
    .createHash("sha256")
    .update(`${normalizeEmail(email)}|${otp}|${challengeId}|${OTP_HASH_SECRET}`)
    .digest("hex");
}

let otpTransporter = null;
function getOtpTransporter() {
  if (otpTransporter) return otpTransporter;
  if (!nodemailer) {
    console.error("[OTP-CONFIG] Error: nodemailer is NOT loaded. Run 'npm install' on the server.");
    return null;
  }

  const host = (process.env.OTP_SMTP_HOST || process.env.SMTP_HOST || "").trim();
  const user = (process.env.OTP_SMTP_USER || process.env.SMTP_USER || "").trim();
  const pass = (process.env.OTP_SMTP_PASS || process.env.SMTP_PASS || "").trim();
  const portVal = process.env.OTP_SMTP_PORT || process.env.SMTP_PORT;
  const port = Number(portVal || 587);
  const secure =
    String(process.env.OTP_SMTP_SECURE || process.env.SMTP_SECURE || "false") ===
    "true";

  console.log(`[OTP-CONFIG] Checking settings: host='${host}', user='${user}', port=${port}, secure=${secure}, hasPass=${!!pass}`);

  if (!host || !user || !pass || !Number.isFinite(port)) {
    console.warn("[OTP-CONFIG] FAILED: Missing one or more required SMTP settings (Host, User, Pass, or Port).");
    return null;
  }

  otpTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
  console.log("[OTP-CONFIG] SUCCESS: Transporter created.");
  return otpTransporter;
}

async function sendOtpEmail(email, otp) {
  const transporter = getOtpTransporter();
  const from =
    (
      process.env.OTP_EMAIL_FROM ||
      process.env.FROM_EMAIL ||
      process.env.OTP_SMTP_USER ||
      process.env.SMTP_USER ||
      ""
    ).trim();
  if (!transporter || !from) {
    const reason = "Email OTP service is not configured";
    console.warn(`[OTP] ${reason}. Falling back to debug OTP.`);
    console.log(`[OTP-DEV] email=${email} otp=${otp}`);
    return { mode: "dev", reason };
  }

  await transporter.sendMail({
    from,
    to: email,
    subject: "ChemSus Order Verification OTP",
    text: `Your ChemSus OTP is ${otp}. It expires in ${OTP_TTL_MIN} minutes.`,
    html: `<p>Your ChemSus OTP is <b>${otp}</b>.</p><p>This OTP expires in ${OTP_TTL_MIN} minutes.</p>`,
  });
  return { mode: "smtp" };
}

async function purgeOtpSessions() {
  try {
    await run(
      `DELETE FROM email_otp_sessions
       WHERE
         (used_at IS NOT NULL AND datetime(used_at) < datetime('now','-7 days'))
         OR (verified_at IS NULL AND datetime(expires_at) < datetime('now','-1 day'))
         OR (verified_at IS NOT NULL AND datetime(token_expires_at) < datetime('now','-1 day'))`
    );
  } catch (e) {
    console.warn("OTP purge failed:", e.message || e);
  }
}

const RECEIPT_ROOT = path.join(PUBLIC, "assets", "receipts");
function resolveReceiptPath(receiptPath) {
  const raw = String(receiptPath || "").replace(/^[\\/]+/, "");
  if (!raw) return "";
  if (raw.startsWith("assets/")) return path.join(PUBLIC, raw);
  if (raw.startsWith("receipts/")) return path.join(PUBLIC, "assets", raw);
  return path.join(PUBLIC, "assets", "receipts", raw);
}

function deleteReceiptFile(receiptPath) {
  try {
    const full = resolveReceiptPath(receiptPath);
    if (!full) return;
    const normalized = path.normalize(full);
    if (!normalized.startsWith(RECEIPT_ROOT)) return;
    if (fs.existsSync(normalized)) fs.unlinkSync(normalized);
  } catch (e) {
    console.warn("Receipt delete failed:", e.message || e);
  }
}

// ---------------- Static ----------------
app.use("/assets", express.static(path.join(PUBLIC, "assets")));
app.use("/products", express.static(path.join(PUBLIC, "products")));
app.use("/admin", express.static(path.join(PUBLIC, "admin")));
app.use(express.static(PUBLIC));

// ---------------- Cookies helper ----------------
function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  header.split(";").forEach((part) => {
    const [k, ...v] = part.trim().split("=");
    if (!k) return;
    out[k] = decodeURIComponent(v.join("=") || "");
  });
  return out;
}
function setCookie(res, name, value) {
  const isProd = process.env.NODE_ENV === "production";
  res.setHeader(
    "Set-Cookie",
    `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SEC}${isProd ? "; Secure" : ""
    }`
  );
}
function clearCookie(res, name) {
  res.setHeader(
    "Set-Cookie",
    `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`
  );
}

// ---------------- Admin auth ----------------
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "chemsus123";
const sessions = new Map();

function purgeExpiredSessions() {
  const now = Date.now();
  for (const [token, sess] of sessions.entries()) {
    if (now - sess.createdAt > SESSION_TTL_MS) sessions.delete(token);
  }
}

function normalizeOrigin(input) {
  try {
    const u = new URL(String(input || ""));
    const proto = u.protocol.toLowerCase();
    const host = u.hostname.toLowerCase();
    const port = u.port || (proto === "https:" ? "443" : "80");
    return `${proto}//${host}:${port}`;
  } catch {
    return null;
  }
}

function getAllowedRequestOrigins(req) {
  const protoRaw = String(
    req.headers["x-forwarded-proto"] || req.protocol || "http"
  );
  const hostRaw = String(req.headers["x-forwarded-host"] || req.get("host") || "");
  const proto = protoRaw.split(",")[0].trim() || "http";
  const host = hostRaw.split(",")[0].trim();
  const origins = new Set();

  const primary = normalizeOrigin(`${proto}://${host}`);
  if (primary) origins.add(primary);

  // Dev convenience: treat localhost and 127.0.0.1 as equivalent.
  try {
    const u = new URL(`${proto}://${host}`);
    const port = u.port || (u.protocol === "https:" ? "443" : "80");
    if (u.hostname === "localhost")
      origins.add(`${u.protocol.toLowerCase()}//127.0.0.1:${port}`);
    if (u.hostname === "127.0.0.1")
      origins.add(`${u.protocol.toLowerCase()}//localhost:${port}`);
  } catch { }

  return origins;
}

function isSameOrigin(req) {
  const secFetchSite = String(req.headers["sec-fetch-site"] || "").toLowerCase();
  if (
    secFetchSite &&
    !["same-origin", "same-site", "none"].includes(secFetchSite)
  ) {
    return false;
  }

  const source = req.headers.origin || req.headers.referer;
  if (!source) return true;

  const sourceOrigin = normalizeOrigin(source);
  if (!sourceOrigin) return false;

  return getAllowedRequestOrigins(req).has(sourceOrigin);
}

function requireAdminCsrf(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (!isSameOrigin(req)) return res.status(403).json({ error: "CSRF blocked" });
  return next();
}

function requireAdmin(req, res, next) {
  purgeExpiredSessions();
  const token = parseCookies(req).admin_session;
  if (!token || !sessions.has(token))
    return res.status(401).json({ error: "Unauthorized" });
  const sess = sessions.get(token);
  if (!sess || Date.now() - sess.createdAt > SESSION_TTL_MS) {
    sessions.delete(token);
    return res.status(401).json({ error: "Session expired" });
  }
  next();
}

app.use("/api/admin", (req, res, next) => {
  if (req.path === "/login") return next();
  requireAdminCsrf(req, res, next);
});

app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body || {};
  if (username !== ADMIN_USER || password !== ADMIN_PASS) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, { createdAt: Date.now() });
  setCookie(res, "admin_session", token);
  res.json({ ok: true });
});

app.post("/api/admin/logout", (req, res) => {
  const token = parseCookies(req).admin_session;
  if (token) sessions.delete(token);
  clearCookie(res, "admin_session");
  res.json({ ok: true });
});

app.get("/api/admin/me", (req, res) => {
  const token = parseCookies(req).admin_session;
  res.json({ loggedIn: !!(token && sessions.has(token)) });
});

// ---------------- Uploads ----------------
const ADMIN_UPLOAD_DIR = path.join(PUBLIC, "assets", "uploads");
const RECEIPT_DIR = path.join(PUBLIC, "assets", "receipts");
fs.mkdirSync(ADMIN_UPLOAD_DIR, { recursive: true });
fs.mkdirSync(RECEIPT_DIR, { recursive: true });

function safeName(originalname) {
  return originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
}

const ADMIN_ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);
const RECEIPT_ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);
const ADMIN_ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".pdf"]);
const RECEIPT_ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".pdf"]);

function checkFile(file, allowedMime, allowedExt) {
  const ext = path.extname(file.originalname || "").toLowerCase();
  if (!allowedMime.has(file.mimetype) || !allowedExt.has(ext)) {
    return new Error("Invalid file type");
  }
  return null;
}

const adminUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, ADMIN_UPLOAD_DIR),
    filename: (req, file, cb) => {
      const unique = Date.now() + "_" + crypto.randomBytes(4).toString("hex");
      cb(null, unique + "_" + safeName(file.originalname));
    },
  }),
  fileFilter: (req, file, cb) => {
    const err = checkFile(file, ADMIN_ALLOWED_MIME, ADMIN_ALLOWED_EXT);
    if (err) return cb(err);
    return cb(null, true);
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

const receiptUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, RECEIPT_DIR),
    filename: (req, file, cb) => {
      const unique = Date.now() + "_" + crypto.randomBytes(4).toString("hex");
      cb(null, unique + "_" + safeName(file.originalname));
    },
  }),
  fileFilter: (req, file, cb) => {
    const err = checkFile(file, RECEIPT_ALLOWED_MIME, RECEIPT_ALLOWED_EXT);
    if (err) return cb(err);
    return cb(null, true);
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

// Admin upload (site images/pdfs)
app.post(
  "/api/admin/upload",
  requireAdmin,
  adminUpload.single("file"),
  (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    res.json({ ok: true, path: `assets/uploads/${req.file.filename}` });
  }
);

// ---------------- Site settings (brochure) ----------------
app.get("/api/site/brochure", async (req, res) => {
  try {
    const row = await get(
      `SELECT value FROM site_settings WHERE key='brochure_url'`,
      []
    );
    res.json({ url: row?.value || "" });
  } catch (e) {
    res.status(500).json({ error: "DB error" });
  }
});

app.post("/api/admin/brochure", requireAdmin, async (req, res) => {
  try {
    const url = (req.body?.url || "").trim();
    await run(
      `INSERT INTO site_settings(key,value) VALUES('brochure_url', ?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
      [url]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "DB error" });
  }
});

// ---------------- Public APIs ----------------
app.get("/api/products-page", async (req, res) => {
  try {
    const rows = await all(
      `SELECT * FROM products_page WHERE is_active=1 ORDER BY sort_order ASC, id ASC`,
      []
    );
    res.json(rows);
  } catch (e) {
    console.error("Products page fetch error stack:", e);
    res.status(500).json({ error: "DB error", details: String(e.message || e) });
  }
});

app.post("/api/otp/email/verify", async (req, res) => {
  try {
    await purgeOtpSessions();
    const email = normalizeEmail(req.body?.email || "");
    const challengeId = String(req.body?.challengeId || "").trim();
    const otp = String(req.body?.otp || "").trim();

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Invalid email" });
    }
    if (!challengeId || !/^[a-f0-9]{20,}$/i.test(challengeId)) {
      return res.status(400).json({ error: "Invalid challenge" });
    }
    if (!/^[0-9]{6}$/.test(otp)) {
      return res.status(400).json({ error: "Invalid OTP format" });
    }

    const row = await get(
      `SELECT id, otp_hash, attempts, max_attempts, verified_at, used_at,
              CAST((julianday(expires_at) - julianday('now')) * 86400 AS INTEGER) AS expires_in_sec
       FROM email_otp_sessions
       WHERE challenge_id=? AND email=?
       LIMIT 1`,
      [challengeId, email]
    );

    if (!row) return res.status(400).json({ error: "OTP session not found" });
    if (row.used_at) return res.status(400).json({ error: "OTP session already used" });
    if (row.verified_at)
      return res.status(400).json({ error: "OTP already verified. Please request a new OTP." });
    if (Number(row.expires_in_sec) <= 0)
      return res.status(400).json({ error: "OTP expired. Request a new OTP." });
    if (Number(row.attempts) >= Number(row.max_attempts)) {
      return res.status(429).json({ error: "Maximum OTP attempts exceeded. Request a new OTP." });
    }

    const expectedHash = hashOtp(email, otp, challengeId);
    if (expectedHash !== row.otp_hash) {
      await run(
        `UPDATE email_otp_sessions
         SET attempts = attempts + 1, updated_at=datetime('now')
         WHERE id=?`,
        [row.id]
      );
      return res.status(400).json({ error: "Invalid OTP" });
    }

    const verificationToken = crypto.randomBytes(24).toString("hex");
    await run(
      `UPDATE email_otp_sessions
       SET verified_at=datetime('now'),
           verification_token=?,
           token_expires_at=datetime('now', ?),
           updated_at=datetime('now')
       WHERE id=?`,
      [verificationToken, `+${OTP_TOKEN_TTL_MIN} minutes`, row.id]
    );

    return res.json({
      ok: true,
      verificationToken,
      tokenExpiresInSec: OTP_TOKEN_TTL_MIN * 60,
    });
  } catch (e) {
    console.error("OTP verify error stack:", e);
    res.status(500).json({ error: "OTP verification failed", details: String(e.message || e) });
  }
});

app.get("/api/test", (req, res) =>
  res.json({ ok: true, apiBase: "/api", backendURL: req.headers.host })
);

app.post("/api/orders", async (req, res) => {
  try {
    const rows = await all(
      `SELECT * FROM shop_items WHERE is_active=1 ORDER BY sort_order ASC, id ASC`,
      []
    );
    res.json(rows);
  } catch (e) {
    console.error("Shop items fetch error stack:", e);
    res.status(500).json({ error: "DB error", details: String(e.message || e) });
  }
});

app.get("/api/shop-items", async (req, res) => {
  try {
    const rows = await all(
      `SELECT * FROM shop_items WHERE is_active=1 ORDER BY sort_order ASC, id ASC`,
      []
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: "DB error" });
  }
});

// ---------------- Admin CRUD: Products Page ----------------
app.get("/api/admin/products-page", requireAdmin, async (req, res) => {
  try {
    const rows = await all(
      `SELECT * FROM products_page ORDER BY sort_order ASC, id ASC`,
      []
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: "DB error" });
  }
});

app.post("/api/admin/products-page", requireAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    const r = await run(
      `INSERT INTO products_page (name, description, image, link, is_active, sort_order, updated_at)
       VALUES (?,?,?,?,?,?,datetime('now'))`,
      [
        b.name || "",
        b.description || "",
        b.image || "",
        b.link || "",
        b.isactive ? 1 : 0,
        Number(b.sortorder || 0),
      ]
    );
    res.json({ ok: true, id: r.lastID });
  } catch (e) {
    res.status(500).json({ error: "DB error", details: String(e) });
  }
});

app.put("/api/admin/products-page/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const b = req.body || {};
    const r = await run(
      `UPDATE products_page
       SET name=?, description=?, image=?, link=?, is_active=?, sort_order=?, updated_at=datetime('now')
       WHERE id=?`,
      [
        b.name || "",
        b.description || "",
        b.image || "",
        b.link || "",
        b.isactive ? 1 : 0,
        Number(b.sortorder || 0),
        id,
      ]
    );
    res.json({ ok: true, changed: r.changes });
  } catch (e) {
    res.status(500).json({ error: "DB error", details: String(e) });
  }
});

app.delete("/api/admin/products-page/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const r = await run(`DELETE FROM products_page WHERE id=?`, [id]);
    res.json({ ok: true, deleted: r.changes });
  } catch {
    res.status(500).json({ error: "DB error" });
  }
});

// ---------------- Admin CRUD: Shop Items ----------------
app.get("/api/admin/shop-items", requireAdmin, async (req, res) => {
  try {
    const rows = await all(
      `SELECT * FROM shop_items ORDER BY sort_order ASC, id ASC`,
      []
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: "DB error" });
  }
});

app.post("/api/admin/shop-items", requireAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    const features_json = JSON.stringify(b.features || []);
    const r = await run(
      `INSERT INTO shop_items
       (name, subtitle, features_json, price, stockStatus, showBadge, badge, moreLink, image, is_active, sort_order, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`,
      [
        b.name || "",
        b.subtitle || "",
        features_json,
        Number(b.price || 0),
        b.stockStatus || "in-stock",
        b.showBadge ? 1 : 0,
        b.badge || "",
        b.moreLink || "",
        b.image || "",
        b.isactive ? 1 : 0,
        Number(b.sortorder || 0),
      ]
    );
    res.json({ ok: true, id: r.lastID });
  } catch (e) {
    res.status(500).json({ error: "DB error", details: String(e) });
  }
});

app.put("/api/admin/shop-items/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const b = req.body || {};
    const features_json = JSON.stringify(b.features || []);
    const r = await run(
      `UPDATE shop_items
       SET name=?, subtitle=?, features_json=?, price=?, stockStatus=?, showBadge=?, badge=?, moreLink=?, image=?, is_active=?, sort_order=?, updated_at=datetime('now')
       WHERE id=?`,
      [
        b.name || "",
        b.subtitle || "",
        features_json,
        Number(b.price || 0),
        b.stockStatus || "in-stock",
        b.showBadge ? 1 : 0,
        b.badge || "",
        b.moreLink || "",
        b.image || "",
        b.isactive ? 1 : 0,
        Number(b.sortorder || 0),
        id,
      ]
    );
    res.json({ ok: true, changed: r.changes });
  } catch (e) {
    res.status(500).json({ error: "DB error", details: String(e) });
  }
});

app.delete("/api/admin/shop-items/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const r = await run(`DELETE FROM shop_items WHERE id=?`, [id]);
    res.json({ ok: true, deleted: r.changes });
  } catch {
    res.status(500).json({ error: "DB error" });
  }
});

// ---------------- Admin CRUD: Pack Pricing ----------------
app.get("/api/admin/pack-pricing/:shopItemId", requireAdmin, async (req, res) => {
  try {
    const shopItemId = Number(req.params.shopItemId);
    const rows = await all(
      `SELECT * FROM pack_pricing WHERE shop_item_id=? ORDER BY sort_order ASC, id ASC`,
      [shopItemId]
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: "DB error" });
  }
});

app.post("/api/admin/pack-pricing", requireAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    const r = await run(
      `INSERT INTO pack_pricing
       (shop_item_id, pack_size, biofm_usd, biofm_inr, our_price, is_active, sort_order, updated_at)
       VALUES (?,?,?,?,?,?,?,datetime('now'))`,
      [
        Number(b.shopItemId || 0),
        b.packSize || "",
        Number(b.biofmUsd || 0),
        Number(b.biofmInr || 0),
        Number(b.ourPrice || 0),
        b.isActive ? 1 : 0,
        Number(b.sortOrder || 0),
      ]
    );
    res.json({ ok: true, id: r.lastID });
  } catch (e) {
    res.status(500).json({ error: "DB error", details: String(e) });
  }
});

app.put("/api/admin/pack-pricing/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const b = req.body || {};
    const r = await run(
      `UPDATE pack_pricing
       SET pack_size=?, biofm_usd=?, biofm_inr=?, our_price=?, is_active=?, sort_order=?, updated_at=datetime('now')
       WHERE id=?`,
      [
        b.packSize || "",
        Number(b.biofmUsd || 0),
        Number(b.biofmInr || 0),
        Number(b.ourPrice || 0),
        b.isActive ? 1 : 0,
        Number(b.sortOrder || 0),
        id,
      ]
    );
    res.json({ ok: true, changed: r.changes });
  } catch (e) {
    res.status(500).json({ error: "DB error", details: String(e) });
  }
});

app.delete("/api/admin/pack-pricing/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const r = await run(`DELETE FROM pack_pricing WHERE id=?`, [id]);
    res.json({ ok: true, deleted: r.changes });
  } catch {
    res.status(500).json({ error: "DB error" });
  }
});

// Public API: Get pack pricing for shop page
app.get("/api/pack-pricing/:shopItemId", async (req, res) => {
  try {
    const shopItemId = Number(req.params.shopItemId);
    const rows = await all(
      `SELECT pack_size, biofm_usd, biofm_inr, our_price FROM pack_pricing 
       WHERE shop_item_id=? AND is_active=1 ORDER BY sort_order ASC, id ASC`,
      [shopItemId]
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: "DB error" });
  }
});

// ---------------- Orders API ----------------
app.post("/api/otp/email/send", async (req, res) => {
  try {
    await purgeOtpSessions();
    const email = normalizeEmail(req.body?.email || "");
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Invalid email" });
    }

    const cooldownRow = await get(
      `SELECT CAST((julianday(cooldown_until) - julianday('now')) * 86400 AS INTEGER) AS wait_sec
       FROM email_otp_sessions
       WHERE email=? AND verified_at IS NULL AND used_at IS NULL
       ORDER BY id DESC
       LIMIT 1`,
      [email]
    );
    if (cooldownRow && Number(cooldownRow.wait_sec) > 0) {
      return res.status(429).json({
        error: "Please wait before requesting another OTP",
        retryAfterSec: Number(cooldownRow.wait_sec),
      });
    }

    const challengeId = crypto.randomBytes(18).toString("hex");
    const otp = generateOtpCode();
    const otpHash = hashOtp(email, otp, challengeId);

    await run(
      `INSERT INTO email_otp_sessions
       (challenge_id,email,otp_hash,attempts,max_attempts,expires_at,cooldown_until,created_at,updated_at)
       VALUES (?,?,?,0,?,datetime('now', ?),datetime('now', ?),datetime('now'),datetime('now'))`,
      [
        challengeId,
        email,
        otpHash,
        OTP_MAX_ATTEMPTS,
        `+${OTP_TTL_MIN} minutes`,
        `+${OTP_RESEND_SEC} seconds`,
      ]
    );

    let delivery;
    try {
      delivery = await sendOtpEmail(email, otp);
    } catch (mailErr) {
      const reason = String(mailErr?.message || mailErr || "OTP mail send failed");
      console.warn(`[OTP] SMTP send failed. Falling back to debug OTP. Reason: ${reason}`);
      console.log(`[OTP-DEV] email=${email} otp=${otp}`);
      delivery = { mode: "dev", reason };
    }

    const out = {
      ok: true,
      challengeId,
      expiresInSec: OTP_TTL_MIN * 60,
      resendInSec: OTP_RESEND_SEC,
      delivery: delivery?.mode || "unknown",
      details: delivery?.reason || "",
    };
    if ((delivery?.mode || "") === "dev") {
      out.debugOtp = otp;
    }
    res.json(out);
  } catch (e) {
    console.error("OTP send error stack:", e);
    const activePath = typeof getActivePath === 'function' ? getActivePath() : 'unknown';
    res.status(500).json({
      error: "OTP send failed",
      details: String(e.stack || e.message || e),
      dbPath: activePath
    });
  }
});

app.post("/api/otp/email/verify", async (req, res) => {
  try {
    await purgeOtpSessions();
    const email = normalizeEmail(req.body?.email || "");
    const challengeId = String(req.body?.challengeId || "").trim();
    const otp = String(req.body?.otp || "").trim();

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Invalid email" });
    }
    if (!challengeId || !/^[a-f0-9]{20,}$/i.test(challengeId)) {
      return res.status(400).json({ error: "Invalid challenge" });
    }
    if (!/^[0-9]{6}$/.test(otp)) {
      return res.status(400).json({ error: "Invalid OTP format" });
    }

    const row = await get(
      `SELECT id, otp_hash, attempts, max_attempts, verified_at, used_at,
              CAST((julianday(expires_at) - julianday('now')) * 86400 AS INTEGER) AS expires_in_sec
       FROM email_otp_sessions
       WHERE challenge_id=? AND email=?
       LIMIT 1`,
      [challengeId, email]
    );

    if (!row) return res.status(400).json({ error: "OTP session not found" });
    if (row.used_at) return res.status(400).json({ error: "OTP session already used" });
    if (row.verified_at)
      return res.status(400).json({ error: "OTP already verified. Please request a new OTP." });
    if (Number(row.expires_in_sec) <= 0)
      return res.status(400).json({ error: "OTP expired. Request a new OTP." });
    if (Number(row.attempts) >= Number(row.max_attempts)) {
      return res.status(429).json({ error: "Maximum OTP attempts exceeded. Request a new OTP." });
    }

    const expectedHash = hashOtp(email, otp, challengeId);
    if (expectedHash !== row.otp_hash) {
      await run(
        `UPDATE email_otp_sessions
         SET attempts = attempts + 1, updated_at=datetime('now')
         WHERE id=?`,
        [row.id]
      );
      return res.status(400).json({ error: "Invalid OTP" });
    }

    const verificationToken = crypto.randomBytes(24).toString("hex");
    await run(
      `UPDATE email_otp_sessions
       SET verified_at=datetime('now'),
           verification_token=?,
           token_expires_at=datetime('now', ?),
           updated_at=datetime('now')
       WHERE id=?`,
      [verificationToken, `+${OTP_TOKEN_TTL_MIN} minutes`, row.id]
    );

    return res.json({
      ok: true,
      verificationToken,
      tokenExpiresInSec: OTP_TOKEN_TTL_MIN * 60,
    });
  } catch (e) {
    console.error("OTP verify error stack:", e);
    res.status(500).json({ error: "OTP verification failed", details: String(e.stack || e.message || e) });
  }
});

app.get("/api/test", (req, res) =>
  res.json({ ok: true, apiBase: "/api", backendURL: req.headers.host })
);

app.post("/api/orders", async (req, res) => {
  try {
    await purgeOtpSessions();
    const b = req.body || {};

    const customername = (b.customername || "").trim();
    const email = (b.email || "").trim();
    const emailNorm = normalizeEmail(email);
    const phone = (b.phone || "").trim();
    const emailOtpToken = String(b.emailOtpToken || "").trim();
    const companyName = (b.companyName || "").trim();

    if (!customername || !email || !phone) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Invalid email" });
    }
    if (!isValidPhone(phone)) {
      return res.status(400).json({ error: "Invalid phone" });
    }
    if (!emailOtpToken) {
      return res.status(400).json({ error: "Email OTP verification required" });
    }

    const otpSession = await get(
      `SELECT id
       FROM email_otp_sessions
       WHERE email=?
         AND verification_token=?
         AND verified_at IS NOT NULL
         AND used_at IS NULL
         AND datetime(token_expires_at) > datetime('now')
       LIMIT 1`,
      [emailNorm, emailOtpToken]
    );
    if (!otpSession) {
      return res.status(400).json({ error: "Invalid or expired email OTP verification" });
    }

    const address = (
      b.address ||
      b.fullAddress ||
      b.fulladdress ||
      b.deliveryAddress ||
      b.shippingAddress ||
      ""
    ).trim();

    const city = (b.city || "").trim();
    const region = (b.region || "").trim();
    const pincode = (b.pincode || "").trim();
    const country = (b.country || "India").trim();

    const itemsIn = Array.isArray(b.items) ? b.items : [];
    let items = [];
    let totalprice = 0;
    let totalQty = 0;
    let productname = (b.productname || "").trim();

    if (itemsIn.length > 0) {
      for (const it of itemsIn) {
        const shopItemId = Number(it.shopItemId || it.shop_item_id || it.id || 0);
        const packSize = String(it.packSize || it.pack || "").trim();
        const quantity = safeNumber(it.quantity || 0, 0);
        if (!shopItemId || quantity <= 0) {
          return res.status(400).json({ error: "Invalid items" });
        }
        const shop = await get(
          `SELECT id, name, price FROM shop_items WHERE id=? AND is_active=1`,
          [shopItemId]
        );
        if (!shop) return res.status(400).json({ error: "Invalid item" });

        let unitPrice = 0;
        if (packSize) {
          const pack = await get(
            `SELECT our_price FROM pack_pricing WHERE shop_item_id=? AND pack_size=? AND is_active=1`,
            [shopItemId, packSize]
          );
          if (!pack) return res.status(400).json({ error: "Invalid pack" });
          unitPrice = safeNumber(pack.our_price, 0);
        } else {
          unitPrice = safeNumber(shop.price, 0);
        }
        if (unitPrice <= 0) {
          return res.status(400).json({ error: "Invalid pricing" });
        }
        const lineTotal = unitPrice * quantity;
        totalprice += lineTotal;
        totalQty += quantity;
        items.push({
          shop_item_id: shopItemId,
          product_name: shop.name || "",
          pack_size: packSize,
          unit_price: unitPrice,
          quantity,
          total_price: lineTotal,
        });
      }

      if (items.length === 1) {
        const one = items[0];
        productname = `${one.product_name}${one.pack_size ? " (" + one.pack_size + ")" : ""}`;
      } else {
        productname = `${items.length} item(s) from Cart`;
      }
    } else {
      if (!productname) {
        return res.status(400).json({ error: "Missing productname" });
      }
      const quantity = safeNumber(b.quantity || 1, 1);
      const total = safeNumber(b.totalprice || 0, 0);
      if (quantity <= 0 || total <= 0) {
        return res.status(400).json({ error: "Invalid quantity or price" });
      }
      totalprice = total;
      totalQty = quantity;

      const shopItemId = Number(b.shopItemId || 0);
      const packSize = String(b.packSize || b.pack || "").trim();
      if (shopItemId) {
        const shop = await get(
          `SELECT id, name, price FROM shop_items WHERE id=? AND is_active=1`,
          [shopItemId]
        );
        if (shop) {
          let unitPrice = 0;
          if (packSize) {
            const pack = await get(
              `SELECT our_price FROM pack_pricing WHERE shop_item_id=? AND pack_size=? AND is_active=1`,
              [shopItemId, packSize]
            );
            unitPrice = safeNumber(pack?.our_price || 0, 0);
          } else {
            unitPrice = safeNumber(shop.price, 0);
          }
          if (unitPrice > 0) {
            totalprice = unitPrice * quantity;
            items.push({
              shop_item_id: shopItemId,
              product_name: shop.name || "",
              pack_size: packSize,
              unit_price: unitPrice,
              quantity,
              total_price: totalprice,
            });
            productname = `${shop.name || productname}${packSize ? " (" + packSize + ")" : ""
              }`;
          }
        }
      }
    }

    const unitprice = totalQty > 0 ? totalprice / totalQty : 0;
    const r = await run(
      `INSERT INTO orders
        (customername,email,phone,companyName,address,city,region,pincode,country,
         productname,quantity,unitprice,totalprice,payment_status,paymentmode,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'PENDING','PENDING',datetime('now'))`,
      [
        customername,
        email,
        phone,
        companyName,
        address,
        city,
        region,
        pincode,
        country,
        productname,
        totalQty || 1,
        unitprice,
        totalprice,
      ]
    );

    if (items.length > 0) {
      for (const it of items) {
        await run(
          `INSERT INTO order_items
           (order_id, shop_item_id, product_name, pack_size, unit_price, quantity, total_price)
           VALUES (?,?,?,?,?,?,?)`,
          [
            r.lastID,
            it.shop_item_id,
            it.product_name,
            it.pack_size,
            it.unit_price,
            it.quantity,
            it.total_price,
          ]
        );
      }
    }

    await run(
      `UPDATE email_otp_sessions
       SET used_at=datetime('now'), order_id=?, updated_at=datetime('now')
       WHERE id=? AND used_at IS NULL`,
      [r.lastID, otpSession.id]
    );

    res.json({ orderId: r.lastID });
  } catch (e) {
    console.error("Order creation error:", e);
    res.status(500).json({ error: "DB error", details: String(e) });
  }
});

// ---------------- Receipts API ----------------
app.post(
  "/api/receipts",
  receiptUpload.single("receiptimage"),
  async (req, res) => {
    try {
      const body = req.body || {};
      const orderId = Number(body.orderid);

      if (!orderId)
        return res.status(400).json({ error: "orderid required" });
      if (!req.file)
        return res.status(400).json({ error: "receiptimage required" });

      const amount = safeNumber(body.amount || 0, 0);
      const ratingRaw = Number(body.rating || 0);
      if (!ratingRaw) return res.status(400).json({ error: "rating required" });
      const rating = clampInt(ratingRaw, 1, 5);
      const feedback = (body.feedback || "").toString().slice(0, 2000);
      const receipt_path = `receipts/${req.file.filename}`;

      const order = await get(`SELECT * FROM orders WHERE id=?`, [orderId]);
      if (!order) return res.status(404).json({ error: "Order not found" });

      const existing = await get(
        `SELECT id FROM payments WHERE order_id=? LIMIT 1`,
        [orderId]
      );
      if (existing)
        return res.status(409).json({ error: "Payment already submitted" });

      const expectedTotal = safeNumber(order.totalprice || 0, 0);
      if (Math.abs(expectedTotal - amount) > 0.01) {
        return res.status(400).json({ error: "Amount mismatch" });
      }

      const payInsert = await run(
        `INSERT INTO payments
        (order_id,provider,payment_ref,amount,currency,status,receipt_path,rating,feedback,customername,email,phone)
       VALUES (?, 'UPI', '', ?, 'INR', 'PENDING', ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          amount,
          receipt_path,
          rating,
          feedback,
          body.customername || order.customername || "",
          body.email || order.email || "",
          body.phone || order.phone || "",
        ]
      );

      await run(
        `UPDATE orders SET payment_status='VERIFYING', updated_at=datetime('now') WHERE id=?`,
        [orderId]
      );

      res.json({
        ok: true,
        paymentId: payInsert.lastID,
        receipt_path: `assets/${receipt_path}`,
      });
    } catch (e) {
      console.error("Receipt upload error:", e);
      res.status(500).json({ error: "DB error", details: String(e) });
    }
  }
);

// Delete an order (also delete linked payments)
app.delete("/api/admin/orders/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const pays = await all(`SELECT receipt_path FROM payments WHERE order_id = ?`, [id]);
    pays.forEach((p) => deleteReceiptFile(p.receipt_path));
    await run("DELETE FROM payments WHERE order_id = ?", [id]);
    await run("DELETE FROM orders WHERE id = ?", [id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "DB error", details: String(e) });
  }
});

// Delete payment/receipt
app.delete("/api/admin/payments/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const pay = await get(`SELECT receipt_path FROM payments WHERE id = ?`, [id]);
    if (pay?.receipt_path) deleteReceiptFile(pay.receipt_path);
    await run("DELETE FROM payments WHERE id = ?", [id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "DB error", details: String(e) });
  }
});

// ---------------- Admin: Orders + Payments ----------------
app.get("/api/admin/orders", requireAdmin, async (req, res) => {
  try {
    const rows = await all(
      `SELECT
         id, payment_status AS paymentstatus, customername, email, phone,
         companyName, address, city, region, pincode, country,
         productname, quantity, unitprice, totalprice, paymentmode,
         created_at AS createdat, updated_at AS updatedat
       FROM orders
       ORDER BY id DESC`,
      []
    );
    res.json(rows);
  } catch (e) {
    console.error("Admin orders error:", e);
    res.status(500).json({ error: "DB error", details: String(e) });
  }
});

app.get("/api/admin/payments", requireAdmin, async (req, res) => {
  try {
    const rows = await all(
      `SELECT 
         p.id, 
         p.order_id AS orderid, 
         p.status, 
         p.amount, 
         p.rating, 
         p.receipt_path AS receiptpath, 
         p.feedback,
         p.customername,
         p.email,
         p.phone,
         p.created_at AS createdat,
         o.productname, 
         o.totalprice, 
         o.payment_status
       FROM payments p
       LEFT JOIN orders o ON o.id = p.order_id
       ORDER BY p.id DESC`,
      []
    );
    res.json(rows);
  } catch (e) {
    console.error("Admin payments error:", e);
    res.status(500).json({ error: "DB error", details: String(e) });
  }
});

// Admin: Mark payment SUCCESS/FAILED and sync order
app.post("/api/admin/payment-status", requireAdmin, async (req, res) => {
  try {
    const paymentId = Number(req.body?.paymentId);
    const newStatus = (req.body?.status || "").toUpperCase();

    if (!paymentId)
      return res.status(400).json({ error: "paymentId required" });
    if (!["SUCCESS", "FAILED"].includes(newStatus))
      return res
        .status(400)
        .json({ error: "status must be SUCCESS or FAILED" });

    const pay = await get(`SELECT * FROM payments WHERE id=?`, [paymentId]);
    if (!pay) return res.status(404).json({ error: "Payment not found" });

    await run(`UPDATE payments SET status=? WHERE id=?`, [
      newStatus,
      paymentId,
    ]);

    const orderStatus = newStatus === "SUCCESS" ? "PAID" : "FAILED";
    await run(
      `UPDATE orders SET payment_status=?, paymentmode=?, updated_at=datetime('now') WHERE id=?`,
      [orderStatus, newStatus === "SUCCESS" ? "UPI" : "FAILED", pay.order_id]
    );

    res.json({
      ok: true,
      paymentId,
      status: newStatus,
      orderId: pay.order_id,
      orderStatus,
    });
  } catch (e) {
    console.error("Payment status update error:", e);
    res.status(500).json({ error: "DB error", details: String(e) });
  }
});

app.use((err, req, res, next) => {
  if (!err) return next();
  if (err.message === "Invalid file type") {
    return res.status(400).json({ error: "Invalid file type" });
  }
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "File too large" });
  }
  console.error("Unhandled error:", err);
  return res.status(500).json({ error: "Server error" });
});

const PORT = process.env.PORT || 5000;
async function start() {
  try {
    await initDb();
    app.listen(PORT, () =>
      console.log(`Server running on http://localhost:${PORT}`)
    );
  } catch (e) {
    console.error("DB init failed:", e);
    process.exit(1);
  }
}

start();
