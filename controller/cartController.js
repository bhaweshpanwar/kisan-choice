/*Functions Summary

viewCart: Fetch all cart items for the user.
addToCart: Add a product to the cart (default to min_qty if no quantity is specified).
updateCartItem: Update the quantity of an existing cart item.
removeFromCart: Remove a specific item from the cart.
clearCart: Remove all items from the cart.
checkout: Validate cart and create an order, capturing delivery details.
handleStripeWebhook: Process Stripe webhook events to update payment statuses.*/

const pool = require('./../db/db');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// exports.viewCart = catchAsync(async (req, res, next) => {
//   const userId = req.user.id;

//   const query = `
//     SELECT
//       ci.id AS cart_item_id,
//       ci.quantity,
//       ci.quantity * p.price AS total_price,
//       p.id AS product_id,
//       p.name AS product_name,
//       p.price AS product_price,
//       p.description AS product_description,
//       p.min_qty,
//       p.max_qty,
//       p.ratings_average,
//       u.id AS seller_id,
//       u.name AS seller_name,
//       u.photo AS seller_photo
//     FROM cart_items ci
//     JOIN cart c ON ci.cart_id = c.id
//     JOIN products p ON ci.product_id = p.id
//     JOIN users u ON p.seller_id = u.id
//     WHERE c.consumer_id = $1
//   `;

//   const { rows } = await pool.query(query, [userId]);

//   res.status(200).json({
//     status: 'success',
//     results: rows.length,
//     data: {
//       cart: rows,
//     },
//   });
// });

exports.viewCart = catchAsync(async (req, res, next) => {
  const userId = req.user.id;

  const query = `
    SELECT
      ci.id AS cart_item_id,
      ci.quantity,
      ci.is_negotiated,
      ci.quantity_fixed,
      ci.negotiated_price_per_unit,
      p.id AS product_id,
      p.name AS product_name,
      p.description AS product_description,
      p.min_qty,
      p.max_qty,
      p.ratings_average,
      p.seller_id AS seller_id, 
      f.name AS seller_name
    FROM cart_items ci
    JOIN cart c ON ci.cart_id = c.id 
    JOIN products p ON ci.product_id = p.id
    JOIN users f ON p.seller_id = f.id 
    WHERE c.consumer_id = $1
  `;

  const { rows } = await pool.query(query, [userId]);

  const cartItems = rows.map((item) => ({
    ...item,

    product_price:
      item.is_negotiated && item.negotiated_price_per_unit !== null
        ? parseFloat(item.negotiated_price_per_unit)
        : parseFloat(item.product_price_from_products_table),
    total_item_price:
      item.is_negotiated && item.negotiated_price_per_unit !== null
        ? item.quantity * parseFloat(item.negotiated_price_per_unit)
        : item.quantity * parseFloat(item.product_price_from_products_table),
  }));

  const correctedViewCartQuery = `
    SELECT
      ci.id AS cart_item_id,
      ci.quantity,
      ci.is_negotiated,
      ci.quantity_fixed,
      ci.negotiated_price_per_unit,
      p.id AS product_id,
      p.name AS product_name,
      p.price AS original_product_price, -- Get original price for reference
      p.description AS product_description,
      p.min_qty,
      p.max_qty,
      p.ratings_average,
      p.seller_id AS seller_id,
      f.name AS seller_name
    FROM cart_items ci
    JOIN cart c ON ci.cart_id = c.id
    JOIN products p ON ci.product_id = p.id
    JOIN users f ON p.seller_id = f.id
    WHERE c.consumer_id = $1
  `;

  const { rows: cartData } = await pool.query(correctedViewCartQuery, [userId]);

  let overallTotalPrice = 0;
  const processedCartItems = cartData.map((item) => {
    const effectivePrice =
      item.is_negotiated && item.negotiated_price_per_unit
        ? parseFloat(item.negotiated_price_per_unit)
        : parseFloat(item.original_product_price);
    const totalItemPrice = item.quantity * effectivePrice;
    overallTotalPrice += totalItemPrice;

    return {
      cart_item_id: item.cart_item_id,
      product_id: item.product_id,
      product_name: item.product_name,
      product_description: item.product_description,
      image_cover: item.image_cover,
      seller_id: item.seller_id,
      seller_name: item.seller_name,
      quantity: item.quantity,
      is_negotiated: item.is_negotiated,
      quantity_fixed: item.quantity_fixed,
      price_per_unit: effectivePrice,
      original_product_price: parseFloat(item.original_product_price),
      total_item_price: totalItemPrice,
      min_qty: item.min_qty,
      max_qty: item.max_qty,
    };
  });

  res.status(200).json({
    status: 'success',
    results: processedCartItems.length,
    data: {
      cart: processedCartItems,
      overall_total_price: overallTotalPrice,
    },
  });
});

// exports.addToCart = catchAsync(async (req, res, next) => {
//   const client = await pool.connect();
//   try {
//     await client.query('BEGIN');

//     const userId = req.user.id;
//     const productId = req.body.product_id;
//     const quantity = req.body.quantity || 1;

//     // Check if product exists
//     const checkProductQuery = `
//       SELECT * FROM products WHERE id = $1
//     `;
//     const { rows: productRows } = await client.query(checkProductQuery, [
//       productId,
//     ]);

//     if (productRows.length === 0) {
//       throw new AppError('Product not found', 404);
//     }

//     const product = productRows[0];

//     // Validate quantity against min and max limits
//     if (quantity < product.min_qty || quantity > product.max_qty) {
//       throw new AppError(
//         `Quantity must be between ${product.min_qty} and ${product.max_qty}`,
//         400
//       );
//     }

//     // Check if user's cart exists
//     const checkCartQuery = `
//       SELECT * FROM cart WHERE consumer_id = $1
//     `;
//     const { rows: cartRows } = await client.query(checkCartQuery, [userId]);

//     let cartId;
//     if (cartRows.length === 0) {
//       // Create a new cart for the user
//       const createCartQuery = `
//         INSERT INTO cart (consumer_id) VALUES ($1) RETURNING id
//       `;
//       const { rows: newCartRows } = await client.query(createCartQuery, [
//         userId,
//       ]);
//       cartId = newCartRows[0].id;
//     } else {
//       cartId = cartRows[0].id;
//     }

//     // Check if product already exists in the cart
//     const checkCartItemQuery = `
//       SELECT * FROM cart_items WHERE cart_id = $1 AND product_id = $2
//     `;
//     const { rows: cartItemRows } = await client.query(checkCartItemQuery, [
//       cartId,
//       productId,
//     ]);

//     let cartItem;
//     if (cartItemRows.length > 0) {
//       // Update existing cart item quantity
//       const updateCartItemQuery = `
//         UPDATE cart_items
//         SET quantity = quantity + $1
//         WHERE id = $2
//         RETURNING *
//       `;
//       const { rows: updatedCartItemRows } = await client.query(
//         updateCartItemQuery,
//         [quantity, cartItemRows[0].id]
//       );
//       cartItem = updatedCartItemRows[0];
//     } else {
//       // Add new product to the cart
//       const addToCartQuery = `
//         INSERT INTO cart_items (cart_id, product_id, quantity)
//         VALUES ($1, $2, $3)
//         RETURNING *
//       `;
//       const { rows: newCartItemRows } = await client.query(addToCartQuery, [
//         cartId,
//         productId,
//         quantity,
//       ]);
//       cartItem = newCartItemRows[0];
//     }

//     await client.query('COMMIT');

//     res.status(201).json({
//       status: 'success',
//       message: 'Product added to cart successfully',
//       data: {
//         cart_item: {
//           id: cartItem.id,
//           cart_id: cartItem.cart_id,
//           product_id: cartItem.product_id,
//           quantity: cartItem.quantity,
//           total_price: cartItem.quantity * product.price,
//           product_details: {
//             name: product.name,
//             price: product.price,
//             image: product.image,
//             description: product.description,
//             seller_id: product.seller_id,
//           },
//         },
//       },
//     });
//   } catch (error) {
//     await client.query('ROLLBACK');
//     next(error);
//   } finally {
//     client.release();
//   }
// });

exports.addToCart = catchAsync(async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userId = req.user.id;
    const { product_id, quantity: requestedQuantity } = req.body;

    if (!product_id) {
      return next(new AppError('Product ID is required.', 400));
    }

    const productRes = await client.query(
      'SELECT id, name, price, min_qty, max_qty, stock_quantity, seller_id, negotiate FROM products WHERE id = $1',
      [product_id]
    );

    if (productRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return next(new AppError('Product not found.', 404));
    }
    const product = productRes.rows[0];
    const quantity =
      requestedQuantity === undefined
        ? product.min_qty
        : parseInt(requestedQuantity, 10);

    if (isNaN(quantity) || quantity <= 0) {
      await client.query('ROLLBACK');
      return next(new AppError('Quantity must be a positive number.', 400));
    }
    if (quantity < product.min_qty || quantity > product.max_qty) {
      await client.query('ROLLBACK');
      return next(
        new AppError(
          `Quantity must be between ${product.min_qty} and ${product.max_qty} for this product.`,
          400
        )
      );
    }
    if (quantity > product.stock_quantity) {
      await client.query('ROLLBACK');
      return next(
        new AppError(
          `Insufficient stock. Only ${product.stock_quantity} available.`,
          400
        )
      );
    }

    // Get or create cart
    let cartRes = await client.query(
      'SELECT id FROM cart WHERE consumer_id = $1',
      [userId]
    );
    let cartId;
    if (cartRes.rowCount === 0) {
      cartRes = await client.query(
        'INSERT INTO cart ( consumer_id) VALUES ($1, $2) RETURNING id',
        [userId]
      );
    }
    cartId = cartRes.rows[0].id;

    const existingItemRes = await client.query(
      'SELECT id, quantity, is_negotiated, quantity_fixed FROM cart_items WHERE cart_id = $1 AND product_id = $2',
      [cartId, product_id]
    );

    let cartItem;
    let message = 'Product added to cart successfully.';

    if (existingItemRes.rowCount > 0) {
      const existingItem = existingItemRes.rows[0];
      if (existingItem.is_negotiated && existingItem.quantity_fixed) {
        // A fixed negotiated item exists. Do not allow adding another non-negotiated version or updating it here.
        await client.query('ROLLBACK');
        return next(
          new AppError(
            'This product is already in your cart as a fixed negotiated item. Please complete that purchase or contact support.',
            400
          )
        );
      } else if (!existingItem.is_negotiated) {
        // Non-negotiated item exists, update its quantity
        const newQuantity = existingItem.quantity + quantity;
        if (newQuantity > product.max_qty) {
          await client.query('ROLLBACK');
          return next(
            new AppError(
              `Adding this quantity would exceed the maximum allowed (${product.max_qty}). Current in cart: ${existingItem.quantity}`,
              400
            )
          );
        }
        if (newQuantity > product.stock_quantity) {
          await client.query('ROLLBACK');
          return next(
            new AppError(
              `Insufficient stock. Only ${product.stock_quantity} available. Current in cart: ${existingItem.quantity}`,
              400
            )
          );
        }

        const updateRes = await client.query(
          'UPDATE cart_items SET quantity = $1 WHERE id = $2 RETURNING *',
          [newQuantity, existingItem.id]
        );
        cartItem = updateRes.rows[0];
        message = 'Cart item quantity updated.';
      } else {
        // This case should ideally not happen if logic is correct: a negotiated item that is not quantity_fixed.
        // For safety, treat as an error or decide on specific handling.
        await client.query('ROLLBACK');
        return next(
          new AppError(
            'An unexpected issue occurred with an existing negotiated item in your cart.',
            500
          )
        );
      }
    } else {
      // Add new (non-negotiated) item to the cart
      const newItemRes = await client.query(
        `INSERT INTO cart_items (cart_id, product_id, quantity, price_per_unit, is_negotiated, quantity_fixed)
         VALUES ($1, $2, $3, $4, FALSE, FALSE) RETURNING *`,
        [cartId, product_id, quantity, product.price]
      );
      cartItem = newItemRes.rows[0];
    }

    await client.query('COMMIT');
    res.status(201).json({
      status: 'success',
      message,
      data: {
        cart_item: {
          id: cartItem.id,
          product_id: cartItem.product_id,
          product_name: product.name,
          quantity: cartItem.quantity,
          price_per_unit: parseFloat(product.price),
          is_negotiated: cartItem.is_negotiated,
          quantity_fixed: cartItem.quantity_fixed,
          total_item_price: cartItem.quantity * parseFloat(product.price),
        },
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// exports.updateCartItem = catchAsync(async (req, res, next) => {
//   const client = await pool.connect();
//   try {
//     await client.query('BEGIN');

//     const userId = req.user.id;
//     const cartItemId = req.params.id;
//     const quantity = req.body.quantity;

//     if (!quantity) {
//       throw new AppError('Quantity is required', 400);
//     }

//     // Check if the cart item exists and belongs to the user
//     const checkCartItemQuery = `
//       SELECT ci.*, c.consumer_id
//       FROM cart_items ci
//       JOIN cart c ON ci.cart_id = c.id
//       WHERE ci.id = $1 AND c.consumer_id = $2
//     `;
//     const { rows: cartItemRows } = await client.query(checkCartItemQuery, [
//       cartItemId,
//       userId,
//     ]);

//     if (cartItemRows.length === 0) {
//       throw new AppError('Cart item not found', 404);
//     }

//     const cartItem = cartItemRows[0];
//     const productId = cartItem.product_id;

//     // Check if the product exists
//     const checkProductQuery = `
//       SELECT * FROM products WHERE id = $1
//     `;
//     const { rows: productRows } = await client.query(checkProductQuery, [
//       productId,
//     ]);

//     if (productRows.length === 0) {
//       throw new AppError('Product not found', 404);
//     }

//     const product = productRows[0];

//     // Validate the quantity
//     if (quantity < product.min_qty || quantity > product.max_qty) {
//       throw new AppError(
//         `Quantity must be between ${product.min_qty} and ${product.max_qty}`,
//         400
//       );
//     }

//     // Update the cart item
//     const updateCartItemQuery = `
//       UPDATE cart_items SET quantity = $1 WHERE id = $2 RETURNING *
//     `;
//     const { rows: updatedCartItemRows } = await client.query(
//       updateCartItemQuery,
//       [quantity, cartItemId]
//     );
//     const updatedCartItem = updatedCartItemRows[0];

//     await client.query('COMMIT');

//     res.status(200).json({
//       status: 'success',
//       message: 'Cart item updated successfully',
//       data: {
//         cart_item: {
//           id: updatedCartItem.id,
//           cart_id: updatedCartItem.cart_id,
//           product_id: updatedCartItem.product_id,
//           quantity: updatedCartItem.quantity,
//           total_price: updatedCartItem.quantity * product.price,
//           product_details: {
//             name: product.name,
//             price: product.price,
//             image: product.image,
//             description: product.description,
//           },
//         },
//       },
//     });
//   } catch (error) {
//     await client.query('ROLLBACK');
//     next(error);
//   } finally {
//     client.release();
//   }
// });

exports.updateCartItem = catchAsync(async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userId = req.user.id;
    const { id: cartItemId } = req.params; // UUID of the cart item
    const { quantity: newQuantity } = req.body;

    if (newQuantity === undefined) {
      await client.query('ROLLBACK');
      return next(new AppError('Quantity is required for update.', 400));
    }

    const numNewQuantity = parseInt(newQuantity, 10);
    if (isNaN(numNewQuantity) || numNewQuantity <= 0) {
      await client.query('ROLLBACK');
      return next(new AppError('Quantity must be a positive number.', 400));
    }

    const cartItemRes = await client.query(
      `SELECT ci.id, ci.product_id, ci.quantity, ci.is_negotiated, ci.quantity_fixed, ci.negotiated_price_per_unit,
              p.price AS original_product_price, p.name AS product_name, p.min_qty, p.max_qty, p.stock_quantity
       FROM cart_items ci
       JOIN cart c ON ci.cart_id = c.id
       JOIN products p ON ci.product_id = p.id
       WHERE ci.id = $1 AND c.consumer_id = $2`,
      [cartItemId, userId]
    );

    // console.log('Cart Item ID:', cartItemId);
    // console.log('User ID:', userId);

    if (cartItemRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return next(
        new AppError('Cart item not found or does not belong to you.', 404)
      );
    }

    const cartItem = cartItemRes.rows[0];

    // Prevent quantity update if it's a fixed quantity (negotiated deal)
    if (cartItem.quantity_fixed) {
      await client.query('ROLLBACK');
      return next(
        new AppError(
          'This item has a fixed quantity from a negotiation and cannot be changed.',
          400
        )
      );
    }

    // Validate quantity against product constraints
    if (
      numNewQuantity < cartItem.min_qty ||
      numNewQuantity > cartItem.max_qty
    ) {
      await client.query('ROLLBACK');
      return next(
        new AppError(
          `Quantity must be between ${cartItem.min_qty} and ${cartItem.max_qty}.`,
          400
        )
      );
    }

    if (numNewQuantity > cartItem.stock_quantity) {
      await client.query('ROLLBACK');
      return next(
        new AppError(
          `Insufficient stock. Only ${cartItem.stock_quantity} available.`,
          400
        )
      );
    }

    const updatedItemRes = await client.query(
      'UPDATE cart_items SET quantity = $1 WHERE id = $2 RETURNING *',
      [numNewQuantity, cartItemId]
    );
    const updatedCartItem = updatedItemRes.rows[0];

    const effectivePrice =
      updatedCartItem.is_negotiated && updatedCartItem.negotiated_price_per_unit
        ? parseFloat(updatedCartItem.negotiated_price_per_unit)
        : parseFloat(cartItem.original_product_price);

    await client.query('COMMIT');

    res.status(200).json({
      status: 'success',
      message: 'Cart item updated successfully.',
      data: {
        cart_item: {
          id: updatedCartItem.id,
          product_id: updatedCartItem.product_id,
          product_name: cartItem.product_name,
          quantity: updatedCartItem.quantity,
          is_negotiated: updatedCartItem.is_negotiated,
          quantity_fixed: updatedCartItem.quantity_fixed,
          price_per_unit: effectivePrice,
          total_item_price: updatedCartItem.quantity * effectivePrice,
        },
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// exports.removeFromCart = catchAsync(async (req, res, next) => {
//   const client = await pool.connect();
//   try {
//     await client.query('BEGIN');

//     const userId = req.user.id;
//     const cartItemId = req.params.id;

//     // Check if the cart item exists and belongs to the user
//     const checkCartItemQuery = `
//       SELECT ci.*, c.consumer_id
//       FROM cart_items ci
//       JOIN cart c ON ci.cart_id = c.id
//       WHERE ci.id = $1 AND c.consumer_id = $2
//     `;
//     const { rows: cartItemRows } = await client.query(checkCartItemQuery, [
//       cartItemId,
//       userId,
//     ]);

//     if (cartItemRows.length === 0) {
//       throw new AppError('Cart item not found', 404);
//     }

//     const cartItem = cartItemRows[0];

//     // Delete the cart item
//     const deleteCartItemQuery = `
//       DELETE FROM cart_items WHERE id = $1 RETURNING *
//     `;
//     const { rows: deletedCartItemRows } = await client.query(
//       deleteCartItemQuery,
//       [cartItemId]
//     );
//     const deletedCartItem = deletedCartItemRows[0];

//     await client.query('COMMIT');

//     res.status(200).json({
//       status: 'success',
//       message: 'Cart item removed successfully',
//       data: {
//         cart_item: deletedCartItem,
//       },
//     });
//   } catch (error) {
//     await client.query('ROLLBACK');
//     next(error);
//   } finally {
//     client.release();
//   }
// });

exports.removeFromCart = catchAsync(async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userId = req.user.id;
    const { id: cartItemId } = req.params;

    // Check if the cart item exists and belongs to the user
    const cartItemCheckRes = await client.query(
      `SELECT ci.id, ci.accepted_offer_id FROM cart_items ci
       JOIN cart c ON ci.cart_id = c.id
       WHERE ci.id = $1 AND c.consumer_id = $2`,
      [cartItemId, userId]
    );

    if (cartItemCheckRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return next(
        new AppError('Cart item not found or does not belong to you.', 404)
      );
    }
    const { accepted_offer_id } = cartItemCheckRes.rows[0];

    const deletedItemRes = await client.query(
      'DELETE FROM cart_items WHERE id = $1 RETURNING *',
      [cartItemId]
    );

    // If the removed item was from an accepted offer, you might want to update the accepted_offer status
    // or the original offer status to something like 'cancelled_by_user_from_cart'
    // This depends on how strictly you want to manage the offer lifecycle.
    // For now, ON DELETE SET NULL on `accepted_offer_id` in `cart_items` handles DB relation.
    // The cron job handles expiry if it wasn't ordered.
    if (accepted_offer_id) {
      // Example: Update original offer status if needed
      // await client.query(
      //   "UPDATE offers SET status = 'lapsed' WHERE id = (SELECT offer_id FROM accepted_offers WHERE id = $1) AND status = 'accepted'",
      //   [accepted_offer_id]
      // );
      console.log(
        `Removed negotiated item (accepted_offer_id: ${accepted_offer_id}) from cart.`
      );
    }

    await client.query('COMMIT');
    res.status(200).json({
      status: 'success',
      message: 'Cart item removed successfully.',
      data: {
        removed_item: deletedItemRes.rows[0],
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// exports.clearCart = catchAsync(async (req, res, next) => {
//   const client = await pool.connect();
//   try {
//     await client.query('BEGIN');

//     const userId = req.user.id;

//     // Check if the cart exists
//     const checkCartQuery = `
//       SELECT * FROM cart WHERE consumer_id = $1
//     `;
//     const { rows: cartRows } = await client.query(checkCartQuery, [userId]);

//     if (cartRows.length === 0) {
//       throw new AppError('Cart not found', 404);
//     }

//     const cartId = cartRows[0].id;

//     // Delete all items from the cart
//     const deleteCartItemsQuery = `
//       DELETE FROM cart_items WHERE cart_id = $1
//     `;
//     await client.query(deleteCartItemsQuery, [cartId]);

//     await client.query('COMMIT');

//     res.status(200).json({
//       status: 'success',
//       message: 'Cart cleared successfully',
//       data: {
//         cart_id: cartId,
//       },
//     });
//   } catch (error) {
//     await client.query('ROLLBACK');
//     next(error);
//   } finally {
//     client.release();
//   }
// });

exports.clearCart = catchAsync(async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userId = req.user.id;

    const cartRes = await client.query(
      'SELECT id FROM carts WHERE consumer_id = $1',
      [userId]
    );
    if (cartRes.rowCount === 0) {
      // No cart to clear, which is fine.
      await client.query('COMMIT'); // or ROLLBACK
      return res
        .status(200)
        .json({ status: 'success', message: 'Cart is already empty.' });
    }
    const cartId = cartRes.rows[0].id;

    // Before deleting, get accepted_offer_ids
    // const negotiatedItems = await client.query(
    //     'SELECT accepted_offer_id FROM cart_items WHERE cart_id = $1 AND accepted_offer_id IS NOT NULL',
    //     [cartId]
    // );

    await client.query('DELETE FROM cart_items WHERE cart_id = $1', [cartId]);

    // if (negotiatedItems.rowCount > 0) {
    //     const acceptedOfferIds = negotiatedItems.rows.map(item => item.accepted_offer_id);
    //     // Logic to update original offers based on these IDs if needed
    // }

    await client.query('COMMIT');
    res.status(200).json({
      status: 'success',
      message: 'Cart cleared successfully.',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// exports.checkout = catchAsync(async (req, res, next) => {
//   const client = await pool.connect();
//   try {
//     await client.query('BEGIN');

//     const userId = req.user.id;
//     const { delivery_address } = req.body;

//     if (!delivery_address) {
//       throw new AppError('Delivery address is required', 400);
//     }

//     // Check if the cart exists
//     const checkCartQuery = `
//       SELECT * FROM cart WHERE consumer_id = $1
//     `;
//     const { rows: cartRows } = await client.query(checkCartQuery, [userId]);

//     if (cartRows.length === 0) {
//       throw new AppError('Cart not found', 404);
//     }

//     const cartId = cartRows[0].id;

//     // Check if the cart contains any items
//     const checkCartItemsQuery = `
//       SELECT ci.*, p.stock_quantity, p.name
//       FROM cart_items ci
//       JOIN products p ON ci.product_id = p.id
//       WHERE ci.cart_id = $1
//     `;
//     const { rows: cartItemRows } = await client.query(checkCartItemsQuery, [
//       cartId,
//     ]);

//     if (cartItemRows.length === 0) {
//       throw new AppError('No items in the cart', 400);
//     }

//     // Validate stock availability
//     for (const item of cartItemRows) {
//       if (item.quantity > item.stock_quantity) {
//         throw new AppError(
//           `Insufficient stock for product "${item.name}"`,
//           400
//         );
//       }
//     }

//     // Placeholder: Create order logic
//     const createOrderQuery = `
//       INSERT INTO orders (consumer_id, delivery_address, status)
//       VALUES ($1, $2, 'pending') RETURNING id
//     `;
//     const { rows: orderRows } = await client.query(createOrderQuery, [
//       userId,
//       delivery_address,
//     ]);
//     const orderId = orderRows[0].id;

//     // Placeholder: Clear the cart after successful order creation
//     const deleteCartItemsQuery = `
//       DELETE FROM cart_items WHERE cart_id = $1
//     `;
//     await client.query(deleteCartItemsQuery, [cartId]);

//     await client.query('COMMIT'); // Commit transaction

//     // Respond with success message and order details
//     res.status(200).json({
//       status: 'success',
//       message: 'Checkout successful',
//       data: {
//         order_id: orderId,
//         delivery_address,
//         items: cartItemRows,
//       },
//     });
//   } catch (error) {
//     await client.query('ROLLBACK');
//     next(error);
//   } finally {
//     client.release();
//   }
// });

exports.checkout = catchAsync(async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userId = req.user.id;
    const { delivery_address, payment_method_id } = req.body; // Assuming payment_method_id for Stripe

    if (!delivery_address) {
      await client.query('ROLLBACK');
      return next(new AppError('Delivery address is required.', 400));
    }
    // Add validation for payment_method_id if needed

    const cartRes = await client.query(
      'SELECT id FROM carts WHERE consumer_id = $1',
      [userId]
    );
    if (cartRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return next(new AppError('Cart not found.', 404));
    }
    const cartId = cartRes.rows[0].id;

    // Fetch cart items with correct pricing for order creation and validation
    const cartItemsQuery = `
      SELECT
        ci.id AS cart_item_id,
        ci.product_id,
        p.name AS product_name,
        ci.quantity,
        ci.is_negotiated,
        ci.negotiated_price_per_unit,
        p.price AS original_product_price,
        p.stock_quantity
      FROM cart_items ci
      JOIN products p ON ci.product_id = p.id
      WHERE ci.cart_id = $1;
    `;
    const { rows: cartItemsForOrder } = await client.query(cartItemsQuery, [
      cartId,
    ]);

    if (cartItemsForOrder.length === 0) {
      await client.query('ROLLBACK');
      return next(new AppError('Your cart is empty.', 400));
    }

    let orderTotalAmount = 0;
    const orderItemsDetails = [];

    for (const item of cartItemsForOrder) {
      if (item.quantity > item.stock_quantity) {
        await client.query('ROLLBACK');
        return next(
          new AppError(
            `Insufficient stock for product "${item.product_name}". Only ${item.stock_quantity} available.`,
            400
          )
        );
      }
      const effectivePrice =
        item.is_negotiated && item.negotiated_price_per_unit
          ? parseFloat(item.negotiated_price_per_unit)
          : parseFloat(item.original_product_price);
      const itemTotal = item.quantity * effectivePrice;
      orderTotalAmount += itemTotal;

      orderItemsDetails.push({
        product_id: item.product_id,
        quantity: item.quantity,
        price_per_unit_paid: effectivePrice, // Price actually paid
        total_price: itemTotal,
      });
    }

    // Create Order (status 'pending_payment' or similar)
    const orderId = uuidv4();
    const orderQuery = `
      INSERT INTO orders (id, consumer_id, delivery_address, total_amount, status)
      VALUES ($1, $2, $3, $4, 'pending_payment') RETURNING id, created_at;
    `;
    const orderResult = await client.query(orderQuery, [
      orderId,
      userId,
      delivery_address,
      orderTotalAmount,
    ]);

    // Create Order Items
    // I'll need an order_items table:
    // CREATE TABLE order_items (
    //   id UUID PRIMARY KEY,
    //   order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    //   product_id UUID REFERENCES products(id),
    //   quantity INT,
    //   price_per_unit_paid DECIMAL(10,2), -- The price at which it was sold
    //   total_price DECIMAL(10,2)
    // );
    for (const detail of orderItemsDetails) {
      const orderItemId = uuidv4();
      await client.query(
        `INSERT INTO order_items (id, order_id, product_id, quantity, price_per_unit_paid, total_price)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          orderItemId,
          orderId,
          detail.product_id,
          detail.quantity,
          detail.price_per_unit_paid,
          detail.total_price,
        ]
      );
    }

    // The cart is NOT cleared here. It's cleared by Stripe webhook after successful payment.
    // Your flow:
    // 1. POST /api/v1/cart/checkout -> creates pending order (this function)
    // 2. Frontend receives order_id, calls POST /api/v1/orders/checkout-session with order_id
    // 3. Stripe processes payment
    // 4. POST /api/v1/orders/webhook -> updates order to 'paid', clears cart.

    await client.query('COMMIT');
    res.status(200).json({
      status: 'success',
      message: 'Order initiated, proceed to payment.',
      data: {
        order_id: orderResult.rows[0].id,
        order_created_at: orderResult.rows[0].created_at,
        total_amount: orderTotalAmount,
        delivery_address,
        items: orderItemsDetails, // Send back the processed items for confirmation/Stripe session
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});
