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
    } else if (status === 'rejected') {
      user.kyc.rejectedReason = rejectedReason;
      user.kyc.verifiedAt = undefined;
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
