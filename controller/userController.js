const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const Farmer = require('../model/farmerModel');
const { generateFarmerBio } = require('./../utils/generativeAI');
const pool = require('./../db/db');

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
