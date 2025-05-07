const express = require('express');
const blockController = require('../controller/blockController');
const authController = require('../controller/authController');

const router = express.Router();

router.use(authController.protect);

//Farmer blocks a consumer
router.post(
  '/user/:consumerId',
  authController.restrictTo('farmer'),
  blockController.blockUser
);

//Famrer unblocks a consumer
router.delete(
  '/user/:consumerId',
  authController.restrictTo('farmer'),
  blockController.unblockUser
);

// Farmer gets a list of users they have blocked
router.get(
  '/my-blocked-users',
  authController.restrictTo('farmer'),
  blockController.getMyBlockedUsers
);

// Consumer checks if they are blocked by a specific farmer (mainly for frontend info)
// This can also be implicitly checked when trying to send an offer.
// router.get(
//     '/is-blocked-by/:farmerId',
//     authController.restrictTo('consumer'),
//     blockController.checkIfBlockedByFarmer
//   );

module.exports = router;
