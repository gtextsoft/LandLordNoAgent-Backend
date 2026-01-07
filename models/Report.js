const mongoose = require('mongoose');

/**
 * Report
 * A user-submitted report about some content (property/user/application/message/etc).
 * Admin can review and mark resolved/dismissed and record action taken.
 */
const ReportSchema = new mongoose.Schema(
  {
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reportedUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    contentType: {
      type: String,
      enum: ['property', 'user', 'application', 'message', 'other'],
      required: true,
      index: true
    },
    contentId: { type: String }, // Store as string to support multiple model types

    reportReason: {
      type: String,
      enum: ['inappropriate', 'spam', 'fraud', 'harassment', 'fake_listing', 'other'],
      required: true,
      index: true
    },
    description: { type: String, required: true, maxlength: 4000 },
    evidence: { type: String }, // URL (optional)

    status: {
      type: String,
      enum: ['pending', 'under_review', 'resolved', 'dismissed'],
      default: 'pending',
      index: true
    },
    adminNotes: { type: String, maxlength: 4000 },
    actionTaken: { type: String, maxlength: 500 }
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

ReportSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Report', ReportSchema);

