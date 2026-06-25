const express = require('express');
const productController = require('../controller/productController');
const authController = require('../controller/authController');

const router = express.Router();

router.get(
  '/my-products',
  authController.protect,
  authController.restrictTo('farmer'),
  productController.getMyFarmerProducts
);

router.get('/search', productController.searchProduct);

router.get('/category/:category', productController.getProductsByCategory);

router.get('/:id', productController.getProduct);

router.use(authController.protect);

router
  .route('/')
  .get(authController.restrictTo('admin'), productController.getAllProducts);

router.post(
  '/',
  authController.restrictTo('admin', 'farmer'),
  productController.createProduct
);

router.patch(
  '/:id',
  authController.restrictTo('admin', 'farmer'),
  productController.updateProduct
);

router.delete(
  '/:id',
  authController.restrictTo('admin', 'farmer'),
  productController.deleteProduct
);

module.exports = router;
