const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const Review = require('./../model/reviewModel');

exports.getAllReviews = catchAsync(async (req, res, next) => {
  const reviews = await Review.findAll();
  res.status(200).json({
    status: 'success',
    results: reviews.length,
    data: {
      reviews,
    },
  });
});

exports.getReview = catchAsync(async (req, res, next) => {
  const review = await Review.findById(req.params.id);
  if (!review) {
    return next(new AppError('No review found with that ID', 404));
  }
  res.status(200).json({
    status: 'success',
    data: {
      review,
    },
  });
});

exports.createReview = catchAsync(async (req, res, next) => {
  const { productId, reviewText, rating } = req.body;

  const hasPurchased = await Order.findOne({
    where: { userId: req.user.id, productId },
  });

  if (!hasPurchased) {
    return next(
      new AppError(
        'You can only write a review for products you have purchased.',
        403
      )
    );
  }

  const review = await Review.create({
    userId: req.user.id,
    productId,
    reviewText,
    rating,
  });

  res.status(201).json({
    status: 'success',
    data: {
      review,
    },
  });
});

exports.getReviewsByProduct = catchAsync(async (req, res, next) => {
  const { productId } = req.params;

  const reviews = await Review.findByProduct(productId);
  if (reviews.length === 0) {
    return next(new AppError('No reviews found for this product.', 404));
  }

  res.status(200).json({
    status: 'success',
    results: reviews.length,
    data: {
      reviews,
    },
  });
});

exports.updateReview = catchAsync(async (req, res, next) => {
  const review = await Review.update(req.body, {
    where: { id: req.params.id, userId: req.user.id },
    returning: true,
  });

  if (!review[1][0]) {
    return next(
      new AppError(
        'No review found with that ID or you are not authorized.',
        404
      )
    );
  }

  res.status(200).json({
    status: 'success',
    data: {
      review: review[1][0],
    },
  });
});

exports.deleteReview = catchAsync(async (req, res, next) => {
  const review = await Review.destroy({
    where: { id: req.params.id, userId: req.user.id },
  });

  if (!review) {
    return next(
      new AppError(
        'No review found with that ID or you are not authorized.',
        404
      )
    );
  }

  res.status(204).json({
    status: 'success',
    data: null,
  });
});
