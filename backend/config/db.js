const { Pool } = require('pg');
require('dotenv').config();

// Connection pool - reused across all queries instead of opening
// a new connection every time (important once dispatcher dashboard
// is polling/streaming frequently)
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'fire_report_db',
});

pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err);
});

module.exports = pool;
