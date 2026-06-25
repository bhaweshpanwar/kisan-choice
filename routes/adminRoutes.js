// Admin route — gated by CRON_SECRET so only your scheduler can call it.
// Use cron-job.org (free) to ping these URLs daily at 00:00 UTC.
// This is what keeps crons alive on Render's free tier, where the web
// service sleeps after 15 min of inactivity and in-process node-cron
// won't reliably fire.

const express = require('express');
const catchAsync = require('../utils/catchAsync');
const orderScheduler = require('../utils/orderScheduler');
const cartCleaner = require('../utils/cartCleaner');

const router = express.Router();

const requireCronSecret = (req, res, next) => {
  const headerSecret =
    req.header('x-cron-secret') || req.query.secret;
  if (
    !process.env.CRON_SECRET ||
    headerSecret !== process.env.CRON_SECRET
  ) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }
  next();
};

router.post(
  '/orders-tick',
  requireCronSecret,
  catchAsync(async (req, res) => {
    const result = await orderScheduler.updateOrdersToDelivered();
    res.status(200).json({ status: 'success', ...result });
  })
);

router.post(
  '/cart-tick',
  requireCronSecret,
  catchAsync(async (req, res) => {
    const result = await cartCleaner.expireAcceptedOffers();
    res.status(200).json({ status: 'success', ...result });
  })
);

module.exports = router;