const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { logger, requestLogger, logError } = require('./utils/logger');
require('dotenv').config();

/* ============================
   🔐 ENV VALIDATION
============================ */
if (!process.env.MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in .env');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 5001;
const MONGO_URI = process.env.MONGODB_URI;

/* ============================
   🌐 CORS CONFIG
============================ */
const getAllowedOrigins = () => {
  const origins = [
    'http://localhost:3000',
    'https://landlordnoagent.vercel.app',
    'https://landlord-no-agent-frontend.vercel.app',
    'https://www.landlordnoagent.com'
  ];

  if (process.env.FRONTEND_URL) {
    origins.push(
      ...process.env.FRONTEND_URL.split(',').map(o => o.trim())
    );
  }

  return [...new Set(origins)];
};

const allowedOrigins = getAllowedOrigins();
logger.debug('CORS origins configured', { origins: allowedOrigins });

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    logger.warn('CORS blocked origin', { origin });
    callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

/* ============================
   🧰 SECURITY + LOGGING
============================ */
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginEmbedderPolicy: false
}));

app.use(requestLogger);
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

/* ============================
   🚦 RATE LIMITING
============================ */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: req => req.method === 'OPTIONS'
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10
});

app.use('/api', apiLimiter);

/* ============================
   📦 BODY PARSING
============================ */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

/* ============================
   🖼️ STATIC FILES
============================ */
app.use('/uploads', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
});
app.use('/uploads', express.static('uploads'));

/* ============================
   🧠 DATABASE
============================ */
const connectDB = async () => {
  try {
    logger.info('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000
    });

    logger.info('MongoDB connected', {
      state: mongoose.connection.readyState
    });
  } catch (err) {
    logger.error('MongoDB connection failed', {
      error: err.message
    });
    throw err;
  }
};

/* ============================
   🛣️ ROUTES
============================ */
app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/properties', require('./routes/properties'));
app.use('/api/applications', require('./routes/applications'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/maintenance', require('./routes/maintenance'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/email', require('./routes/email'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/stripe', require('./routes/stripe'));

/* ============================
   🩺 HEALTH CHECK
============================ */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    uptime: process.uptime(),
    mongoConnected: mongoose.connection.readyState === 1,
    timestamp: new Date().toISOString()
  });
});

/* ============================
   ❌ ERROR HANDLING
============================ */
app.use((err, req, res, next) => {
  logError(err, req);

  if (err.message?.includes('CORS')) {
    return res.status(403).json({ message: 'CORS violation' });
  }

  res.status(err.status || 500).json({
    message: err.message || 'Internal Server Error'
  });
});

app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

/* ============================
   🚀 START SERVER
============================ */
const startServer = async () => {
  try {
    await connectDB();
  } catch {
    logger.warn('Continuing without MongoDB (dev mode)');
  }

  const server = app.listen(PORT, () => {
    logger.info('🚀 Server running', {
      port: PORT,
      url: `http://localhost:${PORT}`
    });
  });

  server.on('error', err => {
    if (err.code === 'EADDRINUSE') {
      logger.error(`❌ Port ${PORT} already in use`);
      process.exit(1);
    }
    logError(err);
  });
};

startServer();