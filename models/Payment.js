const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  application: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Application',
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'NGN'
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'pending'
  },
  type: {
    type: String,
    enum: ['application_fee', 'rent', 'deposit', 'maintenance', 'other'],
    required: true
  },
  
  // Stripe Information
  stripePaymentIntentId: String,
  stripeSessionId: String,
  stripeChargeId: String,
  
  // Payment Details
  paymentMethod: {
    type: String,
    enum: ['card', 'bank_transfer', 'cash', 'other'],
    default: 'card'
  },
  last4: String, // Last 4 digits of card
  brand: String, // Card brand (visa, mastercard, etc.)
  
  // Failure Information
  failureReason: String,
  failureCode: String,
  
  // Refund Information
  refundAmount: Number,
  refundReason: String,
  refundedAt: Date,
  
  // Escrow Information
  isEscrow: {
    type: Boolean,
    default: false
  },
  escrowStatus: {
    type: String,
    enum: ['held', 'released', 'refunded'],
    default: null
  },
  escrowHeldAt: Date,
  escrowReleasedAt: Date,
  escrowExpiresAt: Date, // 10 days from payment
  escrowInterest: {
    type: Number,
    default: 0
  },
  propertyVisited: {
    type: Boolean,
    default: false
  },
  documentsReceived: {
    type: Boolean,
    default: false
  },
  
  // Commission (removed - set to 0)
  commission_rate: {
    type: Number,
    default: 0
  },
  commission_amount: {
    type: Number,
    default: 0
  },
  
  // Metadata
  description: String,
  metadata: mongoose.Schema.Types.Mixed,
  
  // Timestamps
  processedAt: Date,
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for performance
paymentSchema.index({ application: 1 });
paymentSchema.index({ user: 1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ type: 1 });
paymentSchema.index({ createdAt: -1 });
paymentSchema.index({ stripePaymentIntentId: 1 });

// Virtual for formatted amount
paymentSchema.virtual('formattedAmount').get(function() {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: this.currency || 'NGN'
  }).format(this.amount);
});

// Static method to get payment statistics
paymentSchema.statics.getPaymentStats = function(userId, startDate, endDate) {
  const match = { user: userId };
  if (startDate && endDate) {
    match.createdAt = { $gte: startDate, $lte: endDate };
  }

  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' }
      }
    }
  ]);
};

// Static method to get revenue by period
paymentSchema.statics.getRevenueByPeriod = function(startDate, endDate) {
  const match = { 
    status: 'completed',
    createdAt: { $gte: startDate, $lte: endDate }
  };

  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' }
        },
        totalRevenue: { $sum: '$amount' },
        paymentCount: { $sum: 1 }
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } }
  ]);
};

module.exports = mongoose.model('Payment', paymentSchema);