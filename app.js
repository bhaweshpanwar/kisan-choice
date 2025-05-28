const express = require('express');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const cors = require('cors');
const helmet = require('helmet');
const AppError = require('./utils/appError');
const userRouter = require('./routes/userRoutes');
const authRouter = require('./routes/authRoutes');
const productRouter = require('./routes/productRoutes');
const reviewRouter = require('./routes/reviewRoutes');
const cartRouter = require('./routes/cartRoutes');
const orderRouter = require('./routes/orderRoutes');
const negotiationRouter = require('./routes/negotiationRoutes');
const blockRouter = require('./routes/blockRoutes');
const checkoutController = require('./controller/checkoutController');
const passportSetup = require('./config/passport-setup');
const globalErrorHandler = require('./controller/errorController');
const productController = require('./controller/productController');
const app = express();

// Set security HTTP headers
app.use(helmet());

// --- MIDDLEWARES ---
const corsOptions = {
  origin: [
    'http://localhost:8080',
    'https://heroic-dragon-0b1a27.netlify.app/login',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};
app.use(cors(corsOptions));

app.use(morgan('dev'));

// Option 1: Define webhook route very early
app.post(
  '/api/v1/cart/webhook',
  express.raw({ type: 'application/json' }),
  checkoutController.handleWebhook
);

app.get('/api/v1/categories', productController.getCategories);

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());
app.use('/public', express.static('public'));

// // Test middleware
// app.use((req, res, next) => {
//   req.requestTime = new Date().toISOString();
//   console.log(req.requestTime);
//   next();
// });

app.use('/api/v1/users', userRouter);
app.use('/auth', authRouter);
app.use('/api/v1/products', productRouter);
app.use('/api/v1/reviews', reviewRouter);
app.use('/api/v1/cart', cartRouter);
app.use('/api/v1/orders', orderRouter);
app.use('/api/v1/negotiations', negotiationRouter);
app.use('/api/v1/block', blockRouter);

/////////////////////////////////////////////////////////////////
//Routes i need to create
// app.use('/api/v1/offers', offerRouter);

app.all('*', (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

app.use(globalErrorHandler);

module.exports = app;
