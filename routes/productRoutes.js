const express = require('express');
const productController = require('../controller/productController');
const authController = require('../controller/authController');

const router = express.Router();

// Authentication required for viewing products
router.use(authController.protect);

// Get all products (cached)
router
  .route('/')
  .get(authController.restrictTo('admin'), productController.getAllProducts);

// Create a product (Only admin & farmers)
router.post(
  '/',
  authController.restrictTo('admin', 'farmer'),
  productController.createProduct
);

// Search products (cached)
router.route('/search').get(productController.searchProduct);

// Get products by category (cached)
router
  .route('/category/:category')
  .get(productController.getProductsByCategory);

// Get a specific product by ID (cached)
router.route('/:id').get(productController.getProduct);

// Update product (Only admin & farmers)
router.patch(
  '/:id',
  authController.restrictTo('admin', 'farmer'),
  productController.updateProduct
);

// Delete product (Only admin & farmers)
router.delete(
  '/:id',
  authController.restrictTo('admin', 'farmer'),
  productController.deleteProduct
);

module.exports = router;
