const express = require('express');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const hpp = require('hpp');
const winston = require('winston');

// Custom modules
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

// Trust reverse proxy (for Express Rate Limit, etc.)
app.set('trust proxy', 1);

// --- CORS Setup ---
const allowedOrigins = [
  'http://localhost:8080',

  'https://heroic-dragon-0b1a27.netlify.app',

  'https://kisanchoice.bhaweshpanwar.xyz',
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};

app.use(cors(corsOptions));

// --- Security & Performance Middleware ---

app.use(hpp());

app.use(morgan('dev'));

const limiter = rateLimit({
  max: 100,
  windowMs: 60 * 60 * 1000,
  message: 'Too many requests from this IP, please try again in an hour!',
});

app.use('/api', limiter);

app.use(express.json({ limit: '10kb' }));

app.use(express.urlencoded({ extended: true, limit: '10kb' }));

app.use(cookieParser());

app.use('/public', express.static('public'));

// --- Webhook: must be before body-parser ---
app.post(
  '/api/v1/cart/webhook',
  express.raw({ type: 'application/json' }),
  checkoutController.handleWebhook
);

// --- Public Routes ---
app.get('/api/v1/categories', productController.getCategories);

// --- Mount API Routes ---
app.use('/api/v1/users', userRouter);
app.use('/auth', authRouter);
app.use('/api/v1/products', productRouter);
app.use('/api/v1/reviews', reviewRouter);
app.use('/api/v1/cart', cartRouter);
app.use('/api/v1/orders', orderRouter);
app.use('/api/v1/negotiations', negotiationRouter);
app.use('/api/v1/block', blockRouter);

app.get('/', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Kisan Choice Server',
    frontend: 'https://heroic-dragon-0b1a27.netlify.app',
    github: 'https://github.com/bhaweshpanwar/kisan-choice',
  });
});

// --- Fallback for Unhandled Routes ---

app.all('*', (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// --- Global Error Handling ---

app.use(globalErrorHandler);

// --- Logging Setup ---

const logger = winston.createLogger({
  level: 'info',

  format: winston.format.json(),

  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),

    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.simple(),
    })
  );
}

module.exports = app;
