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

// ===== 🧰 Security middleware =====
app.use(helmet());
app.use(morgan('combined'));

// ===== 🧱 Rate Limiting =====
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP
});
// app.use(limiter);

// // ===== 🌐 CORS Configuration =====
// app.use(cors({
//   origin: process.env.FRONTEND_URL || 'http://localhost:3000',
//   credentials: true
// }));

// ===== 🌐 CORS Configuration =====
// app.use(cors({
//   origin: process.env.FRONTEND_URL || 'http://localhost:3000',
//   credentials: true,
//   methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
//   allowedHeaders: ['Content-Type', 'Authorization']
// }));

const allowedOrigins = [
  'http://localhost:3000',
  'https://landlordnoagent.vercel.app'
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. mobile apps / Postman)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.options('*', cors());

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
    mongoURI: MONGO_URI.includes('mongodb+srv') ? 'Atlas (Cloud)' : 'Local'
  });
});

// ===== 🧯 Error Handling =====
app.use((err, req, res, next) => {
  console.error('🔥 Error:', err.stack);
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
