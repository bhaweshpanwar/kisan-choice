const express = require('express');

const negotiationController = require('../controller/negotiationController');
const authController = require('../controller/authController');

const router = express.Router();
// All routes below are protected (user must be logged in)
router.use(authController.protect);

//Consumer Sends an Offer
router.post(
  '/',
  authController.restrictTo('consumer'),
  negotiationController.sendOffer
);

// Farmer Accepts an Offer
router.patch(
  '/accept/:offerId',
  authController.restrictTo('farmer'),
  negotiationController.acceptOffer
);

// Farmer Rejects an Offer
router.patch(
  '/reject/:offerId',
  authController.restrictTo('farmer'),
  negotiationController.rejectOffer
);

// Farmer gets all the offers that has been sent to him
router.get(
  '/farmer',
  authController.restrictTo('farmer'),
  negotiationController.getFarmerOffers
);

// Consumer gets all the offers that he has sent
router.get(
  '/consumer',
  authController.restrictTo('consumer'),
  negotiationController.getConsumerOffers
);

module.exports = router;
