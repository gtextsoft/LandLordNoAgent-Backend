import mongoose from 'mongoose';
import { config } from './index';
import { logger } from './logger';

// MongoDB connection options
const mongoOptions = {
  maxPoolSize: 10, // Maintain up to 10 socket connections
  serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
  socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
  bufferCommands: false, // Disable mongoose buffering
};

// Function to connect to MongoDB
export async function connectDatabase(): Promise<void> {
  try {
    // Set mongoose options
    mongoose.set('strictQuery', false);
    
    // Extract database name from URL for logging
    const dbUrl = new URL(config.database.url);
    const dbName = dbUrl.pathname.substring(1); // Remove leading slash
    const dbHost = dbUrl.hostname;
    const dbPort = dbUrl.port || '27017';
    
    console.log(`📡 Connecting to MongoDB at ${dbHost}:${dbPort}/${dbName}...`);
    
    // Connect to MongoDB
    await mongoose.connect(config.database.url, mongoOptions);
    
    // Get connection details
    const connectionState = mongoose.connection.readyState;
    const connectionStates = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    
    console.log(`✅ Successfully connected to MongoDB`);
    console.log(`   📍 Host: ${dbHost}:${dbPort}`);
    console.log(`   🗄️  Database: ${dbName}`);
    console.log(`   🔗 Connection State: ${connectionStates[connectionState as keyof typeof connectionStates]}`);
    
    logger.info(`Successfully connected to MongoDB at ${dbHost}:${dbPort}/${dbName}`);
    logger.info(`Connection state: ${connectionStates[connectionState as keyof typeof connectionStates]}`);
    
    // Handle connection events
    mongoose.connection.on('connected', () => {
      console.log('🟢 MongoDB connection established');
      logger.info('Mongoose connected to MongoDB');
    });

    mongoose.connection.on('error', (error) => {
      console.error('🔴 MongoDB connection error:', error.message);
      logger.error('Mongoose connection error:', error);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('🟡 MongoDB disconnected');
      logger.warn('Mongoose disconnected from MongoDB');
    });

    // Handle process termination
    process.on('SIGINT', async () => {
      console.log('🔄 Closing MongoDB connection...');
      await mongoose.connection.close();
      console.log('✅ MongoDB connection closed');
      logger.info('Mongoose connection closed through app termination');
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error instanceof Error ? error.message : 'Unknown error');
    logger.error('Failed to connect to MongoDB:', error);
    throw error;
  }
}

// Function to disconnect from MongoDB
export async function disconnectDatabase(): Promise<void> {
  try {
    await mongoose.connection.close();
    logger.info('Successfully disconnected from MongoDB');
  } catch (error) {
    logger.error('Failed to disconnect from MongoDB:', error);
    throw error;
  }
}

// Function to check database health
export async function checkDatabaseHealth(): Promise<{
  isConnected: boolean;
  collectionsCount: number;
  hasRequiredCollections: boolean;
  errors: string[];
}> {
  const errors: string[] = [];
  let isConnected = false;
  let collectionsCount = 0;
  let hasRequiredCollections = false;

  try {
    // Check connection status
    isConnected = mongoose.connection.readyState === 1;

    if (isConnected && mongoose.connection.db) {
      // Get collections count
      const collections = await mongoose.connection.db.listCollections().toArray();
      collectionsCount = collections.length;

      // Check for required collections
      const requiredCollections = [
        'users', 'properties', 'applications', 'payments', 
        'chatmessages', 'notifications'
      ];

      const existingCollectionNames = collections.map(col => col.name);
      hasRequiredCollections = requiredCollections.every(
        collection => existingCollectionNames.includes(collection)
      );

      if (!hasRequiredCollections) {
        const missingCollections = requiredCollections.filter(
          collection => !existingCollectionNames.includes(collection)
        );
        errors.push(`Missing required collections: ${missingCollections.join(', ')}`);
      }
    } else {
      errors.push('Database connection is not established');
    }

  } catch (error) {
    errors.push(`Database health check error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return {
    isConnected,
    collectionsCount,
    hasRequiredCollections,
    errors
  };
}

// Function to create indexes for all models
export async function createIndexes(): Promise<void> {
  try {
    // Import all models to ensure indexes are created
    await import('../models/User');
    await import('../models/Property');
    await import('../models/Application');
    await import('../models/Payment');
    await import('../models/ChatMessage');
    await import('../models/Notification');
    
    logger.info('Database indexes created successfully');
  } catch (error) {
    logger.error('Error creating database indexes:', error);
    throw error;
  }
}

// Function to drop database (for testing)
export async function dropDatabase(): Promise<void> {
  try {
    if (mongoose.connection.db) {
      await mongoose.connection.db.dropDatabase();
      logger.info('Database dropped successfully');
    } else {
      throw new Error('Database connection not established');
    }
  } catch (error) {
    logger.error('Error dropping database:', error);
    throw error;
  }
}

// Export mongoose instance
export { mongoose };
export default connectDatabase;