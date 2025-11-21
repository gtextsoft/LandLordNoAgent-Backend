const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

if (!process.env.MONGODB_URI) {
  console.error("❌ MONGODB_URI not found in .env");
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 5001;
console.log('🔐 MONGODB_URI from env:', process.env.MONGODB_URI);
// const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/landlord-no-agent';
const MONGO_URI = process.env.MONGODB_URI 

// ===== 🌐 CORS Configuration (MUST BE BEFORE OTHER MIDDLEWARE) =====
// Get allowed origins from environment or use defaults
const getAllowedOrigins = () => {
  const origins = [
    'http://localhost:3000',
    'https://landlordnoagent.vercel.app',
    'https://landlord-no-agent-frontend.vercel.app' // Actual Vercel frontend URL
  ];
  
  // Add any additional origins from environment variable
  if (process.env.FRONTEND_URL) {
    const envOrigins = process.env.FRONTEND_URL.split(',').map(url => url.trim());
    origins.push(...envOrigins);
  }
  
  return [...new Set(origins)]; // Remove duplicates
};

const allowedOrigins = getAllowedOrigins();
console.log('🌐 Allowed CORS origins:', allowedOrigins);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. mobile apps / Postman / server-to-server)
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`⚠️  CORS blocked origin: ${origin}`);
      callback(new Error(`Not allowed by CORS. Origin: ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400, // 24 hours - cache preflight requests
  preflightContinue: false,
  optionsSuccessStatus: 204
};

// Apply CORS middleware FIRST, before other middleware
app.use(cors(corsOptions));

// Handle preflight requests explicitly for all routes
app.options('*', (req, res) => {
  const origin = req.headers.origin;
  
  if (!origin || allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Max-Age', '86400');
    return res.status(204).send();
  } else {
    return res.status(403).json({ message: 'Not allowed by CORS' });
  }
});

// ===== 🧰 Security middleware =====
// Configure helmet to work with CORS
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false
}));
app.use(morgan('combined'));

// ===== 🧱 Rate Limiting =====
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP
});
// app.use(limiter);

// 
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    return next(); // skip rate limiting
  }
  limiter(req, res, next);
});



// Handle preflight explicitly
// app.options('*', cors());

// ===== 🧱 Rate Limiting =====
// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000,
//   max: 100,
// });
// app.use(limiter);




// ===== 📦 Body Parsing =====
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ===== 🖼️ Static Files =====
// Fix Chrome blocking images from different origin
app.use('/uploads', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
  res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
  next();
});

app.use('/uploads', express.static('uploads'));

// ===== 🧠 MongoDB Connection =====
const connectDB = async () => {
  try {
    console.log(`📡 Connecting to MongoDB at: ${MONGO_URI}`);
    await mongoose.connect(MONGO_URI);
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    // process.exit(1);
    console.log('⚠️  Continuing without database - some features may not work');
    // Don't exit - let the server run without database for testing
  }
};

// ===== 🛣️ Routes =====
app.use('/api/auth', require('./routes/auth'));
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
app.use('/api/stripe', require('./routes/stripe'));
app.use('/api/health', require('./routes/health'));

// ===== 🩺 Health Check =====
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    mongoURI: MONGO_URI.includes('mongodb+srv') ? 'Atlas (Cloud)' : 'Local',
    allowedOrigins: allowedOrigins
  });
});

// ===== 🧪 CORS Test Endpoint =====
app.get('/api/cors-test', (req, res) => {
  const origin = req.headers.origin;
  res.json({
    message: 'CORS test successful',
    origin: origin,
    allowed: origin ? allowedOrigins.includes(origin) : 'No origin header',
    allowedOrigins: allowedOrigins
  });
});

// ===== 🧯 Error Handling =====
app.use((err, req, res, next) => {
  console.error('🔥 Error:', err.stack);
  
  // Handle CORS errors specifically
  if (err.message && err.message.includes('CORS')) {
    const origin = req.headers.origin;
    console.error(`🚫 CORS Error for origin: ${origin}`);
    return res.status(403).json({
      message: 'CORS policy violation',
      error: process.env.NODE_ENV === 'development' ? err.message : 'Origin not allowed'
    });
  }
  
  res.status(500).json({
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// ===== 🚪 404 Handler =====
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// ===== 🚀 Start Server =====
// const startServer = async () => {
//   await connectDB();
//   app.listen(PORT, () => {
//     console.log(`🚀 Server running on http://localhost:${PORT}`);
//     console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
//   });

//   server.on('error', (err) => {
//     if (err.code === 'EADDRINUSE') {
//       console.log(`❌ Port ${PORT} is busy. Trying port ${PORT + 1}...`);
//       app.listen(PORT + 1, () => {
//         console.log(`🚀 Server running on port ${PORT + 1}`);
//       });
//     } else {
//       console.error(err);
//     }})

// };

const startServer = async () => {
  await connectDB();

  let currentPort = PORT;
  let server = app.listen(currentPort, () => {
    console.log(`🚀 Server running on http://localhost:${currentPort}`);
    console.log(`📊 Health check: http://localhost:${currentPort}/api/health`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`❌ Port ${currentPort} is busy. Trying port ${currentPort + 1}...`);
      currentPort++;
      server = app.listen(currentPort, () => {
        console.log(`🚀 Server running on http://localhost:${currentPort}`);
      });
    } else {
      console.error('Server error:', err);
    }
  });
};


startServer();
