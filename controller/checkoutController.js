const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const catchAsync = require('../utils/catchAsync');
const pool = require('./../db/db');

exports.getCheckoutSession = catchAsync(async (req, res, next) => {
  const userId = req.user.id;

  // Fetch user's cart details and calculate total amount
  const cartQuery = `
    SELECT ci.*, p.name, p.price, p.image, p.description
    FROM cart_items ci
    JOIN cart c ON ci.cart_id = c.id
    JOIN products p ON ci.product_id = p.id
    WHERE c.consumer_id = $1
  `;
  const { rows: cartItems } = await pool.query(cartQuery, [userId]);

  if (cartItems.length === 0) {
    return next(new AppError('No items in the cart.', 400));
  }

  const totalAmount = cartItems.reduce(
    (sum, item) => sum + item.quantity * item.price,
    0
  );

  // Stripe payment session
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    success_url: `${req.protocol}://${req.get('host')}/success`,
    cancel_url: `${req.protocol}://${req.get('host')}/cart`,
    customer_email: req.user.email,
    line_items: cartItems.map((item) => ({
      price_data: {
        currency: 'inr',
        unit_amount: item.price * 100,
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
    session,
  });
});

exports.handleWebhook = async (req, res, next) => {
  const sig = req.headers['stripe-signature'];

  try {
    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;

      const customerId = session.client_reference_id;
      const amount = session.amount_total / 100;

      // Insert order into the database
      const orderQuery = `
          INSERT INTO orders (consumer_id, total_price, status)
          VALUES ($1, $2, 'paid') RETURNING id
        `;
      const { rows: orderRows } = await pool.query(orderQuery, [
        customerId,
        amount,
      ]);
      const orderId = orderRows[0].id;

      // Clear the user's cart
      const clearCartQuery = `
          DELETE FROM cart_items WHERE cart_id = (
            SELECT id FROM cart WHERE consumer_id = $1
          )
        `;
      await pool.query(clearCartQuery, [customerId]);

      console.log(`Order ${orderId} created and cart cleared.`);
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error(`Webhook Error: ${err.message}`);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
};
