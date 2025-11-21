const express = require('express');
const User = require('../models/User');
const { verifyToken, authorize } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/users/profile
// @desc    Get current user profile
// @access  Private
router.get('/profile', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json({ user });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Server error while fetching profile' });
  }
});

// @route   PUT /api/users/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', verifyToken, async (req, res) => {
  try {
    const allowedUpdates = [
      'firstName', 'lastName', 'phone', 'profile', 'preferences'
    ];
    
    const updates = {};
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    const user = await User.findByIdAndUpdate(
      req.user._id,
      updates,
      { new: true, runValidators: true }
    ).select('-password');

    res.json({
      message: 'Profile updated successfully',
      user
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Server error while updating profile' });
  }
});

// @route   POST /api/users/upload-kyc
// @desc    Upload KYC documents
// @access  Private
router.post('/upload-kyc', verifyToken, async (req, res) => {
  try {
    const { documents } = req.body;

    if (!documents || !Array.isArray(documents)) {
      return res.status(400).json({ message: 'Documents array is required' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Add new documents to KYC
    user.kyc.documents.push(...documents.map(doc => ({
      type: doc.type,
      url: doc.url,
      status: 'pending'
    })));

    // Set KYC status to pending when documents are uploaded
    if (user.kyc.status === 'pending' || user.kyc.documents.length > 0) {
      user.kyc.status = 'pending';
    }

    await user.save();

    res.json({
      message: 'KYC documents uploaded successfully',
      kyc: user.kyc
    });

  } catch (error) {
    console.error('Upload KYC error:', error);
    res.status(500).json({ message: 'Server error while uploading KYC documents' });
  }
});

// @route   GET /api/users/kyc-status
// @desc    Get KYC status
// @access  Private
router.get('/kyc-status', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('kyc');
    res.json({ kyc: user.kyc });
  } catch (error) {
    console.error('Get KYC status error:', error);
    res.status(500).json({ message: 'Server error while fetching KYC status' });
  }
});

// @route   GET /api/users/notifications
// @desc    Get user notifications
// @access  Private
router.get('/notifications', verifyToken, async (req, res) => {
  try {
    // This would typically fetch from a notifications collection
    // For now, return empty array
    res.json({ notifications: [] });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ message: 'Server error while fetching notifications' });
  }
});

// @route   PUT /api/users/notifications/:id/read
// @desc    Mark notification as read
// @access  Private
router.put('/notifications/:id/read', verifyToken, async (req, res) => {
  try {
    // This would typically update a notifications collection
    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    console.error('Mark notification as read error:', error);
    res.status(500).json({ message: 'Server error while updating notification' });
  }
});

// @route   PUT /api/users/notifications/read-all
// @desc    Mark all notifications as read
// @access  Private
router.put('/notifications/read-all', verifyToken, async (req, res) => {
  try {
    // This would typically update all notifications for the user
    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark all notifications as read error:', error);
    res.status(500).json({ message: 'Server error while updating notifications' });
  }
});

// @route   GET /api/users/saved-properties
// @desc    Get user's saved properties
// @access  Private
router.get('/saved-properties', verifyToken, async (req, res) => {
  try {
    // This would typically fetch from a saved properties collection
    // For now, return empty array
    res.json({ savedProperties: [] });
  } catch (error) {
    console.error('Get saved properties error:', error);
    res.status(500).json({ message: 'Server error while fetching saved properties' });
  }
});

// @route   POST /api/users/saved-properties
// @desc    Save/unsave property
// @access  Private
router.post('/saved-properties', verifyToken, async (req, res) => {
  try {
    const { propertyId, action } = req.body; // action: 'save' or 'unsave'

    if (!propertyId || !action) {
      return res.status(400).json({ message: 'Property ID and action are required' });
    }

    // This would typically update a saved properties collection
    res.json({ 
      message: `Property ${action === 'save' ? 'saved' : 'removed'} successfully` 
    });

  } catch (error) {
    console.error('Save property error:', error);
    res.status(500).json({ message: 'Server error while saving property' });
  }
});

// Admin routes
// @route   GET /api/users/admin/all
// @desc    Get all users (Admin only)
// @access  Private (Admin)
router.get('/admin/all', verifyToken, authorize('admin'), async (req, res) => {
  try {
    const { role, status, page = 1, limit = 20 } = req.query;
    
    const filters = {};
    if (role) filters.role = role;
    if (status) filters.isActive = status === 'active';

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const users = await User.find(filters)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await User.countDocuments(filters);

    res.json({
      users,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total,
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ message: 'Server error while fetching users' });
  }
});

// @route   PUT /api/users/admin/:id/status
// @desc    Update user status (Admin only)
// @access  Private (Admin)
router.put('/admin/:id/status', verifyToken, authorize('admin'), async (req, res) => {
  try {
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ message: 'isActive must be a boolean value' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
      user
    });

  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({ message: 'Server error while updating user status' });
  }
});

// @route   PUT /api/users/admin/:id/kyc
// @desc    Update KYC status (Admin only)
// @access  Private (Admin)
router.put('/admin/:id/kyc', verifyToken, authorize('admin'), async (req, res) => {
  try {
    const { status, rejectedReason } = req.body;

    if (!['pending', 'verified', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid KYC status' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.kyc.status = status;
    if (status === 'verified') {
      user.kyc.verifiedAt = new Date();
      user.kyc.rejectedReason = undefined;
      // Set user as verified when KYC is approved
      user.isVerified = true;
    } else if (status === 'rejected') {
      user.kyc.rejectedReason = rejectedReason;
      user.kyc.verifiedAt = undefined;
      // Set isVerified to false when rejected
      user.isVerified = false;
      
      // Send rejection email to user
      try {
        const { Resend } = require('resend');
        const resendApiKey = process.env.RESEND_API_KEY;
        const fromAddress = process.env.EMAIL_FROM || 'no-reply@landlordnoagent.app';
        
        if (resendApiKey) {
          const resend = new Resend(resendApiKey);
          const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
          const profileUrl = `${frontendUrl}/dashboard/${user.role}/profile`;
          
          const emailHtml = `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f8fafc;">
              <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
                <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 40px 20px; text-align: center;">
                  <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">LandLordNoAgent</h1>
                  <p style="color: #e0e7ff; margin: 8px 0 0 0; font-size: 16px;">KYC Verification Update</p>
                </div>
                <div style="padding: 40px 30px;">
                  <h2 style="color: #dc2626; margin: 0 0 20px 0;">KYC Verification Rejected</h2>
                  <p style="color: #6b7280; line-height: 1.6;">Dear ${user.firstName || 'User'},</p>
                  <p style="color: #6b7280; line-height: 1.6;">Your KYC verification has been reviewed and unfortunately, it has been rejected.</p>
                  <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 20px; margin: 20px 0;">
                    <h3 style="color: #991b1b; margin: 0 0 10px 0; font-size: 16px;">Reason for Rejection:</h3>
                    <p style="color: #7f1d1d; margin: 0; line-height: 1.6;">${rejectedReason || 'Please review your documents and resubmit.'}</p>
                  </div>
                  <p style="color: #6b7280; line-height: 1.6;">Please review the reason above and resubmit your KYC documents with the necessary corrections.</p>
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="${profileUrl}" style="display: inline-block; background-color: #3b82f6; color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: bold;">Resubmit KYC Documents</a>
                  </div>
                  <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">If you have any questions, please contact our support team.</p>
                </div>
              </div>
            </body>
            </html>
          `;
          
          const emailText = `KYC Verification Rejected

Dear ${user.firstName || 'User'},

Your KYC verification has been reviewed and unfortunately, it has been rejected.

Reason for Rejection:
${rejectedReason || 'Please review your documents and resubmit.'}

Please review the reason above and resubmit your KYC documents with the necessary corrections.

Resubmit your documents here: ${profileUrl}

If you have any questions, please contact our support team.`;
          
          await resend.emails.send({
            from: fromAddress,
            to: user.email,
            subject: 'KYC Verification Rejected - Action Required',
            html: emailHtml,
            text: emailText,
          });
          
          console.log(`✅ KYC rejection email sent to ${user.email}`);
        } else {
          console.warn('RESEND_API_KEY not set. KYC rejection email not sent.');
        }
      } catch (emailError) {
        console.error('Error sending KYC rejection email:', emailError);
        // Don't fail the request if email fails
      }
    } else if (status === 'pending') {
      // When revoking, set back to pending and remove verification
      user.kyc.verifiedAt = undefined;
      user.kyc.rejectedReason = undefined;
      user.isVerified = false;
    }

    await user.save();

    res.json({
      message: 'KYC status updated successfully',
      kyc: user.kyc
    });

  } catch (error) {
    console.error('Update KYC status error:', error);
    res.status(500).json({ message: 'Server error while updating KYC status' });
  }
});

module.exports = router;
