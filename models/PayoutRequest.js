const mongoose = require('mongoose');

const payoutRequestSchema = new mongoose.Schema({
  landlord: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  landlordAccount: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LandlordAccount',
    required: true
  },
  
  // Payout amount (net, after commission)
  amount: {
    type: Number,
    required: true,
    min: 50000 // Minimum ₦50,000
  },
  currency: {
    type: String,
    default: 'NGN'
  },
  
  // Payment method
  paymentMethod: {
    type: String,
    enum: ['stripe_connect', 'bank_transfer'],
    required: true
  },
  
  // Bank details for bank transfer
  bankDetails: {
    bankName: String,
    accountName: String,
    accountNumber: String,
    routingNumber: String,
    swiftCode: String,
    iban: String,
    country: String
  },
  
  // Stripe Connect account ID
  stripeAccountId: String,
  
  // Status tracking
  status: {
    type: String,
    enum: ['pending', 'approved', 'processing', 'completed', 'rejected', 'failed'],
    default: 'pending'
  },
  
  // Timestamps
  requestedAt: {
    type: Date,
    default: Date.now
  },
  reviewedAt: Date,
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: Date,
  processedAt: Date,
  completedAt: Date,
  
  // Transfer tracking
  transferId: String, // Stripe transfer ID or bank reference
  
  // Failure/rejection tracking
  failureReason: String,
  rejectionReason: String,
  adminNotes: String,
  
  // Related payments
  relatedPayments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment'
  }]
}, {
  timestamps: true
});

// Indexes for performance
payoutRequestSchema.index({ landlord: 1, status: 1 });
payoutRequestSchema.index({ status: 1, requestedAt: -1 });
payoutRequestSchema.index({ landlordAccount: 1 });

// Virtual for formatted amount
payoutRequestSchema.virtual('formattedAmount').get(function() {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: this.currency || 'NGN'
  }).format(this.amount);
});

module.exports = mongoose.model('PayoutRequest', payoutRequestSchema);

