// Run with: npm run db:init
// Creates all tables/extensions/indexes defined in schema.sql

const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

async function initDb() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');

  try {
    console.log('Running schema.sql against the database...');
    await pool.query(schema);
    console.log('✅ Database initialized successfully.');
  } catch (err) {
    console.error('❌ Failed to initialize database:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

initDb();
