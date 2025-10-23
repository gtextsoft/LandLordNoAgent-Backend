const mongoose = require('mongoose');
const User = require('./models/User');

// Connect to MongoDB
const MONGO_URI = process.env.MONGODB_URI || 'mongodb+srv://gvest_new209030:EDw69JyAaU7BNFuQ@gtextcluster.3g8di.mongodb.net/LandlordNoAgent';

async function createAdmin() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    // Admin credentials - CHANGE THESE!
    const adminData = {
      email: 'admin@landlordnoagent.com',
      password: 'Admin@123456',  // Change this password!
      role: 'admin',
      firstName: 'Admin',
      lastName: 'User',
      phone: '+1234567890',
      isEmailVerified: true  // Admin is pre-verified
    };

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: adminData.email });
    
    if (existingAdmin) {
      console.log('❌ Admin user already exists with email:', adminData.email);
      console.log('If you want to reset the password, please delete the user first from MongoDB');
      process.exit(1);
    }

    // Create admin user
    const admin = new User(adminData);
    await admin.save();
    
    console.log('✅ Admin user created successfully!');
    console.log('');
    console.log('📧 Email:', adminData.email);
    console.log('🔑 Password:', adminData.password);
    console.log('');
    console.log('⚠️  IMPORTANT: Please change the password after your first login!');
    console.log('');
    console.log('🚀 You can now login at: http://localhost:3000/auth');
    console.log('   Select your role, enter credentials, and access the admin dashboard at: http://localhost:3000/admin/dashboard');
    
    process.exit(0);

  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    process.exit(1);
  }
}

createAdmin();

