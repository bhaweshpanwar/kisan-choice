const pool = require('../db/db');
const Email = require('../utils/email');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');

// Functions to be created here are
//1. sendOffer
//2. acceptOffer
//3. rejectOffer
//4. getFarmerOffers
//5. getConsumerOffers

// Helper: Fetch Product Details
async function getProductDetails(productId) {
  const productRes = await pool.query(
    'SELECT seller_id, negotiate, name, min_qty, max_qty FROM products WHERE id = $1',
    [productId]
  );
  return productRes.rows[0];
}

// Helper: Check if user is blocked by farmer
async function isUserBlocked(consumerId, farmerId) {
  const blockedRes = await pool.query(
    'SELECT 1 FROM blocked_accounts WHERE user_id = $1 AND farmer_id = $2 AND blocked_until > NOW()',
    [consumerId, farmerId]
  );
  return blockedRes.rowCount > 0;
}

//Helper: Fetch User Details
const getUserDetails = async (userId, role, client) => {
  let table;
  if (role === 'consumer') table = 'users';
  else if (role === 'farmer') table = 'users';
  else throw new Error('Invalid role for user lookup');

  const res = await client.query(
    `SELECT id, name, email FROM ${table} WHERE id = $1`,
    [userId]
  );

  if (res.rowCount === 0) return null;
  return res.rows[0];
};

const { sendOfferNotification } = require('../utils/email');

exports.sendOffer = catchAsync(async (req, res, next) => {
  const { productId, offeredPricePerUnit, quantity } = req.body;
  const consumerId = req.user.id;

  if (!productId || !offeredPricePerUnit || !quantity) {
    return res.status(400).json({
      status: 'fail',
      message: 'Product ID, offered price, and quantity are required.',
    });
  }

  if (parseFloat(offeredPricePerUnit) <= 0 || parseInt(quantity, 10) <= 0) {
    return res.status(400).json({
      status: 'fail',
      message: 'Price and quantity must be positive values.',
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const product = await getProductDetails(productId);
    console.log(product);

    if (!product) {
      await client.query('ROLLBACK');
      return res
        .status(404)
        .json({ status: 'fail', message: 'Product not found.' });
    }

    const {
      min_qty,
      max_qty,
      negotiate,
      seller_id: farmerId,
      name: productName,
    } = product;
    console.log(negotiate, min_qty, max_qty, farmerId);

    if (!negotiate) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        status: 'fail',
        message: 'This product is not open for negotiation.',
      });
    }

    if (quantity < min_qty || quantity > max_qty) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        status: 'fail',
        message: `Quantity must be between ${min_qty} and ${max_qty}.`,
      });
    }

    // Check if there is a current offer by this consumer for this product
    // Check if there is a previous offer for this product by the consumer
    const existingOfferRes = await client.query(
      `SELECT id, status, offer_date 
   FROM offers 
   WHERE product_id = $1 AND consumer_id = $2 
   ORDER BY offer_date DESC 
   LIMIT 1`,
      [productId, consumerId]
    );

    if (existingOfferRes.rowCount > 0) {
      const { status, offer_date } = existingOfferRes.rows[0];

      if (status === 'pending') {
        return next(
          new AppError(
            'You already have a pending offer for this product.',
            400
          )
        );
      }

      if (status === 'rejected') {
        const offerTime = new Date(offer_date);
        const now = new Date();
        const diffInHours = (now - offerTime) / (1000 * 60 * 60);

        if (diffInHours < 24) {
          return next(
            new AppError(
              `You can send another offer only after 24 hours of rejection. Please try again later.`,
              400
            )
          );
        }
      }

      if (status === 'accepted') {
        return next(
          new AppError(
            'Your previous offer was accepted. You cannot send another.',
            400
          )
        );
      }
    }

    // Check if consumer is blocked by this farmer
    if (await isUserBlocked(consumerId, farmerId)) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        status: 'fail',
        message:
          'You are currently blocked from sending offers to this farmer.',
      });
    }

    const offerQuery = `
      INSERT INTO offers (product_id, farmer_id, consumer_id, offer_price_per_unit, quantity, status)
      VALUES ($1, $2, $3, $4, $5, 'pending')
      RETURNING id, offer_date;
    `;
    const offerResult = await client.query(offerQuery, [
      productId,
      farmerId,
      consumerId,
      offeredPricePerUnit,
      quantity,
    ]);

    // Get farmer email
    const farmerRes = await client.query(
      'SELECT email FROM users WHERE id = $1',
      [farmerId]
    );
    const farmerEmail = farmerRes.rows[0]?.email;

    // Get consumer name
    const consumerRes = await client.query(
      'SELECT name FROM users WHERE id = $1',
      [consumerId]
    );

    const consumerName = consumerRes.rows[0]?.name || 'A user';
    if (farmerEmail) {
      const email = new Email(
        { email: farmerEmail, name: 'Farmer' },
        null, // URL
        {
          productName,
          offeredPrice: offeredPricePerUnit,
          quantity,
          consumerName,
        }
      );

      await email.sendOfferNotification();
    }

    await client.query('COMMIT');

    res.status(201).json({
      status: 'success',
      message: 'Offer sent successfully.',
      data: {
        offerId: offerResult.rows[0].id,
        offerDate: offerResult.rows[0].offer_date,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error sending offer:', error);
    res.status(500).json({ status: 'error', message: 'Failed to send offer.' });
  } finally {
    client.release();
  }
});

exports.acceptOffer = catchAsync(async (req, res, next) => {
  const { offerId } = req.params;
  const farmerId = req.user.id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    //Fething the offer details and ensuring that this offer belongs to the farmer
    const offerRes = await client.query(
      'SELECT id, product_id, consumer_id, offer_price_per_unit, quantity, status FROM offers WHERE id = $1 AND farmer_id = $2',
      [offerId, farmerId]
    );

    if (offerRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return next(
        new AppError(
          'Offer not found or you are not authorized to accept it.',
          404
        )
      );
    }
    const offer = offerRes.rows[0];
    if (offer.status !== 'pending') {
      await client.query('ROLLBACK');
      return next(
        new AppError(
          `This offer is already ${offer.status} and cannot be accepted.`,
          400
        )
      );
    }

    // 2. Update offer status
    await client.query(
      "UPDATE offers SET status = 'accepted', response_date = NOW() WHERE id = $1",
      [offerId]
    );

    // 3. Create accepted_offer record with 2-day expiry
    const expiryTime = new Date();
    expiryTime.setDate(expiryTime.getDate() + 2); // 2 days from now

    const acceptedOfferQuery = `
     INSERT INTO accepted_offers (offer_id, accepted_price, fixed_qty, expiry_time)
     VALUES ($1, $2, $3, $4) RETURNING id;
   `;

    const acceptedOfferResult = await client.query(acceptedOfferQuery, [
      offer.id,
      offer.offer_price_per_unit,
      offer.quantity,
      expiryTime,
    ]);

    // 4. Add item to consumer's cart
    //    a. Find or create cart for the consumer
    let cartRes = await client.query(
      'SELECT id FROM cart WHERE consumer_id = $1',
      [offer.consumer_id]
    );
    let cartId;
    if (cartRes.rowCount === 0) {
      const newCartRes = await client.query(
        'INSERT INTO cart (consumer_id) VALUES ($1) RETURNING id',
        [offer.consumer_id]
      );

      cartId = newCartRes.rows[0].id;
    } else {
      cartId = cartRes.rows[0].id;
    }

    //    b. Add item to cart_items
    await client.query(
      `INSERT INTO cart_items 
         (cart_id, product_id, quantity, price_per_unit, is_negotiated, negotiated_price_per_unit, quantity_fixed, accepted_offer_id)
       VALUES 
         ($1, $2, $3, $4, TRUE, $4, TRUE, $5)`,
      [
        cartId,
        offer.product_id,
        offer.quantity,
        offer.offer_price_per_unit,
        acceptedOfferResult.rows[0].id,
      ]
    );

    // 5. Send notification to consumer
    const consumer = await getUserDetails(
      offer.consumer_id,
      'consumer',
      client
    );
    const product = await getProductDetails(offer.product_id, client);

    if (consumer && consumer.email && product) {
      const email = new Email({
        email: consumer.email,
        name: consumer.name || 'Valued Customer',
      });
      await email.sendOfferAcceptedNotification({
        // Adapt your Email class method
        productName: product.name,
        acceptedPrice: offer.offer_price_per_unit,
        quantity: offer.quantity,
        farmerName: req.user.name || 'The Farmer',
        expiryDate: expiryTime.toLocaleDateString(),
      });
    }

    await client.query('COMMIT');
    res.status(200).json({
      status: 'success',
      message: 'Offer accepted and item added to consumer cart.',
      data: {
        acceptedOfferId: acceptedOfferResult.rows[0].id,
        cartId: cartId,
        expiresOn: expiryTime,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error in acceptOffer:', error);
    return next(
      new AppError('Failed to accept offer. Please try again later.', 500)
    );
  } finally {
    client.release();
  }
});

exports.rejectOffer = catchAsync(async (req, res, next) => {
  const { offerId } = req.params;
  const farmerId = req.user.id;
  const { reason } = req.body; // Optional reason from farmer

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const offerRes = await client.query(
      'SELECT id, product_id, consumer_id, status, rejection_count FROM offers WHERE id = $1 AND farmer_id = $2',
      [offerId, farmerId]
    );

    if (offerRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return next(
        new AppError(
          'Offer not found or you are not authorized to modify it.',
          404
        )
      );
    }
    const offer = offerRes.rows[0];
    if (offer.status !== 'pending') {
      await client.query('ROLLBACK');
      return next(
        new AppError(
          `This offer is already ${offer.status} and cannot be rejected.`,
          400
        )
      );
    }

    const newRejectionCount = offer.rejection_count + 1;
    await client.query(
      "UPDATE offers SET status = 'rejected', response_date = NOW(), rejection_count = $2 WHERE id = $1",
      [offerId, newRejectionCount]
    );

    // Automatic blocking logic (Example: block after 3 rejections from this farmer for any product)
    const BLOCK_THRESHOLD = 3;
    if (newRejectionCount >= BLOCK_THRESHOLD) {
      // Check total rejections from this farmer to this consumer
      const totalRejectionsRes = await client.query(
        "SELECT COUNT(*) as count FROM offers WHERE farmer_id = $1 AND consumer_id = $2 AND status = 'rejected'",
        [farmerId, offer.consumer_id]
      );
      const totalRejections = parseInt(totalRejectionsRes.rows[0].count, 10);

      if (totalRejections >= BLOCK_THRESHOLD) {
        const alreadyBlocked = await isUserBlocked(
          offer.consumer_id,
          farmerId,
          client
        );
        if (!alreadyBlocked) {
          await client.query(
            `INSERT INTO blocked_accounts ( user_id, farmer_id, reason)
                     VALUES ($1, $2, $3)`,
            [
              offer.consumer_id,
              farmerId,
              `Auto-blocked after ${totalRejections} offer rejections.`,
            ]
          );
          console.log(
            `User ${offer.consumer_id} auto-blocked by farmer ${farmerId}.`
          );
          // TODO: Optionally send email to farmer about auto-block?
        }
      }
    }

    // Send notification to consumer
    const consumer = await getUserDetails(
      offer.consumer_id,
      'consumer',
      client
    );
    const product = await getProductDetails(offer.product_id, client);

    if (consumer && consumer.email && product) {
      const email = new Email({
        email: consumer.email,
        name: consumer.name || 'Valued Customer',
      });
      await email.sendOfferRejectedNotification({
        // Adapt your Email class method
        productName: product.product_name,
        farmerName: req.user.name || 'The Farmer',
        rejectionReason:
          reason || 'The farmer chose not to accept this offer at this time.',
      });
    }

    await client.query('COMMIT');
    res.status(200).json({ status: 'success', message: 'Offer rejected.' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error in rejectOffer:', error);
    return next(
      new AppError('Failed to reject offer. Please try again later.', 500)
    );
  } finally {
    client.release();
  }
});

exports.getFarmerOffers = catchAsync(async (req, res, next) => {
  const farmerId = req.user.id;
  // Add pagination later if needed
  const offersRes = await pool.query(
    `SELECT o.id, o.offer_price_per_unit, o.quantity, o.status, o.offer_date, o.response_date,
            p.name AS product_name, p.id AS product_id,
            u.name AS consumer_name, u.id AS consumer_id
     FROM offers o
     JOIN products p ON o.product_id = p.id
     JOIN users u ON o.consumer_id = u.id
     WHERE o.farmer_id = $1
     ORDER BY o.offer_date DESC`,
    [farmerId]
  );

  res.status(200).json({
    status: 'success',
    results: offersRes.rowCount,
    data: {
      offers: offersRes.rows,
    },
  });
});

exports.getConsumerOffers = catchAsync(async (req, res, next) => {
  const consumerId = req.user.id;
  const offersRes = await pool.query(
    `SELECT o.id, o.offer_price_per_unit, o.quantity, o.status, o.offer_date, o.response_date,
            p.name AS product_name, p.id AS product_id,
            f.name AS farmer_name, f.id AS farmer_id
     FROM offers o
     JOIN products p ON o.product_id = p.id
     JOIN users f ON o.farmer_id = f.id
     WHERE o.consumer_id = $1
     ORDER BY o.offer_date DESC`,
    [consumerId]
  );

  res.status(200).json({
    status: 'success',
    results: offersRes.rowCount,
    data: {
      offers: offersRes.rows,
    },
  });
});
