/**
 * seed.js — Populate the PostgreSQL database with initial product data.
 *
 * Usage:
 *   npm run seed          — Insert data (skips if already seeded)
 *   npm run reset         — Truncate all tables then reseed
 */
try { require("dotenv").config(); } catch { /* ok */ }

const { pool, initDb } = require("./backend/db");
const isReset = process.argv.includes("--reset");

async function seed() {
  // Ensure schema exists
  await initDb();

  if (isReset) {
    console.log("Resetting tables...");
    await pool.query(`
      TRUNCATE TABLE
        order_items, email_otp_sessions, payments, orders,
        pack_pricing, shop_items, products_page, site_settings
      RESTART IDENTITY CASCADE
    `);
    console.log("Tables truncated and sequences reset.");
  }

  // Check if already seeded
  const { rows: [{ count }] } = await pool.query("SELECT COUNT(*)::int AS count FROM products_page");
  if (count > 0 && !isReset) {
    console.log(`Already seeded (${count} products found). Use --reset to reseed.`);
    await pool.end();
    return;
  }

  // ── Site settings ───────────────────────────────────────────────────────────
  await pool.query(`
    INSERT INTO site_settings (key, value)
    VALUES ('brochure_url', 'assets/brochure.pdf')
    ON CONFLICT (key) DO NOTHING
  `);

  // ── Products page ───────────────────────────────────────────────────────────
  await pool.query(`
    INSERT INTO products_page (name, description, image, link, is_active, sort_order) VALUES
    ('Calcium Levulinate',
     'Premium pharmaceutical-grade calcium salt for nutraceutical applications with superior bioavailability.',
     'assets/cl.jpeg', 'products/calcium-levulinate.html', 1, 1),
    ('Sodium Levulinate',
     'Natural preservative and humectant for cosmetics and personal care products. COSMOS/ECOCERT friendly.',
     'assets/sl.jpeg', 'products/sodium-levulinate.html', 1, 2),
    ('Levulinic Acid',
     'Versatile platform chemical for pharmaceuticals, polymers, and green chemistry applications.',
     'assets/la.jpeg', 'products/levulinic-acid.html', 1, 3),
    ('5-HMF',
     'High-purity 5-hydroxymethylfurfural for research, polymer synthesis, and pharmaceutical intermediates.',
     'assets/chemical1.avif', 'products/5-hmf.html', 1, 4),
    ('Ethyl Levulinate',
     'Bio-based green solvent and fuel additive with low toxicity and excellent solvency properties.',
     'assets/el.jpeg', 'products/ethyl-levulinate.html', 1, 5),
    ('Methyl Levulinate',
     'Renewable ester solvent for coatings, inks, and biofuel applications.',
     'assets/ml.jpeg', 'products/methyl-levulinate.html', 1, 6),
    ('DALA',
     'Delta-aminolevulinic acid for pharmaceutical and agricultural applications.',
     'assets/dala.jpg', 'products/dala.html', 1, 7)
  `);
  console.log("✅ Products page seeded (7 products)");

  // ── Shop items ──────────────────────────────────────────────────────────────
  // Column names are snake_case: stock_status, show_badge, more_link
  await pool.query(`
    INSERT INTO shop_items (name, subtitle, features_json, price, stock_status, show_badge, badge, more_link, image, is_active, sort_order) VALUES
    ('Calcium Levulinate',
     'Pharma-grade nutritional supplement',
     '["High bioavailability","Pharma & nutraceutical use","Clean-label","Superior calcium source","Easy to formulate"]',
     2000, 'in-stock', 0, '', 'products/calcium-levulinate.html', 'assets/call.png', 1, 1),

    ('Sodium Levulinate',
     'Natural preservative & stabilizer',
     '["COSMOS/ECOCERT friendly","Skin-conditioning","Water soluble","Natural preservative","pH stabilizer"]',
     2000, 'in-stock', 1, 'Free sample available', 'products/sodium-levulinate.html', 'assets/sl.jpeg', 1, 2),

    ('Levulinic Acid',
     'Versatile platform chemical',
     '["Green chemistry platform","Polymers & fuels","Pharma intermediate","High purity >99%","Bio-based"]',
     2000, 'in-stock', 1, 'Free sample available', 'products/levulinic-acid.html', 'assets/la.jpeg', 1, 3),

    ('5-HMF',
     'Bio-based intermediate',
     '["High reactivity","Resins & coatings","Sustainable building block","Research grade","Pharmaceutical intermediate"]',
     2000, 'in-stock', 0, '', 'products/5-hmf.html', 'assets/5hmf.jpeg', 1, 4),

    ('Ethyl Levulinate',
     'Green solvent & fuel additive',
     '["Bio-based ester","Flavors & fragrances","Low toxicity","Excellent solvency","Biodegradable"]',
     4000, 'in-stock', 0, '', 'products/ethyl-levulinate.html', 'assets/el.jpeg', 1, 5),

    ('Methyl Levulinate',
     'Renewable solvent & intermediate',
     '["Biofuel additive","Performance solvent","Chemical intermediate","Green alternative","High purity"]',
     4000, 'in-stock', 0, '', 'products/methyl-levulinate.html', 'assets/ml.jpeg', 1, 6),

    ('DALA',
     'Delta-aminolevulinic acid',
     '["Pharmaceutical grade","Agricultural applications","High purity >98%","Research applications","Photodynamic therapy"]',
     15000, 'in-stock', 1, 'Limited stock', 'products/dala.html', 'assets/dala.jpg', 1, 7)
  `);
  console.log("✅ Shop items seeded (7 items)");

  // ── Pack pricing ────────────────────────────────────────────────────────────
  await pool.query(`
    INSERT INTO pack_pricing (shop_item_id, pack_size, biofm_usd, biofm_inr, our_price, is_active, sort_order) VALUES
    ((SELECT id FROM shop_items WHERE name='Calcium Levulinate'), '100 g',  36.3,  7336,  2000,  1, 1),
    ((SELECT id FROM shop_items WHERE name='Calcium Levulinate'), '500 g',  116.8, 10735, 7000,  1, 2),
    ((SELECT id FROM shop_items WHERE name='Calcium Levulinate'), '1 kg',   203,   18658, 10000, 1, 3),
    ((SELECT id FROM shop_items WHERE name='Calcium Levulinate'), '2 kg',   0,     0,     19000, 1, 4),
    ((SELECT id FROM shop_items WHERE name='Calcium Levulinate'), '5 kg',   0,     0,     42500, 1, 5),

    ((SELECT id FROM shop_items WHERE name='Sodium Levulinate'), '100 g',  26,    2390,  2000,  1, 1),
    ((SELECT id FROM shop_items WHERE name='Sodium Levulinate'), '500 g',  86.7,  7969,  7000,  1, 2),
    ((SELECT id FROM shop_items WHERE name='Sodium Levulinate'), '1 kg',   144.5, 13281, 10000, 1, 3),
    ((SELECT id FROM shop_items WHERE name='Sodium Levulinate'), '2 kg',   262.9, 24163, 18000, 1, 4),
    ((SELECT id FROM shop_items WHERE name='Sodium Levulinate'), '3 kg',   404.8, 37169, 27000, 1, 5),
    ((SELECT id FROM shop_items WHERE name='Sodium Levulinate'), '5 kg',   642.3, 59034, 42500, 1, 6),

    ((SELECT id FROM shop_items WHERE name='Levulinic Acid'), '100 g',  40.6,  7373,  2000, 1, 1),
    ((SELECT id FROM shop_items WHERE name='Levulinic Acid'), '500 g',  108.1, 9936,  3000, 1, 2),
    ((SELECT id FROM shop_items WHERE name='Levulinic Acid'), '1 kg',   164.6, 15128, 5000, 1, 3),

    ((SELECT id FROM shop_items WHERE name='5-HMF'), '5 g',   30,  2206,  2000,  1, 1),
    ((SELECT id FROM shop_items WHERE name='5-HMF'), '25 g',  85,  6250,  5000,  1, 2),
    ((SELECT id FROM shop_items WHERE name='5-HMF'), '100 g', 249, 18290, 15000, 1, 3),

    ((SELECT id FROM shop_items WHERE name='Ethyl Levulinate'), '100 g',  77,    7077,  4000,  1, 1),
    ((SELECT id FROM shop_items WHERE name='Ethyl Levulinate'), '500 mL', 97,    8915,  7000,  1, 2),
    ((SELECT id FROM shop_items WHERE name='Ethyl Levulinate'), '1 L',    125.5, 11535, 10000, 1, 3),

    ((SELECT id FROM shop_items WHERE name='Methyl Levulinate'), '100 g',  77,    7077,  4000,  1, 1),
    ((SELECT id FROM shop_items WHERE name='Methyl Levulinate'), '500 mL', 97,    8915,  7000,  1, 2),
    ((SELECT id FROM shop_items WHERE name='Methyl Levulinate'), '1 L',    125.5, 11535, 10000, 1, 3),

    ((SELECT id FROM shop_items WHERE name='DALA'), '5 g',   182.5, 16774, 15000, 1, 1),
    ((SELECT id FROM shop_items WHERE name='DALA'), '10 g',  273.7, 25156, 20000, 1, 2),
    ((SELECT id FROM shop_items WHERE name='DALA'), '25 g',  410.7, 37748, 30000, 1, 3),
    ((SELECT id FROM shop_items WHERE name='DALA'), '100 g', 925.7, 85084, 70000, 1, 4)
  `);
  console.log("✅ Pack pricing seeded (27 entries)");

  console.log("\n✅ Seed complete. Start the server with: npm start");
  await pool.end();
}

seed().catch((e) => {
  console.error("❌ Seed failed:", e.message || e);
  pool.end().catch(() => {});
  process.exit(1);
});
