const cron = require('node-cron');
const pool = require('../db/db');
const Email = require('./email');

// Function to update orders automatically
const updateOrdersToDelivered = async () => {
  const client = await pool.connect();
  try {
    console.log('🔄 Starting automatic order update...');

    await client.query('BEGIN');

    // Find orders that are "shipped" and older than 2 days
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
      return;
    }

    // Update order status to "delivered"
    const updateQuery = `
      UPDATE orders
      SET order_status = 'delivered', updated_at = NOW()
      WHERE order_status = 'shipped' AND updated_at <= NOW() - INTERVAL '2 days';
    `;
    await client.query(updateQuery);

    // Send email notifications to consumers
    for (const order of ordersToUpdate) {
      const email = new Email({ email: order.email, name: order.name }, null);
      await email.send(
        'orderDelivered',
        `Your order ${order.id} has been delivered - Kisan Choice`
      );
    }

    await client.query('COMMIT');
    console.log(`✅ Updated ${ordersToUpdate.length} orders to "delivered".`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error in automatic order update:', error);
  } finally {
    client.release();
  }
};

cron.schedule('0 0 * * *', async () => {
  console.log('🔄 Running scheduled order update...');
  await updateOrdersToDelivered();
});
