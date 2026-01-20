// backend/server.js
const express = require("express");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const fs = require("fs");
const { db, initDb } = require("./db");

const app = express();
const ROOT = path.join(__dirname, "..");

// ---------- DB init (DO NOT delete sqlite file) ----------
initDb().catch((e) => {
  console.error("DB init failed:", e);
  process.exit(1);
});

app.use(express.json({ limit: "2mb" }));

// ---------------- Static ----------------
app.use("/assets", express.static(path.join(ROOT, "assets")));
app.use("/products", express.static(path.join(ROOT, "products")));
app.use("/admin", express.static(path.join(ROOT, "admin")));
app.use(express.static(ROOT));

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
  // NOTE: secure: true only when using HTTPS
  res.setHeader(
    "Set-Cookie",
    `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax`
  );
}
function clearCookie(res, name) {
  res.setHeader(
    "Set-Cookie",
    `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`
  );
}

// ---------------- Admin auth ----------------
const ADMIN_USER = "admin";
const ADMIN_PASS = "chemsus123";
const sessions = new Map();

function requireAdmin(req, res, next) {
  const token = parseCookies(req).admin_session;
  if (!token || !sessions.has(token))
    return res.status(401).json({ error: "Unauthorized" });
  next();
}

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

// ---------------- Upload folders ----------------
const ADMIN_UPLOAD_DIR = path.join(ROOT, "assets", "uploads");
const RECEIPT_DIR = path.join(ROOT, "assets", "receipts");
fs.mkdirSync(ADMIN_UPLOAD_DIR, { recursive: true });
fs.mkdirSync(RECEIPT_DIR, { recursive: true });

function safeName(originalname) {
  return originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
}

const adminUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, ADMIN_UPLOAD_DIR),
    filename: (req, file, cb) => {
      const unique = Date.now() + "_" + crypto.randomBytes(4).toString("hex");
      cb(null, unique + "_" + safeName(file.originalname));
    },
  }),
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
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ---------------- Small promise helpers (for deletes, etc.) ----------------
function runP(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}
function getP(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}
function allP(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

// ---------------- Admin upload (images/pdfs for site) ----------------
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
app.get("/api/site/brochure", (req, res) => {
  db.get(
    `SELECT value FROM site_settings WHERE key='brochure_url'`,
    [],
    (err, row) => {
      if (err) return res.status(500).json({ error: "DB error" });
      res.json({ url: row?.value || "" });
    }
  );
});

app.post("/api/admin/brochure", requireAdmin, (req, res) => {
  const url = (req.body?.url || "").trim();
  db.run(
    `INSERT INTO site_settings(key,value) VALUES('brochure_url', ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
    [url],
    (err) => {
      if (err) return res.status(500).json({ error: "DB error" });
      res.json({ ok: true });
    }
  );
});

// ---------------- Public APIs for pages ----------------
app.get("/api/products-page", (req, res) => {
  db.all(
    `SELECT * FROM products_page WHERE is_active=1 ORDER BY sort_order ASC, id ASC`,
    [],
    (err, rows) =>
      err ? res.status(500).json({ error: "DB error" }) : res.json(rows)
  );
});

app.get("/api/shop-items", (req, res) => {
  db.all(
    `SELECT * FROM shop_items WHERE is_active=1 ORDER BY sort_order ASC, id ASC`,
    [],
    (err, rows) =>
      err ? res.status(500).json({ error: "DB error" }) : res.json(rows)
  );
});

// ---------------- Admin CRUD: Products Page ----------------
app.get("/api/admin/products-page", requireAdmin, (req, res) => {
  db.all(
    `SELECT * FROM products_page ORDER BY sort_order ASC, id ASC`,
    [],
    (err, rows) =>
      err ? res.status(500).json({ error: "DB error" }) : res.json(rows)
  );
});

app.post("/api/admin/products-page", requireAdmin, (req, res) => {
  const b = req.body || {};
  db.run(
    `INSERT INTO products_page (name, description, image, link, is_active, sort_order, updated_at)
     VALUES (?,?,?,?,?,?,datetime('now'))`,
    [
      b.name || "",
      b.description || "",
      b.image || "",
      b.link || "",
      b.is_active ? 1 : 0,
      Number(b.sort_order || 0),
    ],
    function (err) {
      if (err) return res.status(500).json({ error: "DB error" });
      res.json({ ok: true, id: this.lastID });
    }
  );
});

app.put("/api/admin/products-page/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  db.run(
    `UPDATE products_page
     SET name=?, description=?, image=?, link=?, is_active=?, sort_order=?, updated_at=datetime('now')
     WHERE id=?`,
    [
      b.name || "",
      b.description || "",
      b.image || "",
      b.link || "",
      b.is_active ? 1 : 0,
      Number(b.sort_order || 0),
      id,
    ],
    function (err) {
      if (err) return res.status(500).json({ error: "DB error" });
      res.json({ ok: true, changed: this.changes });
    }
  );
});

app.delete("/api/admin/products-page/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  db.run(`DELETE FROM products_page WHERE id=?`, [id], function (err) {
    if (err) return res.status(500).json({ error: "DB error" });
    res.json({ ok: true, deleted: this.changes });
  });
});

// ---------------- Admin CRUD: Shop Items ----------------
app.get("/api/admin/shop-items", requireAdmin, (req, res) => {
  db.all(
    `SELECT * FROM shop_items ORDER BY sort_order ASC, id ASC`,
    [],
    (err, rows) =>
      err ? res.status(500).json({ error: "DB error" }) : res.json(rows)
  );
});

app.post("/api/admin/shop-items", requireAdmin, (req, res) => {
  const b = req.body || {};
  const features_json = JSON.stringify(b.features || []);
  db.run(
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
      b.is_active ? 1 : 0,
      Number(b.sort_order || 0),
    ],
    function (err) {
      if (err) return res.status(500).json({ error: "DB error" });
      res.json({ ok: true, id: this.lastID });
    }
  );
});

app.put("/api/admin/shop-items/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  const features_json = JSON.stringify(b.features || []);
  db.run(
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
      b.is_active ? 1 : 0,
      Number(b.sort_order || 0),
      id,
    ],
    function (err) {
      if (err) return res.status(500).json({ error: "DB error" });
      res.json({ ok: true, changed: this.changes });
    }
  );
});

app.delete("/api/admin/shop-items/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  db.run(`DELETE FROM shop_items WHERE id=?`, [id], function (err) {
    if (err) return res.status(500).json({ error: "DB error" });
    res.json({ ok: true, deleted: this.changes });
  });
});

// ---------------- Health / Detect backend ----------------
app.get("/api/test", (req, res) =>
  res.json({ ok: true, apiBase: "/api", backendURL: req.headers.host })
);

// ---------------- Orders API (orders.html) ----------------
app.post("/api/orders", (req, res) => {
  const b = req.body || {};
  if (!b.customername || !b.email || !b.phone || !b.productname) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const quantity = Number(b.quantity || 1);
  const totalprice = Number(b.totalprice || 0);
  const unitprice = Number(b.unitprice || 0);

  db.run(
    `INSERT INTO orders
      (customername,email,phone,companyName,address,city,region,pincode,country,
       productname,quantity,unitprice,totalprice,payment_status,paymentmode,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'PENDING','PENDING',datetime('now'))`,
    [
      b.customername,
      b.email,
      b.phone,
      b.companyName || "",
      b.address || "",
      b.city || "",
      b.region || "",
      b.pincode || "",
      b.country || "India",
      b.productname,
      quantity,
      unitprice,
      totalprice,
    ],
    function (err) {
      if (err) return res.status(500).json({ error: "DB error" });
      res.json({ orderId: this.lastID });
    }
  );
});

// ---------------- Receipts API (payment.html/payment2.html) ----------------
app.post("/api/receipts", receiptUpload.single("receiptimage"), (req, res) => {
  const body = req.body || {};
  const orderId = Number(body.orderid);

  if (!orderId) return res.status(400).json({ error: "orderid required" });
  if (!req.file) return res.status(400).json({ error: "receiptimage required" });

  const amount = Number(body.amount || 0);
  const rating = Number(body.rating || 0);
  const feedback = (body.feedback || "").toString().slice(0, 2000);
  const receipt_path = `assets/receipts/${req.file.filename}`;

  db.get(`SELECT * FROM orders WHERE id=?`, [orderId], (err, order) => {
    if (err) return res.status(500).json({ error: "DB error" });
    if (!order) return res.status(404).json({ error: "Order not found" });

    db.run(
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
      ],
      function (err2) {
        if (err2) return res.status(500).json({ error: "DB error" });

        db.run(
          `UPDATE orders SET payment_status='VERIFYING', updated_at=datetime('now') WHERE id=?`,
          [orderId],
          (err3) => {
            if (err3) return res.status(500).json({ error: "DB error" });
            res.json({
              ok: true,
              paymentId: this.lastID,
              receipt_path,
            });
          }
        );
      }
    );
  });
});

// ---------------- Admin: Orders + Payments lists ----------------
app.get("/api/admin/orders", requireAdmin, (req, res) => {
  db.all(`SELECT * FROM orders ORDER BY id DESC`, [], (err, rows) =>
    err ? res.status(500).json({ error: "DB error" }) : res.json(rows)
  );
});

app.get("/api/admin/payments", requireAdmin, (req, res) => {
  db.all(
    `SELECT p.*, o.productname, o.totalprice, o.payment_status
     FROM payments p
     LEFT JOIN orders o ON o.id = p.order_id
     ORDER BY p.id DESC`,
    [],
    (err, rows) => (err ? res.status(500).json({ error: "DB error" }) : res.json(rows))
  );
});

// Admin: Mark payment SUCCESS/FAILED and sync order
app.post("/api/admin/payment-status", requireAdmin, (req, res) => {
  const paymentId = Number(req.body?.paymentId);
  const newStatus = (req.body?.status || "").toUpperCase(); // SUCCESS/FAILED
  if (!paymentId) return res.status(400).json({ error: "paymentId required" });
  if (!["SUCCESS", "FAILED"].includes(newStatus))
    return res.status(400).json({ error: "status must be SUCCESS or FAILED" });

  db.get(`SELECT * FROM payments WHERE id=?`, [paymentId], (err, pay) => {
    if (err) return res.status(500).json({ error: "DB error" });
    if (!pay) return res.status(404).json({ error: "Payment not found" });

    db.run(`UPDATE payments SET status=? WHERE id=?`, [newStatus, paymentId], (err2) => {
      if (err2) return res.status(500).json({ error: "DB error" });

      const orderStatus = newStatus === "SUCCESS" ? "PAID" : "FAILED";
      db.run(
        `UPDATE orders SET payment_status=?, paymentmode=?, updated_at=datetime('now') WHERE id=?`,
        [orderStatus, newStatus === "SUCCESS" ? "UPI" : "FAILED", pay.order_id],
        (err3) => {
          if (err3) return res.status(500).json({ error: "DB error" });
          res.json({
            ok: true,
            paymentId,
            status: newStatus,
            orderId: pay.order_id,
            orderStatus,
          });
        }
      );
    });
  });
});

// ---------------- Admin delete: Orders (and linked payments) ----------------
app.delete("/api/admin/orders/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid order id" });

  try {
    // If you want to also delete receipt files, you can do it here (optional).
    // We'll keep files for safety.

    await runP("DELETE FROM payments WHERE order_id = ?", [id]);
    const del = await runP("DELETE FROM orders WHERE id = ?", [id]);

    res.json({ ok: true, deleted: del.changes || 0 });
  } catch (e) {
    res.status(500).json({ error: "DB error", details: String(e) });
  }
});

// ---------------- Admin delete: Payments (receipt record) ----------------
app.delete("/api/admin/payments/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid payment id" });

  try {
    const del = await runP("DELETE FROM payments WHERE id = ?", [id]);
    res.json({ ok: true, deleted: del.changes || 0 });
  } catch (e) {
    res.status(500).json({ error: "DB error", details: String(e) });
  }
});

// ---------------- Start ----------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ http://localhost:${PORT}`));
