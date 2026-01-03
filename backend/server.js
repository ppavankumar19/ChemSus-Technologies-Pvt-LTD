const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const multer = require("multer");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ limit: "50mb", extended: true }));

/* ===============================
   FILE UPLOAD SETUP
================================ */
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log("📁 Created uploads directory");
}

// Serve uploaded files as static
app.use("/uploads", express.static(uploadsDir));

// Multer config for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `receipt_${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPEG, PNG, WebP, and PDF files allowed"));
    }
  },
});

/* ===============================
   DATABASE SETUP (SQLite)
================================ */
const dbDir = path.join(__dirname, "db");
const dbPath = path.join(dbDir, "orders.db");

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
  console.log("📁 Created db directory");
}

const db = new sqlite3.Database(dbPath);

function runAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function allAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function getAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// ✅ Create tables if not exists
async function ensureSchema() {
  console.log("🔄 Initializing database...");

  // Orders table
  await runAsync(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customername TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      productname TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      totalprice REAL NOT NULL,
      paymentmode TEXT DEFAULT 'PENDING',
      status TEXT DEFAULT 'PLACED',
      notes TEXT,
      createdat DATETIME DEFAULT CURRENT_TIMESTAMP,
      address TEXT,
      city TEXT,
      region TEXT,
      pincode TEXT
    )
  `);

  // ✅ Receipts table (NEW)
  await runAsync(`
    CREATE TABLE IF NOT EXISTS receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      orderid INTEGER NOT NULL,
      customername TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      amount REAL NOT NULL,
      receiptimage TEXT,
      rating INTEGER,
      feedback TEXT,
      createdat DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(orderid) REFERENCES orders(id)
    )
  `);

  // Add columns if old DB doesn't have them
  const cols = await allAsync(`PRAGMA table_info(orders)`);
  const colNames = cols.map((c) => c.name);

  const addColumnIfMissing = async (name, type) => {
    if (!colNames.includes(name)) {
      await runAsync(`ALTER TABLE orders ADD COLUMN ${name} ${type}`);
      console.log(`✅ Added column: ${name}`);
    }
  };

  await addColumnIfMissing("address", "TEXT");
  await addColumnIfMissing("city", "TEXT");
  await addColumnIfMissing("region", "TEXT");
  await addColumnIfMissing("pincode", "TEXT");

  console.log("✅ Orders table ready");
  console.log("✅ Receipts table ready");
}

ensureSchema().catch((e) => {
  console.error("❌ DB init error:", e.message);
});

/* ===============================
   OTP STORE (IN MEMORY)
================================ */
const otpStore = {};

/* ===============================
   SEND OTP (FAST2SMS)
================================ */
app.post("/api/send-otp", async (req, res) => {
  const { phone } = req.body;

  if (!phone || String(phone).length !== 10) {
    return res.json({ success: false, message: "Invalid phone number" });
  }

  const otp = Math.floor(100000 + Math.random() * 900000);

  otpStore[phone] = {
    otp,
    expires: Date.now() + 5 * 60 * 1000,
  };

  console.log(`📲 OTP for ${phone}: ${otp}`);

  try {
    const response = await axios.get("https://www.fast2sms.com/dev/bulkV2", {
      params: {
        authorization: "PASTE_YOUR_REAL_FAST2SMS_API_KEY",
        route: "otp",
        variables_values: otp,
        numbers: phone,
      },
    });

    if (response.data.return === true) {
      res.json({ success: true });
    } else {
      console.error("❌ Fast2SMS response error:", response.data);
      res.json({ success: false });
    }
  } catch (err) {
    console.error("❌ SMS error:", err.response?.data || err.message);
    res.json({ success: false });
  }
});

/* ===============================
   VERIFY OTP
================================ */
app.post("/api/verify-otp", (req, res) => {
  const { phone, otp } = req.body;

  const record = otpStore[phone];
  if (!record) return res.json({ success: false, message: "OTP not found" });

  if (Date.now() > record.expires) {
    delete otpStore[phone];
    return res.json({ success: false, message: "OTP expired" });
  }

  if (record.otp != otp) {
    return res.json({ success: false, message: "Invalid OTP" });
  }

  delete otpStore[phone];
  res.json({ success: true });
});

/* ===============================
   PLACE ORDER
================================ */
app.post("/api/orders", (req, res) => {
  const {
    customername,
    email,
    phone,
    productname,
    quantity,
    totalprice,
    paymentmode,
    address,
    city,
    region,
    pincode,
  } = req.body;

  if (
    !customername ||
    !email ||
    !phone ||
    !productname ||
    quantity == null ||
    totalprice == null
  ) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  db.run(
    `INSERT INTO orders 
     (customername, email, phone, productname, quantity, totalprice, paymentmode, status, address, city, region, pincode)
     VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, 'PENDING'), 'PLACED', ?, ?, ?, ?)`,
    [
      customername,
      email,
      phone,
      productname,
      quantity,
      totalprice,
      paymentmode,
      address || null,
      city || null,
      region || null,
      pincode || null,
    ],
    function (err) {
      if (err) {
        console.error("❌ Order error:", err.message);
        return res.status(500).json({ error: err.message });
      }
      console.log(`✅ Order #${this.lastID} created`);
      res.json({ success: true, orderId: this.lastID });
    }
  );
});

/* ===============================
   RECEIPT APIs (NEW)
================================ */

// ✅ Upload receipt with file
app.post("/api/receipts", upload.single("receiptimage"), async (req, res) => {
  try {
    const { orderid, customername, email, phone, amount, rating, feedback } =
      req.body;

    if (!orderid || !customername || !email || !phone || !amount) {
      return res
        .status(400)
        .json({ error: "Missing required fields" });
    }

    const receiptimage = req.file
      ? `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`
      : null;

    db.run(
      `INSERT INTO receipts (orderid, customername, email, phone, amount, receiptimage, rating, feedback)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderid,
        customername,
        email,
        phone,
        amount,
        receiptimage,
        rating || null,
        feedback || null,
      ],
      function (err) {
        if (err) {
          console.error("❌ Receipt error:", err.message);
          return res.status(500).json({ error: err.message });
        }
        console.log(`✅ Receipt #${this.lastID} uploaded`);

        // Update order payment status to PAID
        db.run(
          `UPDATE orders SET paymentmode='PAID' WHERE id=?`,
          [orderid],
          (updateErr) => {
            if (updateErr)
              console.error("❌ Update order error:", updateErr.message);
          }
        );

        res.json({ success: true, receiptId: this.lastID });
      }
    );
  } catch (err) {
    console.error("❌ Receipt upload error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Get all receipts
app.get("/api/receipts", (req, res) => {
  db.all(
    `SELECT * FROM receipts ORDER BY createdat DESC`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

// ✅ Get single receipt
app.get("/api/receipts/:id", async (req, res) => {
  try {
    const receipt = await getAsync(
      `SELECT * FROM receipts WHERE id=?`,
      [req.params.id]
    );
    if (!receipt) return res.status(404).json({ error: "Receipt not found" });
    res.json(receipt);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Delete receipt
app.delete("/api/receipts/:id", async (req, res) => {
  try {
    const receipt = await getAsync(
      `SELECT receiptimage FROM receipts WHERE id=?`,
      [req.params.id]
    );

    if (!receipt) return res.status(404).json({ error: "Receipt not found" });

    // Delete file if exists
    if (receipt.receiptimage) {
      const filename = receipt.receiptimage.split("/").pop();
      const filepath = path.join(uploadsDir, filename);
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
    }

    // Delete DB record
    db.run(`DELETE FROM receipts WHERE id=?`, [req.params.id], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===============================
   ADMIN ORDER APIs
================================ */
app.get("/api/adminorders", (req, res) => {
  db.all(`SELECT * FROM orders ORDER BY createdat DESC`, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.patch("/api/adminorders/:id", (req, res) => {
  const id = req.params.id;
  const updates = [];
  const params = [];

  const { paymentmode, status, notes, address, city, region, pincode } =
    req.body;

  if (paymentmode !== undefined) {
    updates.push("paymentmode=?");
    params.push(paymentmode);
  }
  if (status !== undefined) {
    updates.push("status=?");
    params.push(status);
  }
  if (notes !== undefined) {
    updates.push("notes=?");
    params.push(notes);
  }
  if (address !== undefined) {
    updates.push("address=?");
    params.push(address);
  }
  if (city !== undefined) {
    updates.push("city=?");
    params.push(city);
  }
  if (region !== undefined) {
    updates.push("region=?");
    params.push(region);
  }
  if (pincode !== undefined) {
    updates.push("pincode=?");
    params.push(pincode);
  }

  params.push(id);

  if (updates.length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  db.run(`UPDATE orders SET ${updates.join(",")} WHERE id=?`, params, function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: "Order not found" });
    res.json({ success: true });
  });
});

app.delete("/api/adminorders/:id", (req, res) => {
  const id = req.params.id;

  db.run("DELETE FROM orders WHERE id=?", [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: "Order not found" });
    res.json({ success: true });
  });
});

/* ===============================
   TEST
================================ */
app.get("/api/test", (req, res) =>
  res.json({ status: "✅ Backend running", time: new Date() })
);

const PORT = 3000;
app.listen(PORT, () => {
  console.log("\n🚀 ChemSus Backend RUNNING");
  console.log(`✅ http://localhost:${PORT}`);
  console.log("\n📲 OTP Endpoints:");
  console.log("  POST /api/send-otp");
  console.log("  POST /api/verify-otp");
  console.log("\n🛒 Order Endpoints:");
  console.log("  POST /api/orders");
  console.log("  GET  /api/adminorders");
  console.log("  PATCH /api/adminorders/:id");
  console.log("  DELETE /api/adminorders/:id");
  console.log("\n📄 Receipt Endpoints (NEW):");
  console.log("  POST /api/receipts (with file upload)");
  console.log("  GET  /api/receipts");
  console.log("  GET  /api/receipts/:id");
  console.log("  DELETE /api/receipts/:id");
  console.log("\n🧪 Test:");
  console.log("  GET  /api/test\n");
});
