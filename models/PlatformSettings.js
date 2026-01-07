const mongoose = require('mongoose');

const platformSettingsSchema = new mongoose.Schema({
  // Commission settings
  commissionRate: {
    type: Number,
    default: 0.10, // 10% default
    min: 0,
    max: 1
  },
  platformFee: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Commission rate change tracking
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  lastUpdatedAt: Date,
  effectiveFrom: {
    type: Date,
    default: Date.now
  },
  changeReason: String,
  
  // Other platform settings
  maxPropertiesPerLandlord: {
    type: Number,
    default: 10
  },
  maxApplicationsPerClient: {
    type: Number,
    default: 5
  },
  autoApproveProperties: {
    type: Boolean,
    default: false
  },
  requireKyc: {
    type: Boolean,
    default: true
  },
  emailNotifications: {
    type: Boolean,
    default: true
  },
  maintenanceMode: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Index for effective date
platformSettingsSchema.index({ effectiveFrom: -1 });

// Static method to get current settings (singleton pattern)
platformSettingsSchema.statics.getCurrent = async function() {
  let settings = await this.findOne().sort({ effectiveFrom: -1 });
  
  if (!settings) {
    // Create default settings if none exist
    settings = await this.create({
      commissionRate: 0.10,
      effectiveFrom: new Date()
    });
  }
  
  return settings;
};

// Static method to update commission rate with audit logging
platformSettingsSchema.statics.updateCommissionRate = async function(newRate, adminId, reason) {
  if (newRate < 0 || newRate > 1) {
    throw new Error('Commission rate must be between 0 and 1');
  }
  
  const current = await this.getCurrent();
  const oldRate = current.commissionRate;
  
  // Update current settings
  current.commissionRate = newRate;
  current.lastUpdatedBy = adminId;
  current.lastUpdatedAt = new Date();
  current.effectiveFrom = new Date();
  current.changeReason = reason;
  
  await current.save();
  
  return {
    oldRate,
    newRate,
    effectiveFrom: current.effectiveFrom,
    reason
  };
};

module.exports = mongoose.model('PlatformSettings', platformSettingsSchema);

