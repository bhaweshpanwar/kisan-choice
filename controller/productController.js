// Description: Handles all the product related routes
const pool = require('./../db/db');
const client = require('./../db/redis');
const catchAsync = require('../utils/catchAsync');
const APIFeatures = require('../utils/apiFeatures');
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

exports.searchProduct = catchAsync(async (req, res, next) => {});

exports.getProductsByCategory = catchAsync(async (req, res, next) => {});

exports.getProduct = catchAsync(async (req, res, next) => {});

exports.updateProduct = catchAsync(async (req, res, next) => {});

exports.deleteProduct = catchAsync(async (req, res, next) => {});
