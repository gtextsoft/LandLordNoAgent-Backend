const mongoose = require('mongoose');

/**
 * Review Model
 * Stores reviews/ratings submitted by clients for properties and landlords
 */
const reviewSchema = new mongoose.Schema({
  // References
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    required: true
  },
  reviewer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  landlord: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  application: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Application'
  },

  // Review Content
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  comment: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000
  },

  // Privacy Settings
  isAnonymous: {
    type: Boolean,
    default: false
  },

  // Verification
  isVerified: {
    type: Boolean,
    default: false // Verified if reviewer actually rented the property
  },
  verifiedAt: Date,

  // Helpful Count
  helpfulCount: {
    type: Number,
    default: 0
  },
  helpfulUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],

  // Moderation
  isModerated: {
    type: Boolean,
    default: false
  },
  moderatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  moderatedAt: Date,
  moderationStatus: {
    type: String,
    enum: ['approved', 'flagged', 'hidden', 'deleted'],
    default: 'approved'
  },
  moderationReason: String,

  // Response from Landlord
  landlordResponse: {
    comment: String,
    respondedAt: Date
  },

  // Status
  status: {
    type: String,
    enum: ['pending', 'published', 'hidden', 'deleted'],
    default: 'published'
  }
}, {
  timestamps: true
});

// Indexes for performance
reviewSchema.index({ property: 1, status: 1, createdAt: -1 });
reviewSchema.index({ reviewer: 1 });
reviewSchema.index({ landlord: 1 });
reviewSchema.index({ rating: 1 });
reviewSchema.index({ isVerified: 1, status: 1 });

// Virtual for average rating calculation (used in aggregation)
reviewSchema.virtual('isVisible').get(function() {
  return this.status === 'published' && this.moderationStatus === 'approved';
});

// Method to check if user can review (must have completed rental)
reviewSchema.statics.canReview = async function(userId, propertyId) {
  const Application = mongoose.model('Application');
  const completedApplication = await Application.findOne({
    client: userId,
    property: propertyId,
    status: 'approved'
  });
  return !!completedApplication;
};

// Method to check if user already reviewed
reviewSchema.statics.hasReviewed = async function(userId, propertyId) {
  const existingReview = await this.findOne({
    reviewer: userId,
    property: propertyId,
    status: { $in: ['published', 'pending'] }
  });
  return !!existingReview;
};

module.exports = mongoose.model('Review', reviewSchema);

