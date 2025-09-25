import { connectDatabase, disconnectDatabase } from './config/database';
import { config } from './config';
import { logger } from './config/logger';
import User from './models/User';
import bcrypt from 'bcryptjs';

async function seedDatabase() {
  try {
    logger.info('🌱 Starting database seeding...');

    // Connect to database
    await connectDatabase();

    // Check if admin user exists
    const adminExists = await User.findOne({ role: 'ADMIN' });
    
    if (adminExists) {
      logger.info('👤 Admin user already exists. Skipping admin creation.');
    } else {
      // Create default admin user only if environment variables are set
      const adminEmail = process.env.ADMIN_EMAIL;
      const adminPassword = process.env.ADMIN_PASSWORD;
      
      if (!adminEmail || !adminPassword) {
        logger.info('⚠️  ADMIN_EMAIL and ADMIN_PASSWORD environment variables not set. Skipping admin user creation.');
        logger.info('💡 To create an admin user, set ADMIN_EMAIL and ADMIN_PASSWORD in your .env file');
      } else {
        const hashedPassword = await bcrypt.hash(adminPassword, 12);
        
        const adminUser = new User({
          email: adminEmail,
          passwordHash: hashedPassword,
          role: 'ADMIN',
          isVerified: true,
          emailVerifiedAt: new Date(),
          kycData: {
            personalInfo: {
              firstName: 'System',
              lastName: 'Administrator',
              phone: '+1234567890',
              address: '123 Admin Street',
              city: 'Admin City',
              state: 'AC',
              postalCode: '12345',
              dateOfBirth: new Date('1990-01-01'),
              nationality: 'US',
              occupation: 'System Administrator',
              employer: 'LandlordNoAgent',
              monthlyIncome: 0
            }
          }
        });

        await adminUser.save();
        logger.info('👤 Admin user created successfully!');
        logger.info(`📧 Admin Email: ${adminEmail}`);
        logger.info('⚠️  Please change the admin password after first login!');
      }
    }

    // Check total user count
    const userCount = await User.countDocuments();
    logger.info(`📊 Total users in database: ${userCount}`);

    logger.info('✅ Database seeding completed successfully!');
    logger.info('📋 Database is ready for user registration.');

  } catch (error) {
    logger.error('❌ Error during seeding:', error);
    throw error;
  } finally {
    await disconnectDatabase();
  }
}

// Run seeding if this file is executed directly
if (require.main === module) {
  seedDatabase()
    .then(() => {
      logger.info('Seeding completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Seeding failed:', error);
      process.exit(1);
    });
}

export default seedDatabase;
