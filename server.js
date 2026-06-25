const dotenv = require('dotenv');
dotenv.config({ path: './config.env' });
const app = require('./app');
const pool = require('./db/db');

// Side-effect import: registers node-cron schedules inside this process.
// On Render free tier the service sleeps, so /api/v1/admin/* routes
// (protected by CRON_SECRET) let an external free cron pinger run these.
require('./utils/orderScheduler');
require('./utils/cartCleaner');

const port = process.env.APP_PORT || 3001;

app.listen(port, async () => {
  try {
    await pool.query('SELECT 1');
    console.log('🔐 Database connected successfully.');
    console.log(`🚀 Server started on port ${port}`);
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    process.exit(1);
  }
});

process.on('unhandledRejection', (err) => {
  console.log(err.name, err.message);
  console.log('UNHANDLED REJECTION! Shutting down...');
  process.exit(1);
});
