const express = require('express');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');

const AppError = require('./utils/appError');
const userRouter = require('./routes/userRoutes');
const authRouter = require('./routes/authRoutes');
const productRouter = require('./routes/productRoutes');
const passportSetup = require('./config/passport-setup');
const globalErrorHandler = require('./controller/errorController');

const app = express();

app.use(morgan('dev'));

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// // Test middleware
// app.use((req, res, next) => {
//   req.requestTime = new Date().toISOString();
//   console.log(req.requestTime);
//   next();
// });

app.use('/api/v1/users', userRouter);
app.use('/auth', authRouter);

//Routes i need to create
app.use('/api/v1/products', productRouter);
// app.use('/api/v1/orders', orderRouter);
// app.use('/api/v1/cart', cartRouter);
// app.use('/api/v1/reviews', reviewRouter);
// app.use('/api/v1/offers', offerRouter);
// app.use('/api/v1/negotiations', negotiationRouter);
// app.use('/api/v1/block', blockRouter);
// app.use('/api/v1/payments', paymentRouter);
// app.use('/api/v1/admin', adminRouter);

app.all('*', (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

app.use(globalErrorHandler);

module.exports = app;
