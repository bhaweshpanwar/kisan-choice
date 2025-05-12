const dotenv = require('dotenv');
dotenv.config({ path: './config.env' });
const catchAsync = require('../utils/catchAsync');
const pool = require('./../db/db');
const AppError = require('../utils/appError');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.getCheckoutSession = catchAsync(async (req, res, next) => {
  const { order_id, items_for_stripe } = req.body; // Expect order_id and items from frontend
  const userId = req.user.id; // For customer_email
  // console.log(`Received order_id: ${order_id}`);
  // console.log(`Received items_for_stripe: ${JSON.stringify(items_for_stripe)}`);

  if (!order_id || !items_for_stripe || items_for_stripe.length === 0) {
    return next(
      new AppError(
        'Order ID and items are required to create a payment session.',
        400
      )
    );
  }

  // Optional: Validate that order_id belongs to req.user.id and is 'pending_payment'
  const orderCheck = await pool.query(
    'SELECT id FROM orders WHERE id = $1 AND consumer_id = $2 AND order_status = $3',
    [order_id, userId, 'pending']
  );
  if (orderCheck.rowCount === 0) {
    return next(
      new AppError('Invalid order or order not ready for payment.', 400)
    );
  }

  // Fetch user's cart details and calculate total amount
  const cartQuery = `
    SELECT ci.*, p.name, p.price, p.description
    FROM cart_items ci
    JOIN cart c ON ci.cart_id = c.id
    JOIN products p ON ci.product_id = p.id
    WHERE c.consumer_id = $1
  `;
  const { rows: cartItems } = await pool.query(cartQuery, [userId]);

  if (cartItems.length === 0) {
    return next(new AppError('No items in the cart.', 400));
  }
  // console.log(
  //   `Cart items fetched for userId ${userId}: ${JSON.stringify(cartItems)}`
  // );

  // Stripe payment session
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    success_url: `http://localhost:8080/`,
    cancel_url: `http://localhost:8080/cart`,
    client_reference_id: order_id,
    customer_email: req.user.email,
    line_items: cartItems.map((item) => ({
      price_data: {
        currency: 'usd',
        unit_amount: Math.round(item.price * 100),
        product_data: {
          name: item.name,
          description: item.description,
          images: [item.image],
        },
      },
      quantity: item.quantity,
    })),
  });

  res.status(200).json({
    status: 'success',
    session: { id: session.id, url: session.url }, // Only send necessary fields to frontend
  });
});

exports.handleWebhook = async (req, res, next) => {
  console.log(
    `\n✅ WEBHOOK /api/v1/cart/webhook HIT at ${new Date().toISOString()}`
  );
  // console.log('--- WEBHOOK RECEIVED ---'); // Optional for less noise
  // console.log('Headers:', JSON.stringify(req.headers, null, 2)); // Optional

  const sig = req.headers['stripe-signature'];
  let event;

  if (!sig) {
    console.error('🔴 Webhook Error: stripe-signature header is MISSING.');
    return res
      .status(400)
      .send('Webhook Error: Missing stripe-signature header.');
  }
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error(
      '🔴 Webhook Error: STRIPE_WEBHOOK_SECRET is not set in environment variables.'
    );
    return res
      .status(500)
      .send(
        'Webhook Error: Server configuration issue (webhook secret missing).'
      );
  }

  try {
    event = stripe.webhooks.constructEvent(
      req.body, // Use raw body
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
    console.log('✅ Webhook event constructed successfully:', event.type);
  } catch (err) {
    console.error(
      `🔴 Webhook signature verification FAILED or other construction error:`,
      err.message
    );
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const orderIdFromStripe = session.client_reference_id;
    const paymentIntentId = session.payment_intent;

    if (!orderIdFromStripe) {
      console.error(
        'Webhook Error: client_reference_id (order_id) missing in Stripe session.'
      );
      return res
        .status(400)
        .send('Webhook Error: Missing client_reference_id.');
    }

    console.log(
      `Processing checkout.session.completed for order_id: ${orderIdFromStripe}`
    );
    console.log(`Payment Intent ID: ${paymentIntentId}`);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Fetch the order to get consumer_id and verify its current statuses
      // Using YOUR schema: orders table has consumer_id, payment_status, order_status
      const getOrderQuery = `
        SELECT consumer_id, payment_status, order_status
        FROM orders
        WHERE id = $1
      `;
      const { rows: orderRows } = await client.query(getOrderQuery, [
        orderIdFromStripe,
      ]);

      if (orderRows.length === 0) {
        console.error(
          `Webhook Error: Order with ID ${orderIdFromStripe} not found.`
        );
        await client.query('ROLLBACK');
        return res.status(404).send('Webhook Error: Order not found.');
      }

      const orderData = orderRows[0];
      const userIdForCartClear = orderData.consumer_id;

      console.log(
        `Order ${orderIdFromStripe} current payment_status: ${orderData.payment_status}, order_status: ${orderData.order_status}`
      );

      // Idempotency: Only update if the payment_status is still 'pending'
      if (orderData.payment_status === 'pending') {
        // 2. Update order: set payment_status to 'completed', order_status to 'pending' (or 'processing' if that's your next step)
        // and store Stripe's payment_intent_id. Also set paid_at.
        // Assuming orders table has payment_intent_id (TEXT) and paid_at (TIMESTAMP) columns
        const updateOrderQuery = `
          UPDATE orders
          SET
            payment_status = 'completed',
            order_status = 'pending', /* Or 'processing' if that's your initial status after payment */
            updated_at = NOW()
          WHERE id = $1 AND payment_status = 'pending'`; // Ensure it's still pending payment
        const updateResult = await client.query(updateOrderQuery, [
          orderIdFromStripe,
        ]);

        if (updateResult.rowCount === 0) {
          console.log(
            `Order ${orderIdFromStripe} was already processed or not in 'pending' payment_status state.`
          );
        } else {
          console.log(
            `Order ${orderIdFromStripe} payment_status updated to 'completed', order_status to 'pending'.`
          );

          // 3. Update stock quantity for each product in the order
          const getOrderItemsQuery =
            'SELECT product_id, quantity FROM order_items WHERE order_id = $1';
          const { rows: orderItems } = await client.query(getOrderItemsQuery, [
            orderIdFromStripe,
          ]);

          console.log(
            `Found ${orderItems.length} items for stock update in order ${orderIdFromStripe}.`
          );
          for (const item of orderItems) {
            const updateStockQuery = `
              UPDATE products
              SET stock_quantity = stock_quantity - $1
              WHERE id = $2 AND stock_quantity >= $1;`;
            const stockUpdateResult = await client.query(updateStockQuery, [
              item.quantity,
              item.product_id,
            ]);
            if (stockUpdateResult.rowCount === 0) {
              console.error(
                `CRITICAL: Failed to update stock for product ${item.product_id} (qty: ${item.quantity}) in order ${orderIdFromStripe}. Stock might have been insufficient or product ID incorrect.`
              );
              // This is a serious issue. You might want to flag the order, log extensively, or even attempt to reverse/refund.
              // For now, we'll continue processing other items and commit the order status change.
            } else {
              console.log(
                `Stock updated for product ${item.product_id} (decreased by ${item.quantity}).`
              );
            }
          }

          // 4. Clear the user's cart
          // Your schema: cart_items has cart_id which references cart.id; cart has consumer_id
          const clearCartQuery = `
            DELETE FROM cart_items
            WHERE cart_id = (SELECT id FROM cart WHERE consumer_id = $1)
          `;
          const clearCartResult = await client.query(clearCartQuery, [
            userIdForCartClear,
          ]);
          console.log(
            `Cart cleared for consumer_id: ${userIdForCartClear}. Items deleted: ${clearCartResult.rowCount}`
          );
        }
      } else {
        console.log(
          `Order ${orderIdFromStripe} already has payment_status: '${orderData.payment_status}'. Webhook event ignored for idempotency.`
        );
      }

      await client.query('COMMIT');
      console.log(
        `Successfully processed webhook for order ${orderIdFromStripe}`
      );
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(
        `Webhook DB Error for order ${orderIdFromStripe}: ${err.message}`,
        err.stack
      );
      return res.status(500).send('Webhook processing error.');
    } finally {
      client.release();
    }
  } else {
    console.log(`Unhandled event type ${event.type}. Acknowledging.`);
  }

  res.status(200).json({ received: true });
};
