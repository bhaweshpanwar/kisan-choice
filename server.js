const dotenv = require('dotenv');
const app = require('./app');
dotenv.config({ path: './config.env' });
const pool = require('./db/db');

const OrderScheduler = require('./utils/orderScheduler');
const cartCleaner = require('./utils/cartCleaner');
const port = process.env.APP_PORT || 3001;

app.listen(port, async () => {
  try {
    await pool.connect();
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
