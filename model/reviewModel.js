const pool = require('./../db/db');

exports.findAll = async () => {
  const result = await pool.query(
    `SELECT 
       reviews.id AS review_id,
       reviews.consumer_id AS reviewer_id,
       reviews.comments AS comment
     FROM reviews
     ORDER BY reviews.created_at DESC`
  );
  return result.rows;
};

exports.findById = async (id) => {
  const result = await pool.query(
    `SELECT 
       reviews.id AS review_id,
       reviews.consumer_id AS reviewer_id,
       reviews.comments,
       reviews.rating,
       users.name AS reviewer_name,
       users.photo AS reviewer_photo
     FROM reviews
     JOIN users ON reviews.consumer_id = users.id
     WHERE reviews.id = $1`,
    [id]
  );
  return result.rows[0];
};

exports.findByProduct = async (productId) => {
  const result = await pool.query(
    `SELECT 
       reviews.id AS review_id,
       reviews.consumer_id AS reviewer_id,
       reviews.comments AS comment,
       reviews.rating,
       users.name AS reviewer_name,
       users.photo AS reviewer_photo
     FROM reviews
     JOIN users ON reviews.consumer_id = users.id
     WHERE reviews.product_id = $1
     ORDER BY reviews.created_at DESC`,
    [productId]
  );
  return result.rows;
};

exports.create = async ({ userId, productId, reviewText, rating }) => {
  const result = await pool.query(
    `INSERT INTO reviews (user_id, product_id, review_text, rating)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [userId, productId, reviewText, rating]
  );
  return result.rows[0];
};

exports.update = async (id, userId, updatedFields) => {
  delete updatedFields.reviewer_id;

  const fields = Object.keys(updatedFields);
  const values = Object.values(updatedFields);

  values.push(id, userId);

  if (fields.length === 0) {
    throw new AppError('No valid fields provided for the update.', 400);
  }

  const setClause = fields
    .map((field, index) => `"${field}" = $${index + 1}`)
    .join(', ');

  const result = await pool.query(
    `UPDATE reviews
     SET ${setClause}, updated_at = CURRENT_TIMESTAMP
     WHERE id = $${fields.length + 1} AND user_id = $${fields.length + 2}
     RETURNING *`,
    values
  );

  return result.rows[0];
};

exports.delete = async (id, userId) => {
  const result = await pool.query(
    'DELETE FROM reviews WHERE id = $1 AND user_id = $2 RETURNING *',
    [id, userId]
  );
  return result.rows[0];
};
