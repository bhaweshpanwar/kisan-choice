const fs = require('fs');
const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config({ path: './../../config.env' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.on('connect', () => {
  console.log('connected to the db');
});

const products = JSON.parse(
  fs.readFileSync(`${__dirname}/products.json`, 'utf-8')
);

const importData = async () => {
  try {
    for (const product of products) {
      await pool.query(
        `INSERT INTO products 
            (name, price, stock_quantity, category_id, negotiate, description, key_highlights, min_qty, max_qty, verified, seller_id)
           VALUES 
            ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          product.name,
          product.price,
          product.stock_quantity,
          product.category,
          product.negotiate || false,
          product.description,
          product.key_highlights || [],
          product.min_qty,
          product.max_qty,
          product.verified || false,
          product.seller_id,
        ]
      );

      console.log(`✅ Inserted: ${product.name}`);
    }

    console.log('🎉 All products imported successfully!');
    process.exit();
  } catch (err) {
    console.error('❌ Error importing products:', err);
    process.exit(1);
  }
};

const deleteData = async () => {
  try {
    await pool.query('DELETE FROM products');
    console.log('🗑️ All products deleted successfully!');
    process.exit();
  } catch (err) {
    console.error('❌ Error deleting products:', err);
    process.exit(1);
  }
};

if (process.argv[2] === '--import') {
  importData();
} else if (process.argv[2] === '--delete') {
  deleteData();
} else {
  console.log('❗ Please provide a valid command: --import or --delete');
  process.exit();
}
