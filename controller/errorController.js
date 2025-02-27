const AppError = require('./../utils/appError');

const handleInvalidEnumErrorDB = (err) => {
  const message = `Invalid value: "${err}". Please provide one of the allowed values.`;
  return new AppError(message, 400, true);
};

const handleCheckConstraintErrorDB = (err) => {
  const message = `Check constraint failed for value: "${err}". Please provide a valid input.`;
  return new AppError(message, 400, true);
};

const handleUniqueConstraintErrorDB = (err) => {
  const message = `Duplicate field value: "${err}". Please use another value!`;
  return new AppError(message, 400, true);
};

handleJWTError = () => new AppError('Invalid Token.Please Log in Again', 401);

handleJWTExpiredError = () =>
  new AppError('Your Token has expired! Please log in again', 401);

// const handleCastErrorDB = (err) => {
//   const message = `Invalid ${err.path}: ${err.value}.`;
//   return new AppError(message, 400, true);
// };

const sendErrorDev = (err, req, res) => {
  if (req.originalUrl.startsWith('/api')) {
    return res.status(err.statusCode).json({
      status: err.status,
      error: err,
      message: err.message,
      stack: err.stack,
    });
  }

  console.log('ERROR 💥', err);

  return res.status(err.statusCode).json({
    title: 'Something went wrong!',
    msg: err.message,
  });
};

const sendErrorProd = (err, req, res) => {
  if (req.originalUrl.startsWith('/api')) {
    if (err.isOperational) {
      return res.status(err.statusCode).json({
        status: err.status,
        message: err.message,
      });
    }

    console.log('ERROR 💥', err);

    return res.status(500).json({
      status: 'error',
      message: 'Something went wrong.',
    });
  }

  if (err.isOperational) {
    res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
    });
  }

  console.error('ERROR 💥', err);

  return res.status(err.statusCode).json({
    status: 'error',
    message: 'Please try again later.',
  });
};

module.exports = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, req, res);
  } else if (process.env.NODE_ENV === 'production') {
    let error = { ...err };
    error.message = err.message;

    // Handle specific PostgreSQL error codes
    if (err.code === '23514') error = handleCheckConstraintErrorDB(err, req); // Check constraint
    if (err.code === '23505') error = handleUniqueConstraintErrorDB(err); // Unique constraint
    if (err.code === '22P02') error = handleInvalidEnumErrorDB(err); // Invalid enum cast
    if (err.name === 'JsonWebTokenError') error = handleJWTError();
    if (err.name === 'TokenExpiredError') error = handleJWTExpiredError();

    // Add default operational flag if not already set
    if (!error.isOperational) {
      error = new AppError('An unexpected error occurred.', 500, false);
    }

    sendErrorProd(error, req, res);
  }
};
