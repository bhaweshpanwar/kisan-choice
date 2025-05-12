const express = require('express');
const userController = require('./../controller/userController');
const authController = require('./../controller/authController');

const router = express.Router();

router.post('/signup', authController.signup);
router.post('/login', authController.login);
router.get('/logout', authController.logout);

router.post('/forgotpassword', authController.forgotPassword);
router.patch('/resetPassword/:token', authController.resetPassword);

// Protect all routes after this middleware
router.use(authController.protect);

router.patch('/become-farmer', userController.becomeFarmer);

router.patch('/updatePassword', authController.updatePassword);
router.get('/me', authController.getMe, userController.getUser);
// router.patch(
//   '/updateMe',
//   userController.uploadUserPhoto,
//   userController.resizeUserPhoto,
//   userController.updateMe
// );
// router.delete('/deleteMe', userController.deleteMe);

// router.use(authController.restrictTo('admin'));

// router
//   .route('/')
//   .get(userController.getAllUsers)
//   .post(userController.createUser);

// router
//   .route('/:id')
//   .get(userController.getUser)
//   .patch(userController.updateUser)
//   .delete(userController.deleteUser);

// At the bottom of the file before module.exports

// Address Routes
router
  .route('/me/addresses')
  .get(userController.getMyAddresses)
  .post(userController.createAddress);

router
  .route('/me/addresses/:addressId')
  .put(userController.updateAddress)
  .delete(userController.deleteAddress);

module.exports = router;
