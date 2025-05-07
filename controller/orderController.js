const express = require('express');
const pool = require('./../db/db');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// Helper function
const getUserCartItems = async (client, userId) => {
  const cartQuery = `
    SELECT ci.product_id, ci.quantity, p.price, p.seller_id as product_farmer_id
    FROM cart_items ci
    JOIN cart c ON ci.cart_id = c.id
    JOIN products p ON ci.product_id = p.id
    WHERE c.consumer_id = $1 AND ci.quantity > 0;
  `;
  const { rows: cartItems } = await client.query(cartQuery, [userId]);
  return cartItems;
};

exports.createOrderFromCart = catchAsync(async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const consumerId = req.user.id;
    const cartItems = await getUserCartItems(client, consumerId);

    if (cartItems.length === 0) {
      await client.query('ROLLBACK');
      client.release();
      return next(
        new AppError('Your cart is empty. Cannot create order.', 400)
      );
    }

    let totalPrice = 0;
    const farmerIdsInCart = new Set();

    cartItems.forEach((item) => {
      totalPrice += item.price * item.quantity;
      if (item.product_farmer_id) {
        farmerIdsInCart.add(item.product_farmer_id);
      }
    });

    let orderFarmerId = null;
    if (farmerIdsInCart.size === 1) {
      orderFarmerId = Array.from(farmerIdsInCart)[0];
    }

    const createOrderQuery = `
      INSERT INTO orders (consumer_id, farmer_id, total_price, payment_status, order_status)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;
    const orderValues = [
      consumerId,
      orderFarmerId,
      parseFloat(totalPrice.toFixed(2)),
      'pending',
      'pending',
    ];

    const { rows: newOrderRows } = await client.query(
      createOrderQuery,
      orderValues
    );
    const newOrder = newOrderRows[0];

    const orderItemPromises = cartItems.map((item) => {
      const createOrderItemQuery = `
        INSERT INTO order_items (order_id, product_id, quantity, price)
        VALUES ($1, $2, $3, $4);
      `;
      return client.query(createOrderItemQuery, [
        newOrder.id,
        item.product_id,
        item.quantity,
        parseFloat(Number(item.price).toFixed(2)),
      ]);
    });

    await Promise.all(orderItemPromises);

    // Clear the user's cart
    const cartIdQuery = 'SELECT id FROM cart WHERE consumer_id = $1';
    const { rows: cartRows } = await client.query(cartIdQuery, [consumerId]);
    if (cartRows.length > 0) {
      const cartId = cartRows[0].id;
      await client.query('DELETE FROM cart_items WHERE cart_id = $1', [cartId]);
    }

    await client.query('COMMIT');

    res.status(201).json({
      status: 'success',
      message: 'Order created successfully. Please proceed to payment.',
      data: {
        order: newOrder,
        items: cartItems,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

exports.getMyOrders = catchAsync(async (req, res, next) => {
  const client = await pool.connect();
  try {
    const consumerId = req.user.id;
    const query = `
      SELECT 
        o.id, o.total_price, o.payment_status, o.order_status, o.created_at, o.updated_at,
        (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) as item_count,
        (SELECT p.name FROM products p JOIN order_items oi ON p.id = oi.product_id WHERE oi.order_id = o.id LIMIT 1) as first_product_name -- Example
      FROM orders o
      WHERE o.consumer_id = $1
      ORDER BY o.created_at DESC;
    `;
    const { rows: orders } = await client.query(query, [consumerId]);

    res.status(200).json({
      status: 'success',
      results: orders.length,
      data: {
        orders,
      },
    });
  } catch (error) {
    next(error);
  } finally {
    client.release();
  }
});

exports.getMyOrderDetails = catchAsync(async (req, res, next) => {
  const client = await pool.connect();
  try {
    const consumerId = req.user.id;
    const orderId = req.params.id;

    const orderQuery = `
      SELECT * FROM orders WHERE id = $1 AND consumer_id = $2;
    `;
    const { rows: orderRows } = await client.query(orderQuery, [
      orderId,
      consumerId,
    ]);

    if (orderRows.length === 0) {
      return next(
        new AppError(
          'Order not found or you do not have permission to view it.',
          404
        )
      );
    }
    const order = orderRows[0];

    const orderItemsQuery = `
      SELECT oi.id, oi.quantity, oi.price, p.id as product_id, p.name as product_name 
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = $1;
    `;
    const { rows: orderItems } = await client.query(orderItemsQuery, [orderId]);
    order.items = orderItems;
    t;

    res.status(200).json({
      status: 'success',
      data: {
        order,
      },
    });
  } catch (error) {
    next(error);
  } finally {
    client.release();
  }
});

exports.cancelMyOrder = catchAsync(async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const consumerId = req.user.id;
    const orderId = req.params.id;

    // Fetch the order to check its current status
    const getOrderQuery =
      'SELECT * FROM orders WHERE id = $1 AND consumer_id = $2';
    const { rows: orderRows } = await client.query(getOrderQuery, [
      orderId,
      consumerId,
    ]);

    if (orderRows.length === 0) {
      return next(new AppError('Order not found or access denied.', 404));
    }
    const order = orderRows[0];

    // Business logic: e.g., can only cancel if 'pending' or 'processing' and payment not 'completed'
    if (
      order.order_status !==
      'pending' /* && order.order_status !== 'processing' */
    ) {
      // Or if payment is completed, it might need a refund process
      return next(
        new AppError(
          `Cannot cancel order. Current status: ${order.order_status}.`,
          400
        )
      );
    }
    if (order.payment_status === 'completed') {
      return next(
        new AppError(
          `Cannot cancel a fully paid order through this endpoint. Please request a refund.`,
          400
        )
      );
    }

    const updateQuery = `
      UPDATE orders
      SET order_status = 'cancelled', updated_at = NOW()
      WHERE id = $1 AND consumer_id = $2
      RETURNING *;
    `;
    const { rows: updatedOrderRows } = await client.query(updateQuery, [
      orderId,
      consumerId,
    ]);

    if (updatedOrderRows.length === 0) {
      // Should not happen if previous check passed, but good for safety
      throw new AppError('Failed to update order status.', 500);
    }

    await client.query('COMMIT');
    res.status(200).json({
      status: 'success',
      message: 'Order cancelled successfully.',
      data: {
        order: updatedOrderRows[0],
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// --- FARMER CONTROLLERS ---

exports.getFarmerOrders = catchAsync(async (req, res, next) => {
  const client = await pool.connect();
  try {
    const farmerId = req.user.id;

    const query = `
      SELECT o.id, o.consumer_id, u.name as consumer_name, u.email as consumer_email,
             o.total_price, o.payment_status, o.order_status, o.created_at
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      JOIN products p ON oi.product_id = p.id
      JOIN users u ON o.consumer_id = u.id
      WHERE p.seller_id = $1
      GROUP BY o.id, u.name, u.email, o.total_price, o.payment_status, o.order_status, o.created_at
      ORDER BY o.created_at DESC;
    `;

    const { rows: orders } = await client.query(query, [farmerId]);

    res.status(200).json({
      status: 'success',
      results: orders.length,
      data: {
        orders,
      },
    });
  } catch (error) {
    next(error);
  } finally {
    client.release();
  }
});

exports.getFarmerOrderDetails = catchAsync(async (req, res, next) => {
  const client = await pool.connect();
  try {
    const farmerId = req.user.id;
    const orderId = req.params.id;

    // Verify this order actually contains items from this farmer
    const checkFarmerProductQuery = `
      SELECT 1 FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = $1 AND p.seller_id = $2
      LIMIT 1;
    `;
    const { rows: checkRows } = await client.query(checkFarmerProductQuery, [
      orderId,
      farmerId,
    ]);

    if (checkRows.length === 0) {
      return next(
        new AppError(
          'Order not found or you do not have items in this order.',
          404
        )
      );
    }

    // Fetch order details
    const orderQuery = `
      SELECT o.*, u.name as consumer_name, u.email as consumer_email, u.mobile as consumer_phone
      FROM orders o
      JOIN users u ON o.consumer_id = u.id
      WHERE o.id = $1;
    `;
    const { rows: orderRows } = await client.query(orderQuery, [orderId]);

    if (orderRows.length === 0) {
      return next(new AppError('Order not found.', 404));
    }

    const order = orderRows[0];

    // Fetch only the order items that belong to this farmer for this order
    const orderItemsQuery = `
      SELECT oi.id as order_item_id, oi.quantity, oi.price,
             p.id as product_id, p.name as product_name
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = $1 AND p.seller_id = $2;
    `;
    const { rows: orderItems } = await client.query(orderItemsQuery, [
      orderId,
      farmerId,
    ]);

    order.items = orderItems;

    res.status(200).json({
      status: 'success',
      data: {
        order,
      },
    });
  } catch (error) {
    next(error);
  } finally {
    client.release();
  }
});

exports.updateFarmerOrderStatus = catchAsync(async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const farmerId = req.user.id;
    const orderId = req.params.id;
    const { new_status } = req.body;

    if (
      !new_status ||
      ![
        'pending',
        'processing',
        'shipped',
        'delivered',
        'cancelled_by_farmer',
      ].includes(new_status)
    ) {
      return next(new AppError('Invalid or missing new_status.', 400));
    }

    const checkOrderQuery = `
            SELECT o.id, o.farmer_id as order_main_farmer_id
            FROM orders o
            WHERE o.id = $1
        `;
    const { rows: orderCheckRows } = await client.query(checkOrderQuery, [
      orderId,
    ]);

    if (orderCheckRows.length === 0) {
      return next(new AppError('Order not found.', 404));
    }

    const orderData = orderCheckRows[0];
    let canUpdate = false;

    if (orderData.order_main_farmer_id === farmerId) {
      canUpdate = true;
    } else {
      const checkFarmerProductQuery = `
                SELECT 1 FROM order_items oi
                JOIN products p ON oi.product_id = p.id
                WHERE oi.order_id = $1 AND p.farmer_id = $2
                LIMIT 1;
            `;
      const { rows: checkRows } = await client.query(checkFarmerProductQuery, [
        orderId,
        farmerId,
      ]);
      if (checkRows.length > 0) {
        canUpdate = true;
      }
    }

    if (!canUpdate) {
      return next(
        new AppError(
          'You are not authorized to update this order status or it does not contain your products.',
          403
        )
      );
    }

    const updateQuery = `
            UPDATE orders
            SET order_status = $1, updated_at = NOW()
            WHERE id = $2
            RETURNING *;
        `;
    const { rows: updatedOrderRows } = await client.query(updateQuery, [
      new_status,
      orderId,
    ]);

    await client.query('COMMIT');
    res.status(200).json({
      status: 'success',
      message: `Order status updated to ${new_status}.`,
      data: {
        order: updatedOrderRows[0],
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// --- ADMIN CONTROLLERS

exports.getAllOrdersAdmin = catchAsync(async (req, res, next) => {
  const client = await pool.connect();
  try {
    const query = `
      SELECT o.id AS order_id, o.consumer_id, o.farmer_id, o.total_price, o.payment_status, o.order_status, o.created_at,
             u.name AS consumer_name, f.name AS farmer_name
      FROM orders o
      LEFT JOIN users u ON o.consumer_id = u.id
      LEFT JOIN users f ON o.farmer_id = f.id
      ORDER BY o.created_at DESC;
    `;

    const { rows: orders } = await client.query(query);

    res.status(200).json({
      status: 'success',
      results: orders.length,
      data: {
        orders,
      },
    });
  } catch (err) {
    next(err);
  } finally {
    client.release();
  }
});

exports.getOrderDetailsAdmin = catchAsync(async (req, res, next) => {
  const client = await pool.connect();
  const orderId = req.params.id;

  try {
    const orderQuery = `
      SELECT o.*, u.name AS consumer_name, f.name AS farmer_name
      FROM orders o
      LEFT JOIN users u ON o.consumer_id = u.id
      LEFT JOIN users f ON o.farmer_id = f.id
      WHERE o.id = $1;
    `;
    const { rows: orderRows } = await client.query(orderQuery, [orderId]);

    if (orderRows.length === 0) {
      return next(new AppError('Order not found', 404));
    }

    const order = orderRows[0];

    const itemsQuery = `
      SELECT oi.*, p.name AS product_name
      FROM order_items oi
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = $1;
    `;
    const { rows: items } = await client.query(itemsQuery, [orderId]);

    res.status(200).json({
      status: 'success',
      data: {
        order,
        items,
      },
    });
  } catch (err) {
    next(err);
  } finally {
    client.release();
  }
});

exports.updateOrderStatusAdmin = catchAsync(async (req, res, next) => {
  const client = await pool.connect();
  const orderId = req.params.id;
  const { order_status, payment_status } = req.body;

  try {
    const updateQuery = `
      UPDATE orders
      SET order_status = COALESCE($1, order_status),
          payment_status = COALESCE($2, payment_status)
      WHERE id = $3
      RETURNING *;
    `;
    const values = [order_status, payment_status, orderId];

    const { rows } = await client.query(updateQuery, values);

    if (rows.length === 0) {
      return next(new AppError('Order not found or not updated', 404));
    }

    res.status(200).json({
      status: 'success',
      message: 'Order status updated successfully.',
      data: {
        order: rows[0],
      },
    });
  } catch (err) {
    next(err);
  } finally {
    client.release();
  }
});
