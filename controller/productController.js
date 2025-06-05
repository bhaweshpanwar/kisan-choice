// Description: Handles all the product related routes
const pool = require('./../db/db');
const client = require('./../db/redis');
const catchAsync = require('../utils/catchAsync');
const APIFeatures = require('../utils/apiFeatures');
const AppError = require('../utils/appError');
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
    category_id, // UUID
    negotiate,
    description,
    key_highlights,
    min_qty,
    max_qty,
  } = req.body;
  console.log(`Are we getting all the things we need?`, {
    name,
    price,
    stock_quantity,
    category_id,
    negotiate,
    description,
    key_highlights,
    min_qty,
    max_qty,
  });
  const seller_id = req.user.id; // Assuming the seller_id is the ID of the logged-in user

  if (
    !name ||
    !price ||
    !stock_quantity ||
    !category_id ||
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
      (name, price, stock_quantity, category_id, negotiate, description, key_highlights, min_qty, max_qty, verified, seller_id)
    VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, false, $10)
    RETURNING *`;

  const values = [
    name,
    price,
    stock_quantity,
    category_id,
    negotiate || false,
    description,
    key_highlights || [],
    min_qty,
    max_qty,
    seller_id,
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

// exports.getProductsByCategory = catchAsync(async (req, res, next) => {
//   const { category } = req.params;
//   const page = parseInt(req.query.page) || 1;
//   const limit = parseInt(req.query.limit) || 10;

//   const offset = (page - 1) * limit;

//   // const categoryQuery = `
//   //   SELECT
//   //     p.*,
//   //     c.name AS category_name,
//   //     u.name AS seller_name,
//   //     u.photo AS seller_photo
//   //   FROM products p
//   //   LEFT JOIN categories c ON p.category_id = c.id
//   //   LEFT JOIN farmers f ON p.seller_id = f.id
//   //   LEFT JOIN users u ON f.id = u.id
//   //   WHERE c.name ILIKE $1
//   //   ORDER BY p.name
//   //   LIMIT $2 OFFSET $3;
//   // `;

//   const categoryQuery = `
//   SELECT
//   p.*,
//   c.name AS category_name,
//   u.name AS seller_name,
//   u.photo AS seller_photo,
//   ROUND(AVG(r.rating)::numeric, 1) AS ratings_average,
//   COUNT(r.id) AS reviews_count
//   FROM products p
//   LEFT JOIN categories c ON p.category_id = c.id
//   LEFT JOIN farmers f ON p.seller_id = f.id
//   LEFT JOIN users u ON f.id = u.id
//   LEFT JOIN reviews r ON p.id = r.product_id
//   WHERE c.name ILIKE $1
//   GROUP BY p.id, c.name, u.name, u.photo
//   ORDER BY p.name
//   LIMIT $2 OFFSET $3;
//   `;

//   const values = [`%${category}%`, limit, offset];

//   const countQuery = `SELECT COUNT(*) FROM products p
//     LEFT JOIN categories c ON p.category_id = c.id
//     WHERE c.name ILIKE $1`;

//   const countResult = await pool.query(countQuery, [`%${category}%`]);
//   const total = parseInt(countResult.rows[0].count);

//   const { rows } = await pool.query(categoryQuery, values);

//   if (rows.length === 0) {
//     return res.status(404).json({
//       status: 'fail',
//       message: `No products found in category '${category}'`,
//     });
//   }

//   res.status(200).json({
//     status: 'success',
//     results: rows.length,
//     total,
//     currentPage: page,
//     totalPages: Math.ceil(total / limit),
//     data: {
//       products: rows,
//     },
//   });
// });

exports.getProductsByCategory = catchAsync(async (req, res, next) => {
  const { category } = req.params;
  // const cacheKey = `category:${category}:${JSON.stringify(req.query)}`;

  // Check if the result is cached
  // const cachedResult = await client.get(cacheKey);
  // if (cachedResult) {
  //   console.log('Serving from cache');
  //   return res.status(200).json({
  //     status: 'success',
  //     data: JSON.parse(cachedResult),
  //   });
  // }
  req.query.limit = Number(req.query.limit, 10) || 12;
  req.query.page = Number(req.query.page, 10) || 1;
  console.log(
    'Before limit and page',
    typeof req.query.limit,
    typeof req.query.page
  );

  const baseQuerySQL = `
 SELECT
  p.*,
  c.name AS category_name,
  u.name AS seller_name,
  u.photo AS seller_photo,
  ROUND(AVG(r.rating)::numeric, 1) AS ratings_average,
  COUNT(r.id) AS reviews_count
  FROM products p
  LEFT JOIN categories c ON p.category_id = c.id
  LEFT JOIN farmers f ON p.seller_id = f.id
  LEFT JOIN users u ON f.id = u.id
  LEFT JOIN reviews r ON p.id = r.product_id
  WHERE c.name ILIKE $1
  `;

  const features = new APIFeatures(baseQuerySQL, req.query)
    .filter()
    .groupBy(['name', 'price', 'verified', 'negotiate'])
    .sort()
    .paginate();

  const finalQuery = features.query;
  const queryValues = [`%${category}%`, ...features.queryParams];

  // console.log('Final Query:', finalQuery);
  // console.log('Query Values:', queryValues);
  // console.log(
  //   'Query Values Types:',
  //   features.queryParams.map((v) => `${v}:${typeof v}`)
  // );

  const { rows } = await pool.query(finalQuery, queryValues);

  let countQuerySQL = `
    SELECT COUNT(DISTINCT p.id) FROM products p
    JOIN categories c ON p.category_id = c.id
    WHERE c.name ILIKE $1
  `;

  const filterConditionsForCount = [];
  const filterParamsForCount = [];
  let countParamIndex = 1;

  if (req.query.verified === 'true')
    filterConditionsForCount.push(`p."verified" = true`);
  if (req.query.negotiable === 'true')
    filterConditionsForCount.push(`p.negotiable = true`);

  if (req.query.rating) {
    countParamIndex++;
    filterConditionsForCount.push(`p.ratings_average >= $${countParamIndex}`);
    filterParamsForCount.push(parseFloat(req.query.rating));
  }

  if (filterConditionsForCount.length > 0) {
    countQuerySQL += ` AND ${filterConditionsForCount.join(' AND ')}`;
  }

  const countValues = [`%${category}%`, ...filterParamsForCount];
  const countResult = await pool.query(countQuerySQL, countValues);

  const total = parseInt(countResult.rows[0].count, 10);
  const limit = parseInt(req.query.limit) || 10;
  const page = parseInt(req.query.page) || 1;

  const response = {
    status: 'success',
    results: rows.length,
    total,
    currentPage: page,
    totalPages: Math.ceil(total / limit),
    data: {
      products: rows,
    },
  };

  // Cache the result
  // client.setex(cacheKey, 3600, JSON.stringify(response));

  res.status(200).json(response);
});

exports.getProduct = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const productQuery = `
  SELECT 
    p.*, 
    c.name AS category_name, 
    u.name AS seller_name,
    u.photo AS seller_photo,
    COALESCE(
      json_agg(
        jsonb_build_object(
          'id', r.id,
          'rating', r.rating,
          'comment', r.comments,
          'user_id', r.consumer_id,
          'created_at', r.created_at,
          'user_name', ru.name,
          'user_image', ru.photo
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
  GROUP BY p.id, c.name, u.name, u.photo
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

exports.getMyFarmerProducts = catchAsync(async (req, res, next) => {
  const farmerId = req.user.id; // The logged-in farmer's ID

  const query = `
    SELECT
      id,
      name,
      price,
      stock_quantity,
      negotiate,
      description,
      key_highlights,
      min_qty,
      max_qty,
      created_at,
      verified,
      ratings_average,
      category_id
    FROM products
    WHERE seller_id = $1
    ORDER BY created_at DESC;
  `;
  // Ensure 'seller_id' in your 'products' table correctly references the farmer's user ID or a specific farmer ID.
  // Based on your schema: products.seller_id REFERENCES farmers(id)
  // And farmers.id REFERENCES users(id). So req.user.id should match farmers.id for the logged-in farmer.

  const { rows: products } = await pool.query(query, [farmerId]);

  res.status(200).json({
    status: 'success',
    results: products.length,
    data: {
      products,
    },
  });
});

exports.getCategories = catchAsync(async (req, res, next) => {
  const query = 'SELECT * FROM categories ORDER BY name';
  const { rows: categories } = await pool.query(query);

  res.status(200).json({
    status: 'success',
    results: categories.length,
    data: {
      categories,
    },
  });
});
