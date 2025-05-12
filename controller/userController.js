const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const Farmer = require('../model/farmerModel');
const { generateFarmerBio } = require('./../utils/generativeAI');
const pool = require('./../db/db');
const User = require('../model/userModel');

exports.becomeFarmer = catchAsync(async (req, res, next) => {
  const {
    experience,
    specialization,
    certifications,
    farm_location,
    location,
  } = req.body;

  if (
    !experience ||
    !specialization ||
    !certifications ||
    !farm_location ||
    !location
  ) {
    return next(new AppError('Please provide all the required fields', 400));
  }

  const userId = req.user.id;

  const existingFarmer = await Farmer.findFarmerById(userId);

  if (existingFarmer) {
    return next(new AppError('User is already a farmer', 400));
  }

  //Generate AI bio here
  const bio = await generateFarmerBio(
    experience,
    specialization,
    farm_location
  );

  //create farmer entry in the database
  const farmer = await Farmer.createFarmer(
    userId,
    experience,
    specialization,
    certifications,
    farm_location,
    location,
    bio
  );

  await pool.query('UPDATE users SET role = $1 WHERE id = $2', [
    'farmer',
    userId,
  ]);

  res.status(200).json({
    status: 'success',
    message: 'User has become a farmer',
    farmer,
  });
});

exports.getUser = async (req, res) => {
  try {
    const user = await User.findUserById(req.params.id);

    if (!user) {
      return res.status(404).json({
        status: 'fail',
        message: 'User not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        user,
      },
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      status: 'error',
      message: 'Server error',
    });
  }
};

exports.getMyAddresses = catchAsync(async (req, res, next) => {
  const userId = req.user.id;

  const result = await pool.query(
    'SELECT * FROM addresses WHERE user_id = $1 ORDER BY is_primary DESC, created_at DESC',
    [userId]
  );

  res.status(200).json({
    status: 'success',
    results: result.rows.length,
    data: {
      addresses: result.rows,
    },
  });
});

exports.createAddress = catchAsync(async (req, res, next) => {
  const userId = req.user.id;
  const {
    address_line1,
    address_line2,
    city,
    state,
    country,
    postal_code,
    is_primary,
  } = req.body;

  // If the new address is set as primary, unset previous ones
  if (is_primary) {
    await pool.query(
      'UPDATE addresses SET is_primary = FALSE WHERE user_id = $1',
      [userId]
    );
  }

  const result = await pool.query(
    `INSERT INTO addresses (
      user_id, address_line1, address_line2, city, state, country, postal_code, is_primary
    ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8
    ) RETURNING *`,
    [
      userId,
      address_line1,
      address_line2,
      city,
      state,
      country,
      postal_code,
      is_primary || false,
    ]
  );

  res.status(201).json({
    status: 'success',
    data: result.rows[0],
  });
});

exports.updateAddress = catchAsync(async (req, res, next) => {
  const userId = req.user.id;
  const addressId = req.params.addressId;
  const {
    address_line1,
    address_line2,
    city,
    state,
    country,
    postal_code,
    is_primary,
  } = req.body;

  // Verify the address belongs to the user
  const existing = await pool.query(
    'SELECT * FROM addresses WHERE id = $1 AND user_id = $2',
    [addressId, userId]
  );
  if (existing.rows.length === 0) {
    return next(
      new AppError('No address found with that ID for the current user', 404)
    );
  }

  // If setting as primary, unset others
  if (is_primary) {
    await pool.query(
      'UPDATE addresses SET is_primary = FALSE WHERE user_id = $1',
      [userId]
    );
  }

  const result = await pool.query(
    `UPDATE addresses SET
      address_line1 = COALESCE($1, address_line1),
      address_line2 = COALESCE($2, address_line2),
      city = COALESCE($3, city),
      state = COALESCE($4, state),
      country = COALESCE($5, country),
      postal_code = COALESCE($6, postal_code),
      is_primary = COALESCE($7, is_primary)
    WHERE id = $8 AND user_id = $9
    RETURNING *`,
    [
      address_line1,
      address_line2,
      city,
      state,
      country,
      postal_code,
      is_primary,
      addressId,
      userId,
    ]
  );

  res.status(200).json({
    status: 'success',
    data: result.rows[0],
  });
});

exports.deleteAddress = catchAsync(async (req, res, next) => {
  const userId = req.user.id;
  const addressId = req.params.addressId;

  const result = await pool.query(
    'DELETE FROM addresses WHERE id = $1 AND user_id = $2 RETURNING *',
    [addressId, userId]
  );

  if (result.rowCount === 0) {
    return next(
      new AppError('No address found with that ID for the current user', 404)
    );
  }

  res.status(204).json({
    status: 'success',
    data: null,
  });
});
