const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(cors());
app.use(express.json());

const dbPath = path.join(__dirname, "db", "orders.db");
const dbDir = path.join(__dirname, "db");

// Create db directory
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
  console.log('📁 Created db directory');
}

// Initialize database
const db = new sqlite3.Database(dbPath);

// Drop and recreate table (clean start)
db.serialize(() => {
  console.log('🔄 Initializing database...');
  
  // Drop existing table if exists
  db.run(`DROP TABLE IF EXISTS orders`, (err) => {
    if (err) console.log('Drop table:', err.message);
  });
  
  // Create fresh table with correct schema
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
  `, (err) => {
    if (err) {
      console.error('❌ Table creation failed:', err);
    } else {
      console.log('✅ Orders table created successfully');
    }
  });
  
  console.log('✅ Database ready');
});

// 🔵 PLACE ORDER
app.post("/api/orders", (req, res) => {
  const { customername, email, phone, productname, quantity, totalprice, paymentmode } = req.body;
  
  if (!customername || !email || !phone || !productname || quantity == null || totalprice == null) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  db.run(
    `INSERT INTO orders (customername, email, phone, productname, quantity, totalprice, paymentmode, status)
     VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, 'PENDING'), 'PLACED')`,
    [customername, email, phone, productname, quantity, totalprice, paymentmode],
    function(err) {
      if (err) {
        console.error('❌ Order error:', err);
        return res.status(500).json({ error: err.message });
      }
      console.log(`✅ Order #${this.lastID}: ${customername} - ${productname}`);
      res.json({ success: true, orderId: this.lastID });
    }
  );
});

// 🔴 ADMIN VIEW ORDERS
app.get("/api/adminorders", (req, res) => {
  db.all(`SELECT * FROM orders ORDER BY createdat DESC`, (err, rows) => {
    if (err) {
      console.error('❌ Admin fetch error:', err);
      return res.status(500).json({ error: err.message });
    }
    console.log(`📊 ${rows.length} orders fetched`);
    res.json(rows);
  });
});

// 🟡 UPDATE ORDER
app.patch("/api/adminorders/:id", (req, res) => {
  const id = req.params.id;
  const updates = [];
  const params = [];
  const { paymentmode, status, notes } = req.body;

  if (paymentmode !== undefined) { updates.push('paymentmode=?'); params.push(paymentmode); }
  if (status !== undefined) { updates.push('status=?'); params.push(status); }
  if (notes !== undefined) { updates.push('notes=?'); params.push(notes); }
  params.push(id);

  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

  db.run(`UPDATE orders SET ${updates.join(',')} WHERE id=?`, params, function(err) {
    if (err) {
      console.error('❌ Update error:', err);
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) return res.status(404).json({ error: 'Order not found' });
    console.log(`🔄 Order #${id} updated`);
    res.json({ success: true });
  });
});

// 🗑️ DELETE ORDER
app.delete("/api/adminorders/:id", (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM orders WHERE id=?', [id], function(err) {
    if (err) {
      console.error('❌ Delete error:', err);
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) return res.status(404).json({ error: 'Order not found' });
    console.log(`🗑️ Order #${id} deleted`);
    res.json({ success: true });
  });
});

// 🧪 TEST
app.get("/api/test", (req, res) => res.json({ status: "✅ Backend perfect!", time: new Date().toISOString() }));

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 ChemSus Backend v2.0`);
  console.log(`✅ http://localhost:${PORT}`);
  console.log(`📋 POST  /api/orders`);
  console.log(`📋 GET   /api/adminorders`);
  console.log(`📋 PATCH /api/adminorders/:id`);
  console.log(`📋 DELETE /api/adminorders/:id`);
  console.log(`🧪 Test: http://localhost:3000/api/test\n`);
});
