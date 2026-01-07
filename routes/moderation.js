const express = require('express');
const { verifyToken } = require('../middleware/auth');
const Application = require('../models/Application');
const ModerationViolation = require('../models/ModerationViolation');

const router = express.Router();

/**
 * @route   POST /api/moderation/violations
 * @desc    Log a content moderation violation (best-effort, for admin review)
 * @access  Private
 */
router.post('/violations', verifyToken, async (req, res) => {
  try {
    const {
      applicationId,
      originalMessage,
      violationType,
      violationReason,
      severity
    } = req.body || {};

    if (!applicationId || !originalMessage || !violationType || !violationReason || !severity) {
      return res.status(400).json({ message: 'Missing required violation fields' });
    }

    if (!['blocked', 'warning', 'suspicious'].includes(violationType)) {
      return res.status(400).json({ message: 'Invalid violationType' });
    }

    if (!['high', 'medium', 'low'].includes(severity)) {
      return res.status(400).json({ message: 'Invalid severity' });
    }

    const application = await Application.findById(applicationId).select('client landlord');
    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    const hasAccess =
      req.user.role === 'admin' ||
      application.client.toString() === req.user._id.toString() ||
      application.landlord.toString() === req.user._id.toString();

    if (!hasAccess) {
      return res.status(403).json({ message: 'Not authorized to log violations for this application' });
    }

    const violation = await ModerationViolation.create({
      user: req.user._id,
      application: applicationId,
      originalMessage,
      violationType,
      violationReason,
      severity
    });

    res.status(201).json({ message: 'Violation logged', violationId: violation._id });
  } catch (error) {
    console.error('Log moderation violation error:', error);
    res.status(500).json({ message: 'Server error while logging violation' });
  }
});

module.exports = router;

