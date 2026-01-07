const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true
  },
  entityType: {
    type: String,
    default: 'System'
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: false
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  ipAddress: String,
  userAgent: String
}, {
  timestamps: true
});

// Indexes for performance
auditLogSchema.index({ entityType: 1, entityId: 1 });
auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });

// Static method to log commission rate change
auditLogSchema.statics.logCommissionRateChange = async function(userId, oldRate, newRate, effectiveFrom, reason, ipAddress, userAgent) {
  // Get the current PlatformSettings document ID
  const PlatformSettings = mongoose.model('PlatformSettings');
  const settings = await PlatformSettings.getCurrent();
  
  return this.create({
    action: 'commission_rate_changed',
    entityType: 'PlatformSettings',
    entityId: settings._id,
    userId,
    details: {
      oldRate,
      newRate,
      effectiveFrom,
      reason
    },
    ipAddress,
    userAgent
  });
};

// Static method to log commission calculation
auditLogSchema.statics.logCommissionCalculation = function(userId, paymentId, grossAmount, commissionRate, commissionAmount, netAmount, landlordId, ipAddress, userAgent) {
  return this.create({
    action: 'payment_commission_calculated',
    entityType: 'Payment',
    entityId: paymentId,
    userId,
    details: {
      paymentId: paymentId.toString(),
      grossAmount,
      commissionRate,
      commissionAmount,
      netAmount,
      landlordId: landlordId ? landlordId.toString() : null
    },
    ipAddress,
    userAgent
  });
};

module.exports = mongoose.model('AuditLog', auditLogSchema);

