const fs = require('fs');
const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config({ path: './../../config.env' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.on('connect', () => {
  console.log('📦 Connected to the database');
});

const reviews = JSON.parse(
  fs.readFileSync(`${__dirname}/reviews.json`, 'utf-8')
);

const importReviews = async () => {
  try {
    for (const review of reviews) {
      await pool.query(
        `INSERT INTO reviews 
          (product_id, consumer_id, rating, comments)
         VALUES 
          ($1, $2, $3, $4)`,
        [review.product_id, review.consumer_id, review.rating, review.comment]
      );

      console.log(`✅ Review inserted for product ID: ${review.product_id}`);
    }

    console.log('🎉 All reviews imported successfully!');
    process.exit();
  } catch (err) {
    console.error('❌ Error importing reviews:', err);
    process.exit(1);
  }
};

const deleteReviews = async () => {
  try {
    await pool.query('DELETE FROM reviews');
    console.log('🗑️ All reviews deleted successfully!');
    process.exit();
  } catch (err) {
    console.error('❌ Error deleting reviews:', err);
    process.exit(1);
  }
};

if (process.argv[2] === '--import') {
  importReviews();
} else if (process.argv[2] === '--delete') {
  deleteReviews();
} else {
  console.log('❗ Please provide a valid command: --import or --delete');
  process.exit();
}
