const express = require('express');
const cartController = require('../controller/cartController');
const authController = require('../controller/authController');
const checkoutController = require('../controller/checkoutController');

const router = express.Router();

router.use(authController.protect, authController.restrictTo('consumer'));

router.get('/', cartController.viewCart);

router.post('/', cartController.addToCart);

router.put('/:id', cartController.updateCartItem);

router.delete('/:id', cartController.removeFromCart);

router.post('/clear', cartController.clearCart);

router.post('/checkout', cartController.checkout);

router.post('/checkout-session', checkoutController.getCheckoutSession);

router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  checkoutController.handleWebhook
);

module.exports = router;
