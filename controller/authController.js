const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const { promisify } = require('util');
const crypto = require('crypto');
const Joi = require('joi');

dotenv.config({ path: './config.env' });

const catchAsync = require('../utils/catchAsync');
const signupSchema = require('./../model/validators/authValidators');
const User = require('../model/userModel');
const AppError = require('../utils/appError');
const changedPasswordAfter = require('./../utils/authUtils');
const { createPasswordResetToken } = require('./../utils/tokenUtils');
const Email = require('./../utils/email');
const pool = require('./../db/db');

const passwordSchema = Joi.string()
  .min(8)
  .pattern(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/
  )
  .required()
  .messages({
    'string.empty': 'Password is required',
    'string.min': 'Password should have a minimum length of 8',
    'string.pattern.base':
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
  });

const validatePasswordWithJoi = function (password) {
  const { error } = passwordSchema.validate(password);
  if (error) {
    return error.details[0].message;
  }
  return true;
};

exports.createSendToken = (user, statusCode, req, res, sendUserData = true) => {
  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });

  const cookieOptions = {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
  };

  if (process.env.NODE_ENV === 'production') {
    cookieOptions.secure = true;
  }

  res.cookie('V3wD5zX9pA6nQ4', token, cookieOptions);
  const response = {
    status: 'success',
  };

  // Include user data only if sendUserData is true
  if (sendUserData) {
    response.data = { user };
  }

  res.status(statusCode).json(response);
};

exports.signup = catchAsync(async (req, res, next) => {
  //Ensure no one is trying to sign up as an admin
  if (req.body.role === 'admin') {
    return res.status(400).json({
      status: 'fail',
      message: 'Invalid role',
    });
  }

  //Ensure that passwords match
  if (req.body.password !== req.body.confirmPassword) {
    return res.status(400).json({
      status: 'fail',
      message: 'Passwords do not match',
    });
  }

  const { error, value } = signupSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      status: 'fail',
      message: error.details[0].message,
    });
  }

  const { name, email, password, mobile } = value;

  const hashedPassword = await bcrypt.hash(password, 12);

  const result = await User.createUser({
    name,
    email,
    password: hashedPassword,
    mobile,
    role: 'consumer',
  });

  // const url = `${req.protocol}://${req.get('host')}/me`;
  // // console.log(url);
  // await new Email(result, url).sendWelcome();

  this.createSendToken(result, 201, req, res);
});

exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      status: 'fail',
      message: 'Please provide email and password',
    });
  }

  const user = await User.findUserByEmail(email);

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({
      status: 'fail',
      message: 'Incorrect email or password',
    });
  }

  this.createSendToken(user, 200, req, res);
});

exports.logout = (req, res) => {
  res.cookie('V3wD5zX9pA6nQ4', 'loggedout', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
  });
  res.status(200).json({
    status: 'success',
  });
};

exports.protect = catchAsync(async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies.V3wD5zX9pA6nQ4) {
    token = req.cookies.V3wD5zX9pA6nQ4;
  }

  if (!token) {
    return next(
      new AppError('You are not logged in! Please log in to get access', 401)
    );
  }

  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

  const currentUser = await User.findUserById(decoded.id);
  if (!currentUser) {
    return next(
      new AppError(
        'The user belonging to this token does no longer exist.',
        401
      )
    );
  }

  if (changedPasswordAfter(currentUser.password_changed_at, decoded.iat)) {
    return next(
      new AppError('User recently changed password! Please log in again.', 401)
    );
  }

  req.user = currentUser;
  res.locals.user = currentUser;
  next();
});

exports.forgotPassword = catchAsync(async (req, res, next) => {
  //1.Find user based on POSTed email
  //2.Generate the random reset token
  //3.Update the database with hashed token and expiration time
  //4.Send it to user's email

  const user = await User.findUserByEmail(req.body.email);
  if (!user) {
    return next(new AppError('There is no user with that email address', 404));
  }

  const { resetToken, hashedToken, expirationTime } =
    createPasswordResetToken();

  const updatedUser = await User.updatePasswordResetToken(
    user.id,
    hashedToken,
    expirationTime
  );

  const resetURL = `${req.protocol}://${req.get(
    'host'
  )}/api/v1/users/resetPassword/${resetToken}`;

  //Module for email
  try {
    await new Email(user, resetURL).sendPasswordReset();

    res.status(200).json({
      status: 'success',
      message: 'Token sent to email!',
      reset_url: resetURL,
    });
  } catch (error) {
    const updatedUser = await User.updatePasswordResetToken(
      user.id,
      null,
      null
    );
    return next(
      new AppError(
        'There was an error sending the email. Try again later!',
        500
      )
    );
  }
});

exports.resetPassword = catchAsync(async (req, res, next) => {
  const { password, confirmPassword } = req.body;

  const resetToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');

  const query = `SELECT id,email,name FROM public."users" WHERE password_reset_token = $1 AND password_reset_expires > NOW() AND active = true`;
  const result = await pool.query(query, [resetToken]);

  if (result.rowCount === 0) {
    return next(new AppError('Token is invalid or has expired', 400));
  }

  const user = result.rows[0];

  if (req.body.password !== req.body.confirmPassword) {
    return next(new AppError('Passwords do not match', 400));
  }

  const passwordValidationResult = validatePasswordWithJoi(password);
  if (passwordValidationResult !== true) {
    return next(new AppError(passwordValidationResult, 400));
  }

  const hashedPassword = await bcrypt.hash(req.body.password, 12);

  const updateQuery = `
  UPDATE public."users"
  SET password = $1,
      password_reset_token = NULL,
      password_reset_expires = NULL,
      password_changed_at = NOW()
  WHERE id = $2 AND active = true
  `;
  const updateValues = [hashedPassword, user.id];
  await pool.query(updateQuery, updateValues);

  this.createSendToken(user, 200, req, res);
});

exports.updatePassword = catchAsync(async (req, res, next) => {
  // 1. Check if all required fields are provided
  // 2. Check if new passwords match
  // 3. Validate the new password strength using Joi
  // 4. Check if the current password is correct
  // 5. Hash the new password
  // 6. Update the password in the database
  // 7. Send a success response (e.g., create and send a token)
  const currentUser = req.user;

  const { currentPassword, newPassword, newPasswordConfirm } = req.body;

  if (!currentPassword || !newPassword || !newPasswordConfirm) {
    return next(new AppError('Please provide all required fields', 400));
  }

  if (newPassword !== newPasswordConfirm) {
    return next(new AppError('Passwords do not match', 400));
  }

  const isPasswordCorrect = await bcrypt.compare(
    currentPassword,
    currentUser.password
  );

  if (!isPasswordCorrect) {
    return next(new AppError('Wrong old password.', 401));
  }

  const passwordValidationResult = validatePasswordWithJoi(newPassword);
  if (passwordValidationResult !== true) {
    return next(new AppError(passwordValidationResult, 400));
  }

  const hashedPassword = await bcrypt.hash(newPassword, 12);

  const updateQuery = `
    UPDATE public."users"
    SET password = $1,
        password_changed_at = NOW()
    WHERE id = $2 AND active = true
  `;
  const updateValues = [hashedPassword, currentUser.id];
  await pool.query(updateQuery, updateValues);

  this.createSendToken(currentUser, 200, req, res);
});

exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError('You do not have permission to perform this action', 403)
      );
    }

    next();
  };
};
