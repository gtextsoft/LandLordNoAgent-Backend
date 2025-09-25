import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import { config, validateConfig } from './config';
import { logger, morganStream } from './config/logger';
import { connectDatabase, checkDatabaseHealth, createIndexes } from './config/database';
import { swaggerSpec } from './config/swagger';

// Import routes
import authRoutes from './routes/auth';
import propertyRoutes from './routes/property';
import applicationRoutes from './routes/application';
import uploadRoutes from './routes/upload';
import kycRoutes from './routes/kyc';
import notificationRoutes from './routes/notification';
import paymentRoutes from './routes/payment';
import chatRoutes from './routes/chat';
import adminRoutes from './routes/admin';
import clientRoutes from './routes/client';

// Import middleware
import { errorHandler } from './middleware/errorHandler';

// Create Express app
const app = express();

// Validate configuration on startup
validateConfig();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS configuration
app.use(cors({
  origin: config.server.corsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Compression middleware
app.use(compression());

// Request logging
app.use(morgan('combined', { stream: morganStream }));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: 'Too many requests from this IP, please try again later.',
});

app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Trust proxy for rate limiting and IP detection
app.set('trust proxy', 1);

// Health check endpoint
app.get('/health', async (req: express.Request, res: express.Response) => {
  try {
    const dbHealth = await checkDatabaseHealth();
    
    const healthStatus = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: config.server.nodeEnv,
      version: process.env.npm_package_version || '1.0.0',
      database: {
        connected: dbHealth.isConnected,
        collectionsCount: dbHealth.collectionsCount,
        hasRequiredCollections: dbHealth.hasRequiredCollections,
      },
    };

    if (!dbHealth.isConnected || !dbHealth.hasRequiredCollections) {
      return res.status(503).json({
        ...healthStatus,
        status: 'error',
        database: {
          ...healthStatus.database,
          errors: dbHealth.errors,
        },
      });
    }

    return res.status(200).json(healthStatus);
  } catch (error) {
    logger.error('Health check error:', error);
    return res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
    });
  }
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/kyc', kycRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/client', clientRoutes);

// Swagger API Documentation
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'LandLordNoAgent API Documentation',
}));

// Root endpoint
app.get('/', (req: express.Request, res: express.Response) => {
  res.json({
    success: true,
    message: 'LandlordNoAgent API Server',
    version: '1.0.0',
    status: 'running',
    documentation: '/api/docs',
    health: '/health',
    endpoints: {
      auth: '/api/auth',
      properties: '/api/properties',
      applications: '/api/applications',
      payments: '/api/payments',
      admin: '/api/admin',
      health: '/health',
    },
  });
});

// API documentation endpoint
app.get('/api', (req: express.Request, res: express.Response) => {
  res.json({
    success: true,
    message: 'LandlordNoAgent API',
    version: '1.0.0',
    documentation: '/api/docs',
    endpoints: {
      auth: '/api/auth',
      properties: '/api/properties',
      applications: '/api/applications',
      payments: '/api/payments',
      admin: '/api/admin',
      health: '/health',
    },
  });
});

// 404 handler
app.use('*', (req: express.Request, res: express.Response) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.originalUrl,
  });
});

// Global error handler
app.use(errorHandler);

// Graceful shutdown handling
const gracefulShutdown = async (signal: string) => {
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  
  try {
    // Close database connection
    console.log('🔄 Closing database connection...');
    const { disconnectDatabase } = await import('./config/database');
    await disconnectDatabase();
    console.log('✅ Database connection closed');
    
    // Close server
    server.close(() => {
      console.log('✅ HTTP server closed');
      console.log('👋 Server shutdown complete');
      logger.info('HTTP server closed');
      process.exit(0);
    });
    
    // Force close after 30 seconds
    setTimeout(() => {
      console.error('⏰ Could not close connections in time, forcefully shutting down');
      logger.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 30000);
  } catch (error) {
    console.error('❌ Error during graceful shutdown:', error);
    logger.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
};

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle SIGTERM
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle SIGINT
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
const startServer = async () => {
  try {
    // Display startup banner
    console.log('\n' + '='.repeat(60));
    console.log('🚀 LANDLORD NO AGENT - BACKEND SERVER STARTING');
    console.log('='.repeat(60));
    console.log(`📋 Configuration:`);
    console.log(`   🔧 Environment: ${config.server.nodeEnv}`);
    console.log(`   🌐 Port: ${config.server.port}`);
    console.log(`   🔗 CORS Origin: ${config.server.corsOrigin}`);
    console.log(`   🗄️  Database URL: ${config.database.url.replace(/\/\/.*@/, '//***:***@')}`); // Hide credentials
    console.log('='.repeat(60));
    
    // Connect to database
    console.log('📡 Connecting to MongoDB...');
    await connectDatabase();
    console.log('✅ Database connected successfully');
    logger.info('Database connected successfully');

    // Create database indexes
    console.log('🔧 Creating database indexes...');
    await createIndexes();
    console.log('✅ Database indexes created successfully');
    logger.info('Database indexes created successfully');

    // Start HTTP server
    const server = app.listen(config.server.port, async () => {
      console.log('\n' + '='.repeat(60));
      console.log('🎉 SERVER STARTED SUCCESSFULLY!');
      console.log('='.repeat(60));
      console.log(`🌐 Server running on: http://localhost:${config.server.port}`);
      console.log(`📊 Environment: ${config.server.nodeEnv}`);
      console.log(`🔗 CORS origin: ${config.server.corsOrigin}`);
      console.log(`📚 API Documentation: http://localhost:${config.server.port}/api/docs`);
      console.log(`❤️  Health Check: http://localhost:${config.server.port}/health`);
      console.log('='.repeat(60));
      
      // Test database connection
      try {
        const dbHealth = await checkDatabaseHealth();
        console.log(`\n🔍 Database Status:`);
        console.log(`   ${dbHealth.isConnected ? '✅' : '❌'} Connected: ${dbHealth.isConnected}`);
        console.log(`   📊 Collections: ${dbHealth.collectionsCount}`);
        console.log(`   ${dbHealth.hasRequiredCollections ? '✅' : '❌'} Required Collections: ${dbHealth.hasRequiredCollections}`);
        if (dbHealth.errors.length > 0) {
          console.log(`   ⚠️  Errors: ${dbHealth.errors.join(', ')}`);
        }
        console.log('='.repeat(60) + '\n');
      } catch (error) {
        console.log(`\n❌ Database health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        console.log('='.repeat(60) + '\n');
      }
      
      // Also log to file
      logger.info(`Server running on port ${config.server.port}`);
      logger.info(`Environment: ${config.server.nodeEnv}`);
      logger.info(`CORS origin: ${config.server.corsOrigin}`);
      logger.info(`API Documentation: http://localhost:${config.server.port}/api/docs`);
      logger.info(`Health Check: http://localhost:${config.server.port}/health`);
    });

    // Handle server errors
    server.on('error', (error: any) => {
      console.error('❌ Server error:', error);
      logger.error('Server error:', error);
      process.exit(1);
    });

    return server;
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
let server: any;

startServer().then((s) => {
  server = s;
}).catch((error: any) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});

export default app;