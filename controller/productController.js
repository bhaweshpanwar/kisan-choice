// Description: Handles all the product related routes
const pool = require('./../db/db');
const client = require('./../db/redis');
const catchAsync = require('../utils/catchAsync');
const APIFeatures = require('../utils/apiFeatures');

exports.getAllProducts = catchAsync(async (req, res, next) => {
  const cacheKey = `products:${JSON.stringify(req.query)}`;

  //step 1 checking the cache first with the key
  const cachedResult = await client.get(cacheKey);
  if (cachedResult) {
    console.log('serving from cache');
    return res.status(200).json({
      status: 'success',
      data: JSON.parse(cachedResult),
    });
  }

  //step 2 if not available in cache then query the database
  const baseQuery = `SELECT p.*, c.category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id`;

  const features = new APIFeatures(baseQuery, req.query)
    .filter()
    .sort()
    .limitFields()
    .paginate();

  const { rows } = await pool.query(features.query, features.queryParams);

  res.status(200).json({
    status: 'success',
    results: rows.length,
    data: {
      products: rows,
    },
  });
  //step 3 storing the result in cache
  client.setex(cacheKey, 3600, JSON.stringify(rows));
});

exports.createProduct = catchAsync(async (req, res, next) => {
  const {
    name,
    price,
    stock_quantity,
    category, // UUID
    negotiate,
    description,
    key_highlights,
    min_qty,
    max_qty,
  } = req.body;

  if (
    !name ||
    !price ||
    !stock_quantity ||
    !category ||
    !description ||
    !min_qty ||
    !max_qty
  ) {
    return next(
      new AppError('Please provide all required product fields.', 400)
    );
  }

  const productQuery = `
    INSERT INTO products
      (name, price, stock_quantity, category_id, negotiate, description, key_highlights, min_qty, max_qty, verified)
    VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, false)
    RETURNING *`;

  const values = [
    name,
    price,
    stock_quantity,
    category,
    negotiate || false,
    description,
    key_highlights || [],
    min_qty,
    max_qty,
  ];

  const { rows } = await pool.query(productQuery, values);

  res.status(201).json({
    status: 'success',
    data: {
      product: rows[0],
    },
  });
});

exports.searchProduct = catchAsync(async (req, res, next) => {
  const { q, page = 1, limit = 10 } = req.query;

  if (!q) {
    return res.status(400).json({
      status: 'fail',
      message: 'Search query (q) is required',
    });
  }

  const offset = (page - 1) * limit;

  const searchQuery = `
    SELECT 
      p.*, 
      c.name AS category_name, 
      u.name AS seller_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN farmers f ON p.seller_id = f.id
    LEFT JOIN users u ON f.id = u.id
    WHERE 
      to_tsvector('english', 
        COALESCE(p.name, '') || ' ' || 
        COALESCE(c.name, '') || ' ' || 
        COALESCE(u.name, '')
      ) @@ plainto_tsquery('english', $1)
    ORDER BY p.name
    LIMIT $2 OFFSET $3;
  `;

  const values = [q, limit, offset];

  const { rows } = await pool.query(searchQuery, values);

  if (rows.length === 0) {
    return res.status(404).json({
      status: 'fail',
      message: 'No products found',
    });
  }

  res.status(200).json({
    status: 'success',
    results: rows.length,
    data: {
      products: rows,
    },
  });
});

exports.getProductsByCategory = catchAsync(async (req, res, next) => {
  const { category } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;

  const offset = (page - 1) * limit;

  const categoryQuery = `
    SELECT 
      p.*, 
      c.name AS category_name, 
      u.name AS seller_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN farmers f ON p.seller_id = f.id
    LEFT JOIN users u ON f.id = u.id
    WHERE c.name ILIKE $1
    ORDER BY p.name
    LIMIT $2 OFFSET $3;
  `;

  const values = [`%${category}%`, limit, offset];

  const countQuery = `SELECT COUNT(*) FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE c.name ILIKE $1`;

  const countResult = await pool.query(countQuery, [`%${category}%`]);
  const total = parseInt(countResult.rows[0].count);

  const { rows } = await pool.query(categoryQuery, values);

  if (rows.length === 0) {
    return res.status(404).json({
      status: 'fail',
      message: `No products found in category '${category}'`,
    });
  }

  res.status(200).json({
    status: 'success',
    results: rows.length,
    total,
    currentPage: page,
    totalPages: Math.ceil(total / limit),
    data: {
      products: rows,
    },
  });
});

exports.getProduct = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const productQuery = `
  SELECT 
    p.*, 
    c.name AS category_name, 
    u.name AS seller_name,
    COALESCE(
      json_agg(
        jsonb_build_object(
          'id', r.id,
          'rating', r.rating,
          'comment', r.comments,
          'user_id', r.consumer_id,
          'created_at', r.created_at,
          'user_name', ru.name
        )
        ORDER BY r.created_at DESC
      ) FILTER (WHERE r.id IS NOT NULL), '[]'
    ) AS reviews
  FROM products p
  LEFT JOIN categories c ON p.category_id = c.id
  LEFT JOIN farmers f ON p.seller_id = f.id
  LEFT JOIN users u ON f.id = u.id
  LEFT JOIN LATERAL (
    SELECT *
    FROM reviews
    WHERE product_id = p.id
    ORDER BY created_at DESC
    LIMIT 3
  ) r ON true
  LEFT JOIN users ru ON ru.id = r.consumer_id
  WHERE p.id = $1
  GROUP BY p.id, c.name, u.name
  `;

  const { rows } = await pool.query(productQuery, [id]);

  if (rows.length === 0) {
    return res.status(404).json({
      status: 'fail',
      message: 'Product not found',
    });
  }

  res.status(200).json({
    status: 'success',
    data: {
      product: rows[0],
    },
  });
});

exports.updateProduct = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const updates = req.body;

  if (updates.seller_id) {
    return next(new AppError('Updating seller_id is not allowed', 400));
  }

  const fields = Object.keys(updates);
  const values = Object.values(updates);
  values.push(id);

  if (fields.length === 0) {
    return next(new AppError('No update fields provided', 400));
  }

  const setClause = fields
    .map((field, index) => `"${field}" = $${index + 1}`)
    .join(', ');

  const query = `
    UPDATE products 
    SET ${setClause}
    WHERE id = $${fields.length + 1}
    RETURNING *;
  `;

  const result = await pool.query(query, values);

  if (!result || result.rowCount === 0) {
    return res.status(404).json({
      status: 'fail',
      message: 'No product found with the given ID',
    });
  }

  res.status(200).json({
    status: 'success',
    data: {
      product: result.rows[0],
    },
  });
});

exports.deleteProduct = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const deleteQuery = 'DELETE FROM products WHERE id = $1 RETURNING *';
  const { rows } = await pool.query(deleteQuery, [id]);

  if (rows.length === 0) {
    return res.status(404).json({
      status: 'fail',
      message: 'Product not found',
    });
  }

  res.status(204).json({
    status: 'success',
    data: null,
  });
});
