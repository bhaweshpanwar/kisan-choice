const express = require('express');
const reviewController = require('./../controller/reviewController');
const authController = require('./../controller/authController');

const router = express.Router({ mergeParams: true });

router.use(authController.protect);

router
  .route('/')
  .get(authController.restrictTo('admin'), reviewController.getAllReviews);

router
  .route('/:id')
  .get(authController.restrictTo('admin'), reviewController.getReview);

router
  .route('/product/:productId')
  .get(
    authController.restrictTo('consumer', 'admin'),
    reviewController.getReviewsByProduct
  );

router
  .route('/')
  .post(authController.restrictTo('consumer'), reviewController.createReview);

router
  .route('/:id')
  .patch(
    authController.restrictTo('admin', 'consumer'),
    reviewController.updateReview
  )
  .delete(
    authController.restrictTo('admin', 'consumer'),
    reviewController.deleteReview
  );

module.exports = router;
