const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'db', 'chemsus.sqlite');
console.log('Using DB Path:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('DB Open Error:', err.message);
        process.exit(1);
    }
    console.log('Connected to DB.');
});

const imagePath = 'assets/dala.jpg';
const dalaName = 'Delta-aminolevulinic acid (DALA)';

db.serialize(() => {
    // Update products_page
    db.run("UPDATE products_page SET image = ?, updated_at = datetime('now') WHERE name = ?", [imagePath, dalaName], function (err) {
        if (err) console.error('Update products_page error:', err.message);
        else console.log('Updated products_page. Changes:', this.changes);
    });

    // Update shop_items
    db.run("UPDATE shop_items SET image = ?, updated_at = datetime('now') WHERE name = ?", [imagePath, dalaName], function (err) {
        if (err) console.error('Update shop_items error:', err.message);
        else console.log('Updated shop_items. Changes:', this.changes);
        db.close();
    });
});
