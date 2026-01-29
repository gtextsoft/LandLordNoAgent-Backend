const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  role: {
    type: String,
    enum: ['landlord', 'client', 'admin'],
    required: true
  },
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: String,
  emailVerificationExpires: Date,
  passwordResetToken: String,
  passwordResetExpires: Date,
  
  // KYC Information
  kyc: {
    status: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: null  // null means user has not applied for KYC yet
    },
    documents: [{
      type: {
        type: String,
        enum: ['id', 'proof_of_address', 'income_proof']
      },
      url: String,
      status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
      },
      uploadedAt: {
        type: Date,
        default: Date.now
      }
    }],
    verifiedAt: Date,
    rejectedReason: String
  },
  
  // Profile Information
  profile: {
    avatar: String,
    bio: String,
    dateOfBirth: Date,
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: String
    }
  },
  
  // Preferences
  preferences: {
    emailNotifications: {
      type: Boolean,
      default: true
    },
    smsNotifications: {
      type: Boolean,
      default: false
    },
    currency: {
      type: String,
      default: 'NGN'
    },
    // Granular email notification preferences
    notificationPreferences: {
      welcome: {
        type: Boolean,
        default: true
      },
      newPropertyListed: {
        type: Boolean,
        default: true
      },
      applicationReceived: {
        type: Boolean,
        default: true
      },
      applicationStatusChange: {
        type: Boolean,
        default: true
      },
      newMessage: {
        type: Boolean,
        default: true
      },
      viewingAppointment: {
        type: Boolean,
        default: true
      },
      maintenanceRequest: {
        type: Boolean,
        default: true
      },
      propertyVerified: {
        type: Boolean,
        default: true
      },
      kycStatus: {
        type: Boolean,
        default: true
      },
      paymentSuccess: {
        type: Boolean,
        default: true
      },
      paymentFailed: {
        type: Boolean,
        default: true
      },
      escrowReleased: {
        type: Boolean,
        default: true
      }
    }
  },
  
  // Payment Account Details (for landlords)
  paymentAccount: {
    accountType: {
      type: String,
      enum: ['bank', 'mobile_money', 'other'],
      default: null
    },
    bankName: String,
    accountName: String,
    accountNumber: String,
    routingNumber: String, // For US banks
    swiftCode: String, // For international transfers
    iban: String, // For European banks
    mobileMoneyProvider: String, // e.g., 'MTN', 'Airtel', 'M-Pesa'
    mobileMoneyNumber: String,
    country: String,
    currency: {
      type: String,
      default: 'NGN'
    },
    verified: {
      type: Boolean,
      default: false
    },
    verifiedAt: Date,
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  
  // Account Status
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: Date,
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: Date
  ,
  // Saved/Favorite properties (client-side feature)
  savedProperties: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property'
  }]
}, {
  timestamps: true
});

// Index for performance
// userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
userSchema.index({ 'kyc.status': 1 });

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Check if account is locked
userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Increment login attempts
userSchema.methods.incLoginAttempts = function() {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  // Lock account after 5 failed attempts for 2 hours
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // 2 hours
  }
  
  return this.updateOne(updates);
};

// Reset login attempts
userSchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 }
  });
};

module.exports = mongoose.model('User', userSchema);