const cron = require('node-cron');
const pool = require('../db/db');
const Email = require('./email');

// Function to update orders automatically (exported for external trigger)
const updateOrdersToDelivered = async () => {
  const client = await pool.connect();
  try {
    console.log('🔄 Starting automatic order update...');

    await client.query('BEGIN');

    const findOrdersQuery = `
      SELECT o.id, o.consumer_id, u.email, u.name
      FROM orders o
      JOIN users u ON o.consumer_id = u.id
      WHERE o.order_status = 'shipped' AND o.updated_at <= NOW() - INTERVAL '2 days';
    `;
    const { rows: ordersToUpdate } = await client.query(findOrdersQuery);

    if (ordersToUpdate.length === 0) {
      console.log('✅ No orders to update to delivered.');
      await client.query('COMMIT');
      return { updated: 0 };
    }

    const updateQuery = `
      UPDATE orders
      SET order_status = 'delivered', updated_at = NOW()
      WHERE order_status = 'shipped' AND updated_at <= NOW() - INTERVAL '2 days';
    `;
    await client.query(updateQuery);

    for (const order of ordersToUpdate) {
      const email = new Email({ email: order.email, name: order.name }, null);
      await email.send(
        'orderDelivered',
        `Your order ${order.id} has been delivered - Kisan Choice`
      );
    }

    await client.query('COMMIT');
    console.log(`✅ Updated ${ordersToUpdate.length} orders to "delivered".`);
    return { updated: ordersToUpdate.length };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error in automatic order update:', error);
    throw error;
  } finally {
    client.release();
  }
};
// for free tier deploy application sleep
if (process.env.ENABLE_INPROCESS_CRON !== 'false') {
  cron.schedule('0 0 * * *', async () => {
    console.log('🔄 Running scheduled order update...');
    await updateOrdersToDelivered();
  });
}

module.exports = { updateOrdersToDelivered };