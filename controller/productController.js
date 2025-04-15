// Description: Handles all the product related routes
const pool = require('./../db/db');
const client = require('./../db/redis');
const catchAsync = require('../utils/catchAsync');

exports.getAllProducts = catchAsync(async (req, res, next) => {
  //what we want
  //first to check that exact result is available in cache or not
  //if yes then send the result
  //a big base query
  //then API features like sort , pagination etc.
  //redis caching
  //sending the result

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
});

exports.createProduct = catchAsync(async (req, res, next) => {});

exports.searchProduct = catchAsync(async (req, res, next) => {});

exports.getProductsByCategory = catchAsync(async (req, res, next) => {});

exports.getProduct = catchAsync(async (req, res, next) => {});

exports.updateProduct = catchAsync(async (req, res, next) => {});

exports.deleteProduct = catchAsync(async (req, res, next) => {});
