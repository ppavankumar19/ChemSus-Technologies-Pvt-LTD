const { db, initDb } = require('./backend/db');

async function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

async function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function seed() {
  try {
    console.log('🌱 Seeding database...');

    // Clear existing data (in correct order due to foreign keys)
    console.log('🗑️  Clearing old data...');
    await run('DELETE FROM pack_pricing');
    await run('DELETE FROM shop_items');
    await run('DELETE FROM products_page');
    console.log('✅ Old data cleared');

    // Insert shop items
    console.log('📦 Inserting shop items...');
    const items = [
      { name: 'Calcium Levulinate', subtitle: 'Pharma-grade nutritional supplement', features: '["High bioavailability","Pharma & nutraceutical use","Clean-label"]', stockStatus: 'in-stock', badge: '', showBadge: 0, moreLink: 'products/calcium-levulinate.html', image: 'assets/cl.jpeg' },
      { name: 'Sodium Levulinate', subtitle: 'Natural preservative & stabilizer', features: '["COSMOS/ECOCERT friendly","Skin-conditioning","Water soluble"]', stockStatus: 'in-stock', badge: 'Free sample available', showBadge: 1, moreLink: 'products/sodium-levulinate.html', image: 'assets/sl.jpeg' },
      { name: 'Levulinic Acid', subtitle: 'Versatile platform chemical', features: '["Green chemistry platform","Polymers & fuels","Pharma intermediate"]', stockStatus: 'in-stock', badge: 'Free sample available', showBadge: 1, moreLink: 'products/levulinic-acid.html', image: 'assets/la.jpeg' },
      { name: '5-HMF', subtitle: 'Bio-based intermediate', features: '["High reactivity","Resins & coatings","Sustainable building block"]', stockStatus: 'in-stock', badge: '', showBadge: 0, moreLink: 'products/5-hmf.html', image: 'assets/5hmf.jpeg' },
      { name: 'Ethyl Levulinate', subtitle: 'Green solvent & fuel additive', features: '["Bio-based ester","Flavors & fragrances","Low toxicity"]', stockStatus: 'in-stock', badge: '', showBadge: 0, moreLink: 'products/ethyl-levulinate.html', image: 'assets/el.jpeg' },
      { name: 'Methyl Levulinate', subtitle: 'Renewable solvent & intermediate', features: '["Biofuel additive","Performance solvent","Chemical intermediate"]', stockStatus: 'in-stock', badge: '', showBadge: 0, moreLink: 'products/methyl-levulinate.html', image: 'assets/ml.jpeg' },
      { name: 'DALA', subtitle: 'Delta-aminolevulinic acid', features: '["Pharmaceutical grade","Agricultural applications","High purity >98%"]', stockStatus: 'in-stock', badge: 'Limited stock', showBadge: 1, moreLink: 'products/dala.html', image: 'assets/dala.jpeg' }
    ];

    const insertedIds = [];
    for (const item of items) {
      const result = await run(
        `INSERT INTO shop_items (name, subtitle, features_json, price, stockStatus, showBadge, badge, moreLink, image, is_active, sort_order)
         VALUES (?,?,?,?,?,?,?,?,?,1,0)`,
        [item.name, item.subtitle, item.features, 2000, item.stockStatus, item.showBadge, item.badge, item.moreLink, item.image]
      );
      insertedIds.push(result.lastID);
      console.log(`  ✓ ${item.name} (ID: ${result.lastID})`);
    }

    console.log(`✅ Inserted ${insertedIds.length} shop items`);

    // Verify shop items were inserted
    const shopItems = await all('SELECT id, name FROM shop_items');
    console.log('📋 Current shop items:', shopItems);

    if (shopItems.length === 0) {
      throw new Error('No shop items found after insert!');
    }

    // Insert pack pricing
    console.log('💰 Inserting pack pricing...');
    const packPricing = [
      // Calcium Levulinate
      [insertedIds[0], '100 g', 36.3, 7336, 2000, 1],
      [insertedIds[0], '500 g', 116.8, 10735, 7000, 2],
      [insertedIds[0], '1 kg', 203, 18658, 10000, 3],
      // Sodium Levulinate
      [insertedIds[1], '100 g', 26, 2390, 2000, 1],
      [insertedIds[1], '500 g', 86.7, 7969, 7000, 2],
      [insertedIds[1], '1 kg', 144.5, 13281, 10000, 3],
      // Levulinic Acid
      [insertedIds[2], '100 g', 40.6, 7373, 2000, 1],
      [insertedIds[2], '500 g', 108.1, 9936, 3000, 2],
      [insertedIds[2], '1 kg', 164.6, 15128, 5000, 3],
      // 5-HMF
      [insertedIds[3], '5 g', 30, 2206, 2000, 1],
      [insertedIds[3], '25 g', 85, 6250, 5000, 2],
      [insertedIds[3], '100 g', 249, 18290, 15000, 3],
      // Ethyl Levulinate
      [insertedIds[4], '100 g', 77, 7077, 4000, 1],
      [insertedIds[4], '500 mL', 97, 8915, 7000, 2],
      [insertedIds[4], '1 L', 125.5, 11535, 10000, 3],
      // Methyl Levulinate
      [insertedIds[5], '100 g', 77, 7077, 4000, 1],
      [insertedIds[5], '500 mL', 97, 8915, 7000, 2],
      [insertedIds[5], '1 L', 125.5, 11535, 10000, 3],
      // DALA
      [insertedIds[6], '5 g', 182.5, 16774, 15000, 1],
      [insertedIds[6], '10 g', 273.7, 25156, 20000, 2],
      [insertedIds[6], '25 g', 410.7, 37748, 30000, 3],
      [insertedIds[6], '100 g', 925.7, 85084, 70000, 4]
    ];

    for (const pack of packPricing) {
      await run(
        `INSERT INTO pack_pricing (shop_item_id, pack_size, biofm_usd, biofm_inr, our_price, is_active, sort_order)
         VALUES (?,?,?,?,?,1,?)`,
        pack
      );
    }

    console.log(`✅ Inserted ${packPricing.length} pack pricing entries`);

    // Insert products page items
    console.log('📄 Inserting products page items...');
    const products = [
      ['Calcium Levulinate', 'Premium pharmaceutical-grade calcium salt', 'assets/cl.jpeg', 'products/calcium-levulinate.html'],
      ['Sodium Levulinate', 'Natural preservative for cosmetics', 'assets/sl.jpeg', 'products/sodium-levulinate.html'],
      ['Levulinic Acid', 'Versatile platform chemical', 'assets/la.jpeg', 'products/levulinic-acid.html'],
      ['5-HMF', 'High-purity pharmaceutical intermediate', 'assets/5hmf.jpeg', 'products/5-hmf.html'],
      ['Ethyl Levulinate', 'Bio-based green solvent', 'assets/el.jpeg', 'products/ethyl-levulinate.html'],
      ['Methyl Levulinate', 'Renewable ester solvent', 'assets/ml.jpeg', 'products/methyl-levulinate.html'],
      ['DALA', 'Delta-aminolevulinic acid', 'assets/dala.jpeg', 'products/dala.html']
    ];

    for (const prod of products) {
      await run(
        `INSERT INTO products_page (name, description, image, link, is_active, sort_order)
         VALUES (?,?,?,?,1,0)`,
        prod
      );
    }

    console.log(`✅ Inserted ${products.length} products page items`);

    console.log('');
    console.log('🎉 Database seeded successfully!');
    console.log('');
    console.log('📊 Summary:');
    console.log(`  - ${shopItems.length} shop items`);
    console.log(`  - ${packPricing.length} pack pricing entries`);
    console.log(`  - ${products.length} products page items`);
    console.log('');
    console.log('🚀 Start the server with: npm start');
    
    process.exit(0);
  } catch (e) {
    console.error('❌ Error:', e.message);
    console.error(e);
    process.exit(1);
  }
}

initDb().then(() => {
  console.log('✅ Database initialized');
  seed();
});
