const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const { promisify } = require('util');

dotenv.config({ path: './config.env' });

const catchAsync = require('../utils/catchAsync');
const signupSchema = require('./../model/validators/authValidators');
const User = require('../model/userModel');
const AppError = require('../utils/appError');
const { changedPasswordAfter } = require('../utils/passwordUtils');

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

  const user = await User.getUserByEmail(email);

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
