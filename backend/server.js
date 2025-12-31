const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(express.json());

/* ===============================
   DATABASE SETUP
================================ */
const dbPath = path.join(__dirname, "db", "orders.db");
const dbDir = path.join(__dirname, "db");

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
  console.log("📁 Created db directory");
}

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  console.log("🔄 Initializing database...");

  db.run(`DROP TABLE IF EXISTS orders`);

  db.run(`
    CREATE TABLE orders (
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
      createdat DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log("✅ Orders table ready");
});

/* ===============================
   OTP STORE (IN MEMORY)
================================ */
const otpStore = {};
// otpStore[phone] = { otp, expires }

/* ===============================
   SEND OTP (FAST2SMS – WORKING)
================================ */
app.post("/api/send-otp", async (req, res) => {
  const { phone } = req.body;

  if (!phone || phone.length !== 10) {
    return res.json({ success: false, message: "Invalid phone number" });
  }

  const otp = Math.floor(100000 + Math.random() * 900000);
  otpStore[phone] = {
    otp,
    expires: Date.now() + 5 * 60 * 1000 // 5 minutes
  };

  console.log(`📲 OTP for ${phone}: ${otp}`);

  try {
    const response = await axios.get(
      "https://www.fast2sms.com/dev/bulkV2",
      {
        params: {
          authorization: "PASTE_YOUR_REAL_FAST2SMS_API_KEY",
          route: "otp",
          variables_values: otp,
          numbers: phone
        }
      }
    );

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
  if (!record) {
    return res.json({ success: false, message: "OTP not found" });
  }

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
   PLACE ORDER (AFTER OTP)
================================ */
app.post("/api/orders", (req, res) => {
  const {
    customername,
    email,
    phone,
    productname,
    quantity,
    totalprice,
    paymentmode
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
     (customername, email, phone, productname, quantity, totalprice, paymentmode, status)
     VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, 'PENDING'), 'PLACED')`,
    [
      customername,
      email,
      phone,
      productname,
      quantity,
      totalprice,
      paymentmode
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
   ADMIN APIs
================================ */
app.get("/api/adminorders", (req, res) => {
  db.all(`SELECT * FROM orders ORDER BY createdat DESC`, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.patch("/api/adminorders/:id", (req, res) => {
  const id = req.params.id;
  const updates = [];
  const params = [];
  const { paymentmode, status, notes } = req.body;

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

  params.push(id);

  if (updates.length === 0)
    return res.status(400).json({ error: "No fields to update" });

  db.run(
    `UPDATE orders SET ${updates.join(",")} WHERE id=?`,
    params,
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0)
        return res.status(404).json({ error: "Order not found" });

      res.json({ success: true });
    }
  );
});

app.delete("/api/adminorders/:id", (req, res) => {
  const id = req.params.id;
  db.run("DELETE FROM orders WHERE id=?", [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0)
      return res.status(404).json({ error: "Order not found" });

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
  console.log("📲 POST /api/send-otp");
  console.log("✅ POST /api/verify-otp");
  console.log("🛒 POST /api/orders");
  console.log("🧪 GET  /api/test\n");
});
