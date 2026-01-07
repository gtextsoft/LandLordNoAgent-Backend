const mongoose = require('mongoose');

/**
 * ModerationViolation
 * Logged whenever the frontend moderation detects blocked/flagged content.
 * This powers the admin "Moderation Violations" screen.
 */
const ModerationViolationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    application: { type: mongoose.Schema.Types.ObjectId, ref: 'Application', required: true, index: true },

    originalMessage: { type: String, required: true, maxlength: 5000 },
    violationType: {
      type: String,
      enum: ['blocked', 'warning', 'suspicious'],
      required: true,
      index: true
    },
    violationReason: { type: String, required: true, maxlength: 500 },
    severity: { type: String, enum: ['high', 'medium', 'low'], required: true, index: true }
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

// Helpful for listing screens
ModerationViolationSchema.index({ createdAt: -1 });

module.exports = mongoose.model('ModerationViolation', ModerationViolationSchema);

