// utils/cronJobs.js (or similar)
const cron = require('node-cron');
const pool = require('../db/db'); // Adjust path to your db pool

// Job to remove expired accepted offers from carts (if not ordered)
// Runs, for example, every hour: '0 * * * *'
// Runs daily at midnight: '0 0 * * *'
cron.schedule('0 0 * * *', async () => {
  console.log('Running scheduled job: Expire accepted offers from carts...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Find accepted_offers that have expired
    const expiredOffersRes = await client.query(
      `SELECT ao.id as accepted_offer_id, ao.offer_id, ci.id as cart_item_id, ci.cart_id
       FROM accepted_offers ao
       JOIN cart_items ci ON ao.id = ci.accepted_offer_id
       WHERE ao.expiry_time < NOW()`
    );

    if (expiredOffersRes.rowCount === 0) {
      console.log('No expired accepted offers found in carts.');
      await client.query('COMMIT'); // or ROLLBACK, doesn't matter much here
      return;
    }

    const cartItemIdsToDelete = expiredOffersRes.rows.map(
      (row) => row.cart_item_id
    );
    const acceptedOfferIdsToExpireStatus = expiredOffersRes.rows.map(
      (row) => row.accepted_offer_id
    );

    if (cartItemIdsToDelete.length > 0) {
      const deleteCartItemsRes = await client.query(
        'DELETE FROM cart_items WHERE id = ANY($1::uuid[]) RETURNING id',
        [cartItemIdsToDelete]
      );
      console.log(
        `Removed ${deleteCartItemsRes.rowCount} expired negotiated items from carts.`
      );

      const offerIdsToUpdate = expiredOffersRes.rows.map((row) => row.offer_id);
      if (offerIdsToUpdate.length > 0) {
        await client.query(
          "UPDATE offers SET status = 'lapsed' WHERE id = ANY($1::uuid[]) AND status = 'accepted'",
          [offerIdsToUpdate]
        );
        console.log(
          `Updated status for ${offerIdsToUpdate.length} original offers to 'lapsed'.`
        );
      }
    }

    await client.query('COMMIT');
    console.log('Finished expiring accepted offers job.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(
      'Error in scheduled job for expiring accepted offers:',
      error
    );
  } finally {
    client.release();
  }
});

console.log('Cron jobs scheduled.');
