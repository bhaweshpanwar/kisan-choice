const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config({ path: './config.env' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('connect', () => {
  console.log('🔐 Connected to database');
});

pool.on('error', (err) => {
  console.error('💥 Error connecting to database', err);
});

module.exports = pool;
