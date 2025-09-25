import dotenv from 'dotenv';
import { logger } from './logger';

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = [
  'MONGODB_URI',
  'JWT_SECRET',
  'PORT',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  logger.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  process.exit(1);
}

// Configuration object
export const config = {
  // Server configuration
  server: {
    port: parseInt(process.env.PORT || '3001', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  },

  // Database configuration
  database: {
    url: process.env.MONGODB_URI!,
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  // Authentication configuration
  auth: {
    jwtSecret: process.env.JWT_SECRET!,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET!,
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
  },

  // Stripe configuration
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY!,
    publicKey: process.env.STRIPE_PUBLIC_KEY!,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
  },

  // Email configuration
  email: {
    resendApiKey: process.env.RESEND_API_KEY!,
    from: process.env.EMAIL_FROM || 'noreply@landlordnoagent.com',
    replyTo: process.env.EMAIL_REPLY_TO || 'support@landlordnoagent.com',
  },

  // Cloudinary configuration
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME!,
    apiKey: process.env.CLOUDINARY_API_KEY!,
    apiSecret: process.env.CLOUDINARY_API_SECRET!,
  },

  // File upload configuration
  upload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10), // 10MB
    allowedImageTypes: (process.env.ALLOWED_IMAGE_TYPES || 'image/jpeg,image/png,image/webp').split(','),
    allowedDocumentTypes: (process.env.ALLOWED_DOCUMENT_TYPES || 'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document').split(','),
  },

  // Rate limiting configuration
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },

  // Platform settings
  platform: {
    commissionRate: parseFloat(process.env.COMMISSION_RATE || '0.05'),
    platformFee: parseFloat(process.env.PLATFORM_FEE || '0'),
  },

  // Monitoring configuration
  monitoring: {
    sentryDsn: process.env.SENTRY_DSN,
  },

  // Security configuration
  security: {
    sessionSecret: process.env.SESSION_SECRET || process.env.JWT_SECRET!,
  },
};

// Validate configuration
export function validateConfig(): void {
  const errors: string[] = [];

  // Validate server port
  if (config.server.port < 1 || config.server.port > 65535) {
    errors.push('Invalid PORT: must be between 1 and 65535');
  }

  // Validate node environment
  if (!['development', 'production', 'test'].includes(config.server.nodeEnv)) {
    errors.push('Invalid NODE_ENV: must be development, production, or test');
  }

  // Validate bcrypt rounds
  if (config.auth.bcryptRounds < 10 || config.auth.bcryptRounds > 15) {
    errors.push('Invalid BCRYPT_ROUNDS: must be between 10 and 15');
  }

  // Validate commission rate
  if (config.platform.commissionRate < 0 || config.platform.commissionRate > 1) {
    errors.push('Invalid COMMISSION_RATE: must be between 0 and 1');
  }

  // Validate platform fee
  if (config.platform.platformFee < 0) {
    errors.push('Invalid PLATFORM_FEE: must be non-negative');
  }

  // Validate file upload size
  if (config.upload.maxFileSize < 1024 || config.upload.maxFileSize > 104857600) {
    errors.push('Invalid MAX_FILE_SIZE: must be between 1KB and 100MB');
  }

  if (errors.length > 0) {
    logger.error('Configuration validation errors:');
    errors.forEach(error => logger.error(`  - ${error}`));
    process.exit(1);
  }

  logger.info('Configuration validated successfully');
}

// Export individual configurations for convenience
export const {
  server,
  database,
  auth,
  stripe,
  email,
  cloudinary: cloudinaryConfig,
  upload,
  rateLimit,
  platform,
  monitoring,
  security,
} = config;

export default config;