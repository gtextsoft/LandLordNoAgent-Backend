const mongoose = require('mongoose');

/**
 * Dispute
 * A dispute between two users (often tied to a property/application/payment).
 * Admin can move status and add resolution/admin notes.
 */
const DisputeSchema = new mongoose.Schema(
  {
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reportedUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    disputeType: {
      type: String,
      enum: ['payment', 'property', 'behavior', 'fraud', 'other'],
      required: true,
      index: true
    },
    title: { type: String, required: true, maxlength: 200 },
    description: { type: String, required: true, maxlength: 6000 },
    evidence: { type: String }, // URL (optional)

    // Optional references (string so we don't tightly couple schemas here)
    propertyId: { type: String, index: true },
    applicationId: { type: String, index: true },

    status: {
      type: String,
      enum: ['open', 'under_review', 'resolved', 'closed'],
      default: 'open',
      index: true
    },
    resolution: { type: String, maxlength: 6000 },
    adminNotes: { type: String, maxlength: 6000 }
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

DisputeSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Dispute', DisputeSchema);

