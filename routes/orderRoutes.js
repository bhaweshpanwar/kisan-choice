const express = require('express');
const orderController = require('../controller/orderController');
const authController = require('../controller/authController');
// const checkoutController = require('../controller/checkoutController'); // If you move checkout session here

const router = express.Router();

// All routes below are protected (user must be logged in)
router.use(authController.protect);

// -----------------------------
// CONSUMER-FACING ROUTES
// -----------------------------
router.post(
  '/',
  authController.restrictTo('consumer'),
  orderController.createOrderFromCart
);

router.get(
  '/',
  authController.restrictTo('consumer'),
  orderController.getMyOrders
);

router.get(
  '/:id',
  authController.restrictTo('consumer'),
  orderController.getMyOrderDetails
);

router.patch(
  '/:id/cancel',
  authController.restrictTo('consumer'),
  orderController.cancelMyOrder
);

// Example: If you want to update address (simplified)
// router.patch(
//   '/:id/update-address',
//   authController.restrictTo('consumer'),
//   orderController.updateOrderAddress
// );

// -----------------------------
// FARMER-FACING ROUTES
// -----------------------------
router.get(
  '/farmer/my-sales', // Or a more descriptive path like /farmer/my-sales
  authController.restrictTo('farmer'),
  orderController.getFarmerOrders
);

router.get(
  '/farmer/:id', // :id here is the order_id
  authController.restrictTo('farmer'),
  orderController.getFarmerOrderDetails
);

router.patch(
  '/farmer/:id/status', // :id here is the order_id
  authController.restrictTo('farmer'),
  orderController.updateFarmerOrderStatus
);

// -----------------------------
// ADMIN-FACING ROUTES
// -----------------------------
router.get(
  '/admin/all', // Differentiate from consumer GET /
  authController.restrictTo('admin'),
  orderController.getAllOrdersAdmin
);

router.get(
  '/admin/:id', // :id here is the order_id
  authController.restrictTo('admin'),
  orderController.getOrderDetailsAdmin
);

router.patch(
  '/admin/:id/status', // :id here is the order_id
  authController.restrictTo('admin'),
  orderController.updateOrderStatusAdmin
);

// DELETE /api/v1/admin/orders/:id → Delete an order (only if necessary).
// router.delete(
//   '/admin/:id',
//   authController.restrictTo('admin'),
//   orderController.deleteOrderAdmin
// );

module.exports = router;
