const fs = require('fs');
const path = require('path');

// Import from backend folder
const { db, initDb } = require('./backend/db');

const SEED_FILE = path.join(__dirname, 'seed-data.sql');

async function runSeed() {
  try {
    console.log('🌱 Starting database seed...');
    
    if (!fs.existsSync(SEED_FILE)) {
      console.error('❌ seed-data.sql not found!');
      console.error('Expected location:', SEED_FILE);
      process.exit(1);
    }
    
    const sql = fs.readFileSync(SEED_FILE, 'utf8');
    
    // Split by semicolon and execute each statement
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`📝 Found ${statements.length} SQL statements to execute`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      await new Promise((resolve, reject) => {
        db.run(statement, (err) => {
          if (err) {
            console.error(`❌ Error in statement ${i + 1}:`, statement.substring(0, 100) + '...');
            reject(err);
          } else {
            resolve();
          }
        });
      });
    }

    console.log('');
    console.log('✅ Database seeded successfully!');
    console.log('');
    console.log('📦 Seeded data:');
    console.log('  - 7 Products Page items');
    console.log('  - 7 Shop items');
    console.log('  - 27 Pack pricing entries');
    console.log('  - 1 Site setting (brochure URL)');
    console.log('');
    console.log('🚀 You can now start the server with: npm start');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Initialize DB first, then seed
initDb()
  .then(() => {
    console.log('✅ Database initialized');
    return runSeed();
  })
  .catch(err => {
    console.error('❌ DB init failed:', err);
    process.exit(1);
  });
