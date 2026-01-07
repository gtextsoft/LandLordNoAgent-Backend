const mongoose = require('mongoose');

const landlordAccountSchema = new mongoose.Schema({
  landlord: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  
  // Earnings tracking
  totalGrossEarnings: {
    type: Number,
    default: 0,
    min: 0
  },
  totalCommissionPaid: {
    type: Number,
    default: 0,
    min: 0
  },
  totalNetEarnings: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Balance tracking
  availableBalance: {
    type: Number,
    default: 0,
    min: 0
  },
  pendingBalance: {
    type: Number,
    default: 0,
    min: 0
  },
  totalPayouts: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Account status
  accountStatus: {
    type: String,
    enum: ['active', 'suspended', 'closed'],
    default: 'active'
  },
  
  // KYC verification
  kycVerified: {
    type: Boolean,
    default: false
  },
  kycVerifiedAt: Date,
  
  // Last payout tracking
  lastPayoutAt: Date
}, {
  timestamps: true
});

// Indexes for performance
landlordAccountSchema.index({ landlord: 1 }, { unique: true });
landlordAccountSchema.index({ accountStatus: 1 });
landlordAccountSchema.index({ kycVerified: 1 });

// Virtual to verify data consistency
landlordAccountSchema.virtual('isConsistent').get(function() {
  const calculatedNet = this.totalGrossEarnings - this.totalCommissionPaid;
  return Math.abs(this.totalNetEarnings - calculatedNet) < 0.01; // Allow small floating point differences
});

// Method to update balances
landlordAccountSchema.methods.updateBalance = function(grossAmount, commissionAmount, netAmount, type = 'available') {
  this.totalGrossEarnings += grossAmount;
  this.totalCommissionPaid += commissionAmount;
  this.totalNetEarnings += netAmount;
  
  if (type === 'available') {
    this.availableBalance += netAmount;
  } else if (type === 'pending') {
    this.pendingBalance += netAmount;
  }
  
  return this.save();
};

module.exports = mongoose.model('LandlordAccount', landlordAccountSchema);

