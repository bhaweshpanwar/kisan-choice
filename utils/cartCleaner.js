const cron = require('node-cron');
const pool = require('../db/db');

// Job to remove expired accepted offers from carts (if not ordered).
// Exported for external trigger (cron-job.org / GitHub Actions) on Render free tier.
const expireAcceptedOffers = async () => {
  const client = await pool.connect();
  try {
    console.log('Running scheduled job: Expire accepted offers from carts...');
    await client.query('BEGIN');

    const expiredOffersRes = await client.query(
      `SELECT ao.id as accepted_offer_id, ao.offer_id, ci.id as cart_item_id, ci.cart_id
       FROM accepted_offers ao
       JOIN cart_items ci ON ao.id = ci.accepted_offer_id
       WHERE ao.expiry_time < NOW()`
    );

    if (expiredOffersRes.rowCount === 0) {
      console.log('No expired accepted offers found in carts.');
      await client.query('COMMIT');
      return { removed: 0 };
    }

    const cartItemIdsToDelete = expiredOffersRes.rows.map(
      (row) => row.cart_item_id
    );
    const offerIdsToUpdate = expiredOffersRes.rows.map((row) => row.offer_id);

    if (cartItemIdsToDelete.length > 0) {
      await client.query(
        'DELETE FROM cart_items WHERE id = ANY($1::uuid[]) RETURNING id',
        [cartItemIdsToDelete]
      );
      console.log(
        `Removed ${cartItemIdsToDelete.length} expired negotiated items from carts.`
      );

      if (offerIdsToUpdate.length > 0) {
        await client.query(
          "UPDATE offers SET status = 'rejected' WHERE id = ANY($1::uuid[]) AND status = 'accepted'",
          [offerIdsToUpdate]
        );
        console.log(
          `Updated status for ${offerIdsToUpdate.length} original offers to 'rejected'.`
        );
      }
    }

    await client.query('COMMIT');
    console.log('Finished expiring accepted offers job.');
    return { removed: cartItemIdsToDelete.length };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error in scheduled job for expiring accepted offers:', error);
    throw error;
  } finally {
    client.release();
  }
};

if (process.env.ENABLE_INPROCESS_CRON !== 'false') {
  cron.schedule('0 0 * * *', expireAcceptedOffers);
  console.log('Cron jobs scheduled.');
}

module.exports = { expireAcceptedOffers };