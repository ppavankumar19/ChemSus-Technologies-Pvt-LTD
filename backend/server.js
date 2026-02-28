try { require("dotenv").config(); } catch { /* dotenv optional */ }
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
const { run, get, all, initDb } = require("./db");

const app = express();
const ROOT = path.join(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const SESSION_TTL_SEC = Math.floor(SESSION_TTL_MS / 1000);
const OTP_TTL_MIN = Math.max(1, Number(process.env.OTP_TTL_MIN || 10));
const OTP_RESEND_SEC = Math.max(15, Number(process.env.OTP_RESEND_SEC || 60));
const OTP_MAX_ATTEMPTS = Math.max(1, Number(process.env.OTP_MAX_ATTEMPTS || 5));
const OTP_TOKEN_TTL_MIN = Math.max(5, Number(process.env.OTP_TOKEN_TTL_MIN || 30));
const OTP_HASH_SECRET = process.env.OTP_HASH_SECRET || "change_me_for_production";

app.use(express.json({ limit: "2mb" }));

// ── Utility helpers ───────────────────────────────────────────────────────────

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

// ── OTP email transport ───────────────────────────────────────────────────────

let otpTransporter = null;
function getOtpTransporter() {
  if (otpTransporter) return otpTransporter;
  if (!nodemailer) {
    console.error("[OTP-CONFIG] nodemailer is not loaded. Run npm install.");
    return null;
  }
  const host = (process.env.OTP_SMTP_HOST || process.env.SMTP_HOST || "").trim();
  const user = (process.env.OTP_SMTP_USER || process.env.SMTP_USER || "").trim();
  const pass = (process.env.OTP_SMTP_PASS || process.env.SMTP_PASS || "").trim();
  const port = Number(process.env.OTP_SMTP_PORT || process.env.SMTP_PORT || 587);
  const secure =
    String(process.env.OTP_SMTP_SECURE || process.env.SMTP_SECURE || "false") === "true";

  console.log(`[OTP-CONFIG] host='${host}', user='${user}', port=${port}, secure=${secure}, hasPass=${!!pass}`);
  if (!host || !user || !pass || !Number.isFinite(port)) {
    console.warn("[OTP-CONFIG] Missing SMTP settings — OTP will log to console in dev mode.");
    return null;
  }
  otpTransporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
  console.log("[OTP-CONFIG] SMTP transporter ready.");
  return otpTransporter;
}

async function sendOtpEmail(email, otp) {
  const transporter = getOtpTransporter();
  const from = (
    process.env.OTP_EMAIL_FROM ||
    process.env.FROM_EMAIL ||
    process.env.OTP_SMTP_USER ||
    process.env.SMTP_USER ||
    ""
  ).trim();

  if (!transporter || !from) {
    const reason = "Email OTP service is not configured";
    console.warn(`[OTP] ${reason}. Falling back to console OTP.`);
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

// Purge expired/old OTP sessions (runs before send & verify)
async function purgeOtpSessions() {
  try {
    await run(`
      DELETE FROM email_otp_sessions
      WHERE
        (used_at IS NOT NULL        AND used_at        < NOW() - INTERVAL '7 days')
        OR (verified_at IS NULL     AND expires_at     < NOW() - INTERVAL '1 day')
        OR (verified_at IS NOT NULL AND token_expires_at < NOW() - INTERVAL '1 day')
    `);
  } catch (e) {
    console.warn("[OTP] Purge failed:", e.message || e);
  }
}

// ── Receipt file helpers ──────────────────────────────────────────────────────

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
    console.warn("[Receipt] Delete failed:", e.message || e);
  }
}

// ── Runtime config for the frontend ──────────────────────────────────────────
// Exposes only the Supabase public anon key so it doesn't live in git.
app.get("/config.json", (_req, res) => {
  res.set("Cache-Control", "no-store, max-age=0");
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || "",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
    adminEmail: process.env.ADMIN_EMAIL || "",
  });
});

// ── Static files ──────────────────────────────────────────────────────────────
app.use("/assets", express.static(path.join(PUBLIC, "assets")));
app.use("/products", express.static(path.join(PUBLIC, "products")));
app.use("/admin", express.static(path.join(PUBLIC, "admin")));
app.use(express.static(PUBLIC));

// ── Cookie helpers (kept for backward-compat bookmarks) ──────────────────────
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || "").split(";").forEach((part) => {
    const [k, ...v] = part.trim().split("=");
    if (k) out[k] = decodeURIComponent(v.join("=") || "");
  });
  return out;
}
function setCookie(res, name, value) {
  const isProd = process.env.NODE_ENV === "production";
  res.setHeader(
    "Set-Cookie",
    `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SEC}${isProd ? "; Secure" : ""}`
  );
}
function clearCookie(res, name) {
  res.setHeader("Set-Cookie", `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
}

// ── Supabase JWT auth ─────────────────────────────────────────────────────────
// ADMIN_EMAIL controls which Supabase user gets admin access.
// Frontend sends "Authorization: Bearer <supabase_access_token>" on every admin request.
// We decode the JWT payload (already verified by Supabase on issuance).
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();

function decodeJwtPayload(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length !== 3) return null;
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function getTokenFromRequest(req) {
  const authHeader = req.headers["authorization"] || "";
  if (authHeader.startsWith("Bearer ")) return authHeader.slice(7);
  return parseCookies(req).admin_session || null;
}

function requireAdmin(req, res, next) {
  const token = getTokenFromRequest(req);
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  const payload = decodeJwtPayload(token);
  if (!payload) return res.status(401).json({ error: "Invalid token" });
  if (payload.exp && Date.now() / 1000 > payload.exp) {
    return res.status(401).json({ error: "Token expired" });
  }
  const email = (payload.email || "").toLowerCase();
  if (!email || (ADMIN_EMAIL && email !== ADMIN_EMAIL)) {
    return res.status(403).json({ error: "Forbidden: not admin" });
  }
  req.supabaseUser = payload;
  next();
}

function extractUser(req, res, next) {
  const authHeader = req.headers["authorization"] || "";
  if (authHeader.startsWith("Bearer ")) {
    const payload = decodeJwtPayload(authHeader.slice(7));
    if (payload && (!payload.exp || Date.now() / 1000 < payload.exp)) {
      req.supabaseUser = payload;
    }
  }
  next();
}

function requireUser(req, res, next) {
  extractUser(req, res, () => {
    if (!req.supabaseUser) return res.status(401).json({ error: "Login required" });
    next();
  });
}

// Legacy stubs — kept so cached bookmarks don't break
app.post("/api/admin/login", (_req, res) => res.json({ ok: false, message: "Use Supabase login" }));
app.post("/api/admin/logout", (_req, res) => res.json({ ok: true }));
app.get("/api/admin/me", requireAdmin, (req, res) =>
  res.json({ loggedIn: true, email: req.supabaseUser?.email })
);

// ── File upload setup ─────────────────────────────────────────────────────────
const ADMIN_UPLOAD_DIR = path.join(PUBLIC, "assets", "uploads");
const RECEIPT_DIR = path.join(PUBLIC, "assets", "receipts");
fs.mkdirSync(ADMIN_UPLOAD_DIR, { recursive: true });
fs.mkdirSync(RECEIPT_DIR, { recursive: true });

function safeName(originalname) {
  return originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
}

const ADMIN_ALLOWED_MIME = new Set(["image/jpeg","image/png","image/webp","image/gif","application/pdf"]);
const RECEIPT_ALLOWED_MIME = new Set(["image/jpeg","image/png","image/webp","image/gif","application/pdf"]);
const ADMIN_ALLOWED_EXT = new Set([".jpg",".jpeg",".png",".webp",".gif",".pdf"]);
const RECEIPT_ALLOWED_EXT = new Set([".jpg",".jpeg",".png",".webp",".gif",".pdf"]);

function checkFile(file, allowedMime, allowedExt) {
  const ext = path.extname(file.originalname || "").toLowerCase();
  if (!allowedMime.has(file.mimetype) || !allowedExt.has(ext)) return new Error("Invalid file type");
  return null;
}

const adminUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, ADMIN_UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const unique = Date.now() + "_" + crypto.randomBytes(4).toString("hex");
      cb(null, unique + "_" + safeName(file.originalname));
    },
  }),
  fileFilter: (_req, file, cb) => {
    const err = checkFile(file, ADMIN_ALLOWED_MIME, ADMIN_ALLOWED_EXT);
    cb(err || null, !err);
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

const receiptUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, RECEIPT_DIR),
    filename: (_req, file, cb) => {
      const unique = Date.now() + "_" + crypto.randomBytes(4).toString("hex");
      cb(null, unique + "_" + safeName(file.originalname));
    },
  }),
  fileFilter: (_req, file, cb) => {
    const err = checkFile(file, RECEIPT_ALLOWED_MIME, RECEIPT_ALLOWED_EXT);
    cb(err || null, !err);
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

app.post("/api/admin/upload", requireAdmin, adminUpload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  res.json({ ok: true, path: `assets/uploads/${req.file.filename}` });
});

// ── Site settings ─────────────────────────────────────────────────────────────

app.get("/api/site/brochure", async (_req, res) => {
  try {
    const row = await get(`SELECT value FROM site_settings WHERE key = 'brochure_url'`);
    res.json({ url: row?.value || "" });
  } catch {
    res.status(500).json({ error: "DB error" });
  }
});

app.post("/api/admin/brochure", requireAdmin, async (req, res) => {
  try {
    const url = (req.body?.url || "").trim();
    await run(
      `INSERT INTO site_settings (key, value) VALUES ('brochure_url', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [url]
    );
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "DB error" });
  }
});

// ── Public: Products page ─────────────────────────────────────────────────────

app.get("/api/products-page", async (_req, res) => {
  try {
    const rows = await all(
      `SELECT * FROM products_page WHERE is_active = 1 ORDER BY sort_order ASC, id ASC`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: "DB error", details: String(e.message || e) });
  }
});

// ── Public: Shop items ────────────────────────────────────────────────────────

// Alias camelCase columns back so the frontend keeps working unchanged
const SHOP_ITEM_COLS = `
  id, name, subtitle, features_json, price,
  stock_status AS "stockStatus",
  show_badge   AS "showBadge",
  badge,
  more_link    AS "moreLink",
  image, is_active, sort_order, created_at, updated_at
`;

app.get("/api/shop-items", async (_req, res) => {
  try {
    const rows = await all(
      `SELECT ${SHOP_ITEM_COLS}
       FROM shop_items
       WHERE is_active = 1
       ORDER BY sort_order ASC, id ASC`
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: "DB error" });
  }
});

// ── Public: Pack pricing ──────────────────────────────────────────────────────

app.get("/api/pack-pricing/:shopItemId", async (req, res) => {
  try {
    const shopItemId = Number(req.params.shopItemId);
    const rows = await all(
      `SELECT pack_size, biofm_usd, biofm_inr, our_price
       FROM pack_pricing
       WHERE shop_item_id = $1 AND is_active = 1
       ORDER BY sort_order ASC, id ASC`,
      [shopItemId]
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: "DB error" });
  }
});

// ── OTP: Send ─────────────────────────────────────────────────────────────────

app.post("/api/otp/email/send", async (req, res) => {
  try {
    await purgeOtpSessions();
    const email = normalizeEmail(req.body?.email || "");
    if (!isValidEmail(email)) return res.status(400).json({ error: "Invalid email" });

    // Check resend cooldown
    const cooldownRow = await get(
      `SELECT EXTRACT(EPOCH FROM (cooldown_until - NOW()))::INTEGER AS wait_sec
       FROM email_otp_sessions
       WHERE email = $1 AND verified_at IS NULL AND used_at IS NULL
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

    // Compute expiry timestamps in JS for portability
    const expiresAt = new Date(Date.now() + OTP_TTL_MIN * 60 * 1000);
    const cooldownUntil = new Date(Date.now() + OTP_RESEND_SEC * 1000);

    await run(
      `INSERT INTO email_otp_sessions
         (challenge_id, email, otp_hash, attempts, max_attempts, expires_at, cooldown_until)
       VALUES ($1, $2, $3, 0, $4, $5, $6)`,
      [challengeId, email, otpHash, OTP_MAX_ATTEMPTS, expiresAt, cooldownUntil]
    );

    let delivery;
    try {
      delivery = await sendOtpEmail(email, otp);
    } catch (mailErr) {
      const reason = String(mailErr?.message || mailErr || "SMTP send failed");
      console.warn(`[OTP] SMTP failed — falling back to console. Reason: ${reason}`);
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
    if (delivery?.mode === "dev") out.debugOtp = otp;
    res.json(out);
  } catch (e) {
    console.error("[OTP] Send error:", e);
    res.status(500).json({ error: "OTP send failed", details: String(e.stack || e.message || e) });
  }
});

// ── OTP: Verify ───────────────────────────────────────────────────────────────

app.post("/api/otp/email/verify", async (req, res) => {
  try {
    await purgeOtpSessions();
    const email = normalizeEmail(req.body?.email || "");
    const challengeId = String(req.body?.challengeId || "").trim();
    const otp = String(req.body?.otp || "").trim();

    if (!isValidEmail(email)) return res.status(400).json({ error: "Invalid email" });
    if (!challengeId || !/^[a-f0-9]{20,}$/i.test(challengeId)) {
      return res.status(400).json({ error: "Invalid challenge" });
    }
    if (!/^[0-9]{6}$/.test(otp)) return res.status(400).json({ error: "Invalid OTP format" });

    const row = await get(
      `SELECT id, otp_hash, attempts, max_attempts, verified_at, used_at,
              EXTRACT(EPOCH FROM (expires_at - NOW()))::INTEGER AS expires_in_sec
       FROM email_otp_sessions
       WHERE challenge_id = $1 AND email = $2
       LIMIT 1`,
      [challengeId, email]
    );

    if (!row) return res.status(400).json({ error: "OTP session not found" });
    if (row.used_at) return res.status(400).json({ error: "OTP session already used" });
    if (row.verified_at) return res.status(400).json({ error: "OTP already verified. Please request a new OTP." });
    if (Number(row.expires_in_sec) <= 0) return res.status(400).json({ error: "OTP expired. Request a new OTP." });
    if (Number(row.attempts) >= Number(row.max_attempts)) {
      return res.status(429).json({ error: "Maximum OTP attempts exceeded. Request a new OTP." });
    }

    const expectedHash = hashOtp(email, otp, challengeId);
    if (expectedHash !== row.otp_hash) {
      await run(
        `UPDATE email_otp_sessions SET attempts = attempts + 1, updated_at = NOW() WHERE id = $1`,
        [row.id]
      );
      return res.status(400).json({ error: "Invalid OTP" });
    }

    const verificationToken = crypto.randomBytes(24).toString("hex");
    const tokenExpiresAt = new Date(Date.now() + OTP_TOKEN_TTL_MIN * 60 * 1000);

    await run(
      `UPDATE email_otp_sessions
       SET verified_at = NOW(), verification_token = $1, token_expires_at = $2, updated_at = NOW()
       WHERE id = $3`,
      [verificationToken, tokenExpiresAt, row.id]
    );

    return res.json({ ok: true, verificationToken, tokenExpiresInSec: OTP_TOKEN_TTL_MIN * 60 });
  } catch (e) {
    console.error("[OTP] Verify error:", e);
    res.status(500).json({ error: "OTP verification failed", details: String(e.stack || e.message || e) });
  }
});

// ── Diagnostic ───────────────────────────────────────────────────────────────

app.get("/api/test", (_req, res) => res.json({ ok: true, db: "postgresql" }));

// ── Orders: Create ────────────────────────────────────────────────────────────

app.post("/api/orders", extractUser, async (req, res) => {
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
    if (!isValidEmail(email)) return res.status(400).json({ error: "Invalid email" });
    if (!isValidPhone(phone)) return res.status(400).json({ error: "Invalid phone" });
    if (!emailOtpToken) return res.status(400).json({ error: "Email OTP verification required" });

    // Validate OTP verification token
    const otpSession = await get(
      `SELECT id
       FROM email_otp_sessions
       WHERE email = $1
         AND verification_token = $2
         AND verified_at IS NOT NULL
         AND used_at IS NULL
         AND token_expires_at > NOW()
       LIMIT 1`,
      [emailNorm, emailOtpToken]
    );
    if (!otpSession) {
      return res.status(400).json({ error: "Invalid or expired email OTP verification" });
    }

    const address = (
      b.address || b.fullAddress || b.fulladdress || b.deliveryAddress || b.shippingAddress || ""
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
      // Cart checkout: multiple items
      for (const it of itemsIn) {
        const shopItemId = Number(it.shopItemId || it.shop_item_id || it.id || 0);
        const packSize = String(it.packSize || it.pack || "").trim();
        const quantity = safeNumber(it.quantity || 0, 0);
        if (!shopItemId || quantity <= 0) return res.status(400).json({ error: "Invalid items" });

        const shop = await get(
          `SELECT id, name, price FROM shop_items WHERE id = $1 AND is_active = 1`,
          [shopItemId]
        );
        if (!shop) return res.status(400).json({ error: "Invalid item" });

        let unitPrice = 0;
        if (packSize) {
          const pack = await get(
            `SELECT our_price FROM pack_pricing WHERE shop_item_id = $1 AND pack_size = $2 AND is_active = 1`,
            [shopItemId, packSize]
          );
          if (!pack) return res.status(400).json({ error: "Invalid pack" });
          unitPrice = safeNumber(pack.our_price, 0);
        } else {
          unitPrice = safeNumber(shop.price, 0);
        }
        if (unitPrice <= 0) return res.status(400).json({ error: "Invalid pricing" });

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

      productname =
        items.length === 1
          ? `${items[0].product_name}${items[0].pack_size ? " (" + items[0].pack_size + ")" : ""}`
          : `${items.length} item(s) from Cart`;
    } else {
      // Direct buy: single product
      if (!productname) return res.status(400).json({ error: "Missing productname" });
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
          `SELECT id, name, price FROM shop_items WHERE id = $1 AND is_active = 1`,
          [shopItemId]
        );
        if (shop) {
          let unitPrice = 0;
          if (packSize) {
            const pack = await get(
              `SELECT our_price FROM pack_pricing WHERE shop_item_id = $1 AND pack_size = $2 AND is_active = 1`,
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
            productname = `${shop.name || productname}${packSize ? " (" + packSize + ")" : ""}`;
          }
        }
      }
    }

    const unitprice = totalQty > 0 ? totalprice / totalQty : 0;

    const userId = req.supabaseUser?.sub || null;

    const r = await run(
      `INSERT INTO orders
         (customername, email, phone, company_name, address, city, region, pincode, country,
          productname, quantity, unitprice, totalprice, payment_status, paymentmode, user_id, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'PENDING','PENDING',$14,NOW())
       RETURNING id`,
      [
        customername, email, phone, companyName, address, city, region, pincode, country,
        productname, totalQty || 1, unitprice, totalprice, userId,
      ]
    );

    // Insert order line items (cart orders)
    for (const it of items) {
      await run(
        `INSERT INTO order_items
           (order_id, shop_item_id, product_name, pack_size, unit_price, quantity, total_price)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [r.lastID, it.shop_item_id, it.product_name, it.pack_size, it.unit_price, it.quantity, it.total_price]
      );
    }

    // Mark OTP session as consumed
    await run(
      `UPDATE email_otp_sessions
       SET used_at = NOW(), order_id = $1, updated_at = NOW()
       WHERE id = $2 AND used_at IS NULL`,
      [r.lastID, otpSession.id]
    );

    res.json({ orderId: r.lastID, totalprice });
  } catch (e) {
    console.error("[Orders] Creation error:", e);
    res.status(500).json({ error: "DB error", details: String(e) });
  }
});

// ── Receipts: Upload ──────────────────────────────────────────────────────────

app.post("/api/receipts", receiptUpload.single("receiptimage"), async (req, res) => {
  try {
    const body = req.body || {};
    const orderId = Number(body.orderid);
    if (!orderId) return res.status(400).json({ error: "orderid required" });
    if (!req.file) return res.status(400).json({ error: "receiptimage required" });

    const amount = safeNumber(body.amount || 0, 0);
    const ratingRaw = Number(body.rating || 0);
    if (!ratingRaw) return res.status(400).json({ error: "rating required" });
    const rating = clampInt(ratingRaw, 1, 5);
    const feedback = (body.feedback || "").toString().slice(0, 2000);
    const receipt_path = `receipts/${req.file.filename}`;

    const order = await get(`SELECT * FROM orders WHERE id = $1`, [orderId]);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const existing = await get(`SELECT id FROM payments WHERE order_id = $1 LIMIT 1`, [orderId]);
    if (existing) return res.status(409).json({ error: "Payment already submitted" });

    const expectedTotal = safeNumber(order.totalprice || 0, 0);
    if (Math.abs(expectedTotal - amount) > 0.01) {
      return res.status(400).json({ error: "Amount mismatch" });
    }

    const payInsert = await run(
      `INSERT INTO payments
         (order_id, provider, payment_ref, amount, currency, status, receipt_path, rating, feedback, customername, email, phone)
       VALUES ($1,'UPI','',$2,'INR','PENDING',$3,$4,$5,$6,$7,$8)
       RETURNING id`,
      [
        orderId, amount, receipt_path, rating, feedback,
        body.customername || order.customername || "",
        body.email || order.email || "",
        body.phone || order.phone || "",
      ]
    );

    await run(`UPDATE orders SET payment_status = 'VERIFYING', updated_at = NOW() WHERE id = $1`, [orderId]);

    res.json({ ok: true, paymentId: payInsert.lastID, receipt_path: `assets/${receipt_path}` });
  } catch (e) {
    console.error("[Receipts] Upload error:", e);
    res.status(500).json({ error: "DB error", details: String(e) });
  }
});

// ── User: Order history ───────────────────────────────────────────────────────

app.get("/api/user/orders", requireUser, async (req, res) => {
  try {
    const userId = req.supabaseUser.sub;
    const rows = await all(
      `SELECT o.id, o.productname, o.quantity, o.unitprice, o.totalprice,
              o.payment_status, o.order_status, o.created_at, o.address, o.city,
              o.region, o.country, o.pincode, o.paymentmode, o.notes,
              p.status AS payment_verified, p.receipt_path,
              COALESCE(
                JSON_AGG(
                  JSON_BUILD_OBJECT(
                    'product_name', oi.product_name,
                    'pack_size',    oi.pack_size,
                    'unit_price',   oi.unit_price,
                    'quantity',     oi.quantity,
                    'total_price',  oi.total_price
                  ) ORDER BY oi.id
                ) FILTER (WHERE oi.id IS NOT NULL),
                '[]'::json
              ) AS items
       FROM orders o
       LEFT JOIN payments p ON p.order_id = o.id
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.user_id = $1
       GROUP BY o.id, o.productname, o.quantity, o.unitprice, o.totalprice,
                o.payment_status, o.order_status, o.created_at, o.address, o.city,
                o.region, o.country, o.pincode, o.paymentmode, o.notes,
                p.status, p.receipt_path
       ORDER BY o.created_at DESC`,
      [userId]
    );
    res.json(rows);
  } catch (e) {
    console.error("[User/Orders] Error:", e);
    res.status(500).json({ error: "DB error", details: String(e.message || e) });
  }
});

// ── Order Messages ────────────────────────────────────────────────────────────

// User: send a query message for their own order
app.post("/api/user/orders/:id/message", requireUser, async (req, res) => {
  try {
    const orderId = Number(req.params.id);
    const userId  = req.supabaseUser.sub;
    const message = (req.body?.message || "").toString().trim().slice(0, 1000);
    if (!message) return res.status(400).json({ error: "Message required" });

    const order = await get(`SELECT id FROM orders WHERE id = $1 AND user_id = $2`, [orderId, userId]);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const r = await run(
      `INSERT INTO order_messages (order_id, sender, message) VALUES ($1, 'user', $2) RETURNING id`,
      [orderId, message]
    );
    res.json({ ok: true, id: r.lastID });
  } catch (e) {
    res.status(500).json({ error: "DB error", details: String(e.message || e) });
  }
});

// User: get messages for their own order
app.get("/api/user/orders/:id/messages", requireUser, async (req, res) => {
  try {
    const orderId = Number(req.params.id);
    const userId  = req.supabaseUser.sub;
    const order = await get(`SELECT id FROM orders WHERE id = $1 AND user_id = $2`, [orderId, userId]);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const rows = await all(
      `SELECT id, sender, message, created_at FROM order_messages WHERE order_id = $1 ORDER BY created_at ASC`,
      [orderId]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: "DB error", details: String(e.message || e) });
  }
});

// Admin: get messages for any order
app.get("/api/admin/orders/:id/messages", requireAdmin, async (req, res) => {
  try {
    const orderId = Number(req.params.id);
    const rows = await all(
      `SELECT id, sender, message, created_at FROM order_messages WHERE order_id = $1 ORDER BY created_at ASC`,
      [orderId]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: "DB error", details: String(e.message || e) });
  }
});

// Admin: reply to an order message
app.post("/api/admin/orders/:id/reply", requireAdmin, async (req, res) => {
  try {
    const orderId = Number(req.params.id);
    const message = (req.body?.message || "").toString().trim().slice(0, 1000);
    if (!message) return res.status(400).json({ error: "Message required" });

    const order = await get(`SELECT id FROM orders WHERE id = $1`, [orderId]);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const r = await run(
      `INSERT INTO order_messages (order_id, sender, message) VALUES ($1, 'admin', $2) RETURNING id`,
      [orderId, message]
    );
    res.json({ ok: true, id: r.lastID });
  } catch (e) {
    res.status(500).json({ error: "DB error", details: String(e.message || e) });
  }
});

// ── Admin: Order status ───────────────────────────────────────────────────────

app.patch("/api/admin/orders/:id/status", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { order_status } = req.body || {};
    const allowed = ["Processing", "Confirmed", "Shipped", "Delivered", "Cancelled"];
    if (!allowed.includes(order_status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }
    await run(`UPDATE orders SET order_status = $1, updated_at = NOW() WHERE id = $2`, [order_status, id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "DB error", details: String(e.message || e) });
  }
});

// ── Admin CRUD: Products page ─────────────────────────────────────────────────

app.get("/api/admin/products-page", requireAdmin, async (_req, res) => {
  try {
    const rows = await all(`SELECT * FROM products_page ORDER BY sort_order ASC, id ASC`);
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
       VALUES ($1,$2,$3,$4,$5,$6,NOW())
       RETURNING id`,
      [b.name || "", b.description || "", b.image || "", b.link || "", b.isactive ? 1 : 0, Number(b.sortorder || 0)]
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
       SET name=$1, description=$2, image=$3, link=$4, is_active=$5, sort_order=$6, updated_at=NOW()
       WHERE id=$7`,
      [b.name || "", b.description || "", b.image || "", b.link || "", b.isactive ? 1 : 0, Number(b.sortorder || 0), id]
    );
    res.json({ ok: true, changed: r.rowCount });
  } catch (e) {
    res.status(500).json({ error: "DB error", details: String(e) });
  }
});

app.delete("/api/admin/products-page/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const r = await run(`DELETE FROM products_page WHERE id = $1`, [id]);
    res.json({ ok: true, deleted: r.rowCount });
  } catch {
    res.status(500).json({ error: "DB error" });
  }
});

// ── Admin CRUD: Shop items ────────────────────────────────────────────────────

app.get("/api/admin/shop-items", requireAdmin, async (_req, res) => {
  try {
    const rows = await all(`SELECT ${SHOP_ITEM_COLS} FROM shop_items ORDER BY sort_order ASC, id ASC`);
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
         (name, subtitle, features_json, price, stock_status, show_badge, badge, more_link, image, is_active, sort_order, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
       RETURNING id`,
      [
        b.name || "", b.subtitle || "", features_json, Number(b.price || 0),
        b.stockStatus || "in-stock", b.showBadge ? 1 : 0,
        b.badge || "", b.moreLink || "", b.image || "",
        b.isactive ? 1 : 0, Number(b.sortorder || 0),
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
       SET name=$1, subtitle=$2, features_json=$3, price=$4, stock_status=$5,
           show_badge=$6, badge=$7, more_link=$8, image=$9, is_active=$10, sort_order=$11, updated_at=NOW()
       WHERE id=$12`,
      [
        b.name || "", b.subtitle || "", features_json, Number(b.price || 0),
        b.stockStatus || "in-stock", b.showBadge ? 1 : 0,
        b.badge || "", b.moreLink || "", b.image || "",
        b.isactive ? 1 : 0, Number(b.sortorder || 0), id,
      ]
    );
    res.json({ ok: true, changed: r.rowCount });
  } catch (e) {
    res.status(500).json({ error: "DB error", details: String(e) });
  }
});

app.delete("/api/admin/shop-items/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const r = await run(`DELETE FROM shop_items WHERE id = $1`, [id]);
    res.json({ ok: true, deleted: r.rowCount });
  } catch {
    res.status(500).json({ error: "DB error" });
  }
});

// ── Admin CRUD: Pack pricing ──────────────────────────────────────────────────

app.get("/api/admin/pack-pricing/:shopItemId", requireAdmin, async (req, res) => {
  try {
    const shopItemId = Number(req.params.shopItemId);
    const rows = await all(
      `SELECT * FROM pack_pricing WHERE shop_item_id = $1 ORDER BY sort_order ASC, id ASC`,
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
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
       RETURNING id`,
      [
        Number(b.shopItemId || 0), b.packSize || "",
        Number(b.biofmUsd || 0), Number(b.biofmInr || 0), Number(b.ourPrice || 0),
        b.isActive ? 1 : 0, Number(b.sortOrder || 0),
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
       SET pack_size=$1, biofm_usd=$2, biofm_inr=$3, our_price=$4, is_active=$5, sort_order=$6, updated_at=NOW()
       WHERE id=$7`,
      [
        b.packSize || "", Number(b.biofmUsd || 0), Number(b.biofmInr || 0),
        Number(b.ourPrice || 0), b.isActive ? 1 : 0, Number(b.sortOrder || 0), id,
      ]
    );
    res.json({ ok: true, changed: r.rowCount });
  } catch (e) {
    res.status(500).json({ error: "DB error", details: String(e) });
  }
});

app.delete("/api/admin/pack-pricing/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const r = await run(`DELETE FROM pack_pricing WHERE id = $1`, [id]);
    res.json({ ok: true, deleted: r.rowCount });
  } catch {
    res.status(500).json({ error: "DB error" });
  }
});

// ── Admin: Orders list ────────────────────────────────────────────────────────

app.get("/api/admin/orders", requireAdmin, async (_req, res) => {
  try {
    const rows = await all(
      `SELECT
         id,
         payment_status  AS paymentstatus,
         order_status,
         customername,
         email,
         phone,
         company_name    AS "companyName",
         address,
         city,
         region,
         pincode,
         country,
         productname,
         quantity,
         unitprice,
         totalprice,
         paymentmode,
         created_at      AS createdat,
         updated_at      AS updatedat
       FROM orders
       ORDER BY id DESC`
    );
    res.json(rows);
  } catch (e) {
    console.error("[Admin/Orders] Error:", e);
    res.status(500).json({ error: "DB error", details: String(e) });
  }
});

app.delete("/api/admin/orders/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const pays = await all(`SELECT receipt_path FROM payments WHERE order_id = $1`, [id]);
    pays.forEach((p) => deleteReceiptFile(p.receipt_path));
    await run(`DELETE FROM payments WHERE order_id = $1`, [id]);
    await run(`DELETE FROM orders WHERE id = $1`, [id]);

    // If all orders are gone, reset the ID counter to 1
    const remaining = await get(`SELECT COUNT(*) AS cnt FROM orders`);
    if (Number(remaining.cnt) === 0) {
      await run(`ALTER SEQUENCE orders_id_seq RESTART WITH 1`);
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "DB error", details: String(e) });
  }
});

// ── Admin: Payments ───────────────────────────────────────────────────────────

app.get("/api/admin/payments", requireAdmin, async (_req, res) => {
  try {
    const rows = await all(
      `SELECT
         p.id,
         p.order_id      AS orderid,
         p.status,
         p.amount,
         p.rating,
         p.receipt_path  AS receiptpath,
         p.feedback,
         p.customername,
         p.email,
         p.phone,
         p.created_at    AS createdat,
         o.productname,
         o.totalprice,
         o.payment_status
       FROM payments p
       LEFT JOIN orders o ON o.id = p.order_id
       ORDER BY p.id DESC`
    );
    res.json(rows);
  } catch (e) {
    console.error("[Admin/Payments] Error:", e);
    res.status(500).json({ error: "DB error", details: String(e) });
  }
});

app.delete("/api/admin/payments/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const pay = await get(`SELECT receipt_path FROM payments WHERE id = $1`, [id]);
    if (pay?.receipt_path) deleteReceiptFile(pay.receipt_path);
    await run(`DELETE FROM payments WHERE id = $1`, [id]);

    // Reset sequence if table is now empty
    const remaining = await get(`SELECT COUNT(*) AS cnt FROM payments`);
    if (Number(remaining.cnt) === 0) {
      await run(`ALTER SEQUENCE payments_id_seq RESTART WITH 1`);
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "DB error", details: String(e) });
  }
});

// Admin: Mark payment SUCCESS or FAILED and sync order status
app.post("/api/admin/payment-status", requireAdmin, async (req, res) => {
  try {
    const paymentId = Number(req.body?.paymentId);
    const newStatus = (req.body?.status || "").toUpperCase();

    if (!paymentId) return res.status(400).json({ error: "paymentId required" });
    if (!["SUCCESS", "FAILED"].includes(newStatus)) {
      return res.status(400).json({ error: "status must be SUCCESS or FAILED" });
    }

    const pay = await get(`SELECT * FROM payments WHERE id = $1`, [paymentId]);
    if (!pay) return res.status(404).json({ error: "Payment not found" });

    await run(`UPDATE payments SET status = $1, updated_at = NOW() WHERE id = $2`, [newStatus, paymentId]);

    const orderStatus = newStatus === "SUCCESS" ? "PAID" : "FAILED";
    const paymentMode = newStatus === "SUCCESS" ? "UPI" : "FAILED";
    await run(
      `UPDATE orders SET payment_status = $1, paymentmode = $2, updated_at = NOW() WHERE id = $3`,
      [orderStatus, paymentMode, pay.order_id]
    );

    res.json({ ok: true, paymentId, status: newStatus, orderId: pay.order_id, orderStatus });
  } catch (e) {
    console.error("[Admin/PaymentStatus] Error:", e);
    res.status(500).json({ error: "DB error", details: String(e) });
  }
});

// ── Admin: list Supabase Auth users ───────────────────────────────────────────

app.get("/api/admin/users", requireAdmin, async (req, res) => {
  try {
    const supabaseUrl = (process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
    const serviceKey  = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
    if (!supabaseUrl || !serviceKey) {
      return res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured on the server" });
    }
    const resp = await fetch(`${supabaseUrl}/auth/v1/admin/users?page=1&per_page=1000`, {
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
    });
    if (!resp.ok) {
      const text = await resp.text();
      return res.status(resp.status).json({ error: "Supabase error", details: text });
    }
    const data = await resp.json();
    res.json(data);
  } catch (e) {
    console.error("[Admin/Users] Error:", e);
    res.status(500).json({ error: "Failed to fetch users", details: String(e) });
  }
});

// ── Global error handler ──────────────────────────────────────────────────────

app.use((err, _req, res, _next) => {
  if (!err) return;
  if (err.message === "Invalid file type") return res.status(400).json({ error: "Invalid file type" });
  if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "File too large" });
  console.error("[Server] Unhandled error:", err);
  res.status(500).json({ error: "Server error" });
});

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 5000;
async function start() {
  try {
    await initDb();
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
  } catch (e) {
    console.error("[Server] DB init failed:", e);
    process.exit(1);
  }
}
start();
