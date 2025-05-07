const pool = require('../db/db');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');

exports.blockUser = catchAsync(async (req, res, next) => {
  const farmerId = req.user.id;
  const { consumerId } = req.params;
  const { reason } = req.body;

  if (!consumerId) {
    return next(new AppError('Consumer ID is required to block a user.', 400));
  }

  // Prevent farmer from blocking themselves (if consumer and farmer IDs could overlap in a system)
  if (farmerId === consumerId) {
    return next(new AppError('You cannot block yourself.', 400));
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Check if user exists (optional, depends on your system's integrity)
    const consumerCheck = await client.query(
      'SELECT id FROM users WHERE id = $1 AND active = true',
      [consumerId]
    );
    if (consumerCheck.rowCount === 0) {
      await client.query('ROLLBACK');
      return next(new AppError('Consumer to block not found.', 404));
    }

    // Check if already blocked
    const alreadyBlockedRes = await client.query(
      'SELECT blocked_id FROM blocked_accounts WHERE user_id = $1 AND farmer_id = $2 AND blocked_until > NOW()',
      [consumerId, farmerId]
    );
    if (alreadyBlockedRes.rowCount > 0) {
      await client.query('ROLLBACK');
      return next(new AppError('This user is already blocked by you.', 400));
    }

    const insertQuery = `
      INSERT INTO blocked_accounts (user_id, farmer_id, reason)
      VALUES ($1, $2, $3) RETURNING blocked_until;
    `;
    const result = await client.query(insertQuery, [
      blockId,
      consumerId,
      farmerId,
      reason,
    ]);

    await client.query('COMMIT');
    res.status(201).json({
      status: 'success',
      message: 'User blocked successfully.',
      data: {
        blockId,
        blockedUntil: result.rows[0].blocked_until,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    // Handle unique constraint violation if a block was attempted again due to race condition
    if (error.code === '23505') {
      // PostgreSQL unique violation
      return next(
        new AppError('This user is already blocked (concurrent request).', 409)
      );
    }
    console.error('Error blocking user:', error);
    return next(new AppError('Failed to block user.', 500));
  } finally {
    client.release();
  }
});

exports.unblockUser = catchAsync(async (req, res, next) => {
  const farmerId = req.user.id;
  const { consumerId } = req.params;

  if (!consumerId) {
    return next(
      new AppError('Consumer ID is required to unblock a user.', 400)
    );
  }

  const result = await pool.query(
    'DELETE FROM blocked_accounts WHERE user_id = $1 AND farmer_id = $2 RETURNING blocked_id',
    [consumerId, farmerId]
  );

  if (result.rowCount === 0) {
    return next(
      new AppError(
        'No active block found for this user by you, or user not found.',
        404
      )
    );
  }

  res.status(200).json({
    status: 'success',
    message: 'User unblocked successfully.',
  });
});

exports.getMyBlockedUsers = catchAsync(async (req, res, next) => {
  const farmerId = req.user.id;

  const result = await pool.query(
    `SELECT b.blocked_id, b.user_id, u.name as consumer_name, u.email as consumer_email, b.reason, b.blocked_on, b.blocked_until
     FROM blocked_accounts b
     JOIN users u ON b.user_id = u.id
     WHERE b.farmer_id = $1 AND b.blocked_until > NOW()
     ORDER BY b.blocked_on DESC`,
    [farmerId]
  );

  res.status(200).json({
    status: 'success',
    results: result.rowCount,
    data: {
      blockedUsers: result.rows,
    },
  });
});

// exports.checkIfBlockedByFarmer = catchAsync(async (req, res, next) => {
//   const consumerId = req.user.id;
//   const { farmerId } = req.params;

//   if (!farmerId) {
//     return next(new AppError('Farmer ID is required.', 400));
//   }

//   const blockedRes = await pool.query(
//     'SELECT blocked_until FROM blocked_accounts WHERE user_id = $1 AND farmer_id = $2 AND blocked_until > NOW()',
//     [consumerId, farmerId]
//   );

//   if (blockedRes.rowCount > 0) {
//     res.status(200).json({
//       status: 'success',
//       isBlocked: true,
//       blockedUntil: blockedRes.rows[0].blocked_until,
//     });
//   } else {
//     res.status(200).json({
//       status: 'success',
//       isBlocked: false,
//     });
//   }
// });
