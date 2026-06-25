const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config({ path: './config.env' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000, // bumped for Neon cold-start latency (free tier)
  ssl: { rejectUnauthorized: false }, // REQUIRED for Neon
  allowExitOnIdle: false,
});

pool.on('connect', () => {
  console.log('🔐 Connected to database');
});

// Do NOT process.exit on pool errors — Neon / free-tier Postgres drops idle
// sockets periodically. Let the pool self-heal on the next query.
pool.on('error', (err) => {
  console.error('💥 Unexpected pool error (non-fatal, will retry):', err.message);
});

// Keepalive ping: Neon's pooler kills idle connections after ~60s.
// Ping every 25s so we stay well under that window.
const keepAlive = () => {
  pool.query('SELECT 1').catch((err) => {
    console.error('💥 Keepalive ping failed:', err.message);
  });
};
setInterval(keepAlive, 25_000);

process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down database pool...');
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down database pool...');
  await pool.end();
  process.exit(0);
});

module.exports = pool;
