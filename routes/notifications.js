const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const { verifyToken } = require('../middleware/auth');

/**
 * GET /api/notifications
 * Get notifications for current user
 * @access Private
 */
router.get('/', verifyToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, unreadOnly = false, type } = req.query;
    
    const userId = req.user._id;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const query = { user: userId, isActive: true };
    
    if (unreadOnly === 'true') {
      query.isRead = false;
    }
    
    if (type) {
      query.type = type;
    }
    
    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .populate('relatedEntity.id', 'title name email');
    
    const total = await Notification.countDocuments(query);
    const unreadCount = await Notification.countDocuments({ 
      user: userId, 
      isRead: false, 
      isActive: true 
    });
    
    res.json({
      notifications,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total,
        limit: parseInt(limit)
      },
      unreadCount
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ message: 'Server error while fetching notifications' });
  }
});

/**
 * GET /api/notifications/unread-count
 * Get unread notification count
 * @access Private
 */
router.get('/unread-count', verifyToken, async (req, res) => {
  try {
    const unreadCount = await Notification.countDocuments({ 
      user: req.user._id, 
      isRead: false, 
      isActive: true 
    });
    
    res.json({ unreadCount });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ message: 'Server error while fetching unread count' });
  }
});

/**
 * GET /api/notifications/:id
 * Get single notification
 * @access Private
 */
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      user: req.user._id
    }).populate('relatedEntity.id');
    
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    
    res.json({ notification });
  } catch (error) {
    console.error('Get notification error:', error);
    res.status(500).json({ message: 'Server error while fetching notification' });
  }
});

/**
 * PATCH /api/notifications/:id/read
 * Mark notification as read
 * @access Private
 */
router.patch('/:id/read', verifyToken, async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      user: req.user._id
    });
    
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    
    await notification.markAsRead();
    
    res.json({ message: 'Notification marked as read', notification });
  } catch (error) {
    console.error('Mark notification as read error:', error);
    res.status(500).json({ message: 'Server error while updating notification' });
  }
});

/**
 * PATCH /api/notifications/read-all
 * Mark all notifications as read
 * @access Private
 */
router.patch('/read-all', verifyToken, async (req, res) => {
  try {
    const result = await Notification.markAllAsRead(req.user._id);
    
    res.json({ 
      message: 'All notifications marked as read',
      updatedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Mark all notifications as read error:', error);
    res.status(500).json({ message: 'Server error while updating notifications' });
  }
});

/**
 * DELETE /api/notifications/:id
 * Delete notification
 * @access Private
 */
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      user: req.user._id
    });
    
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    
    // Soft delete by marking as inactive
    notification.isActive = false;
    await notification.save();
    
    res.json({ message: 'Notification deleted successfully' });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ message: 'Server error while deleting notification' });
  }
});

/**
 * POST /api/notifications/payment-received
 * Send payment received notification to landlord
 * @access Private (called internally or via webhook)
 */
router.post('/payment-received', async (req, res) => {
  try {
    const { paymentId } = req.body;

    if (!paymentId) {
      return res.status(400).json({ error: 'Missing payment ID' });
    }

    // This endpoint is kept for backward compatibility
    // Payment notifications should be created via notification service
    console.log('Payment notification endpoint called for payment:', paymentId);

    res.json({
      success: true,
      message: 'Payment notification endpoint (use notification service instead)',
    });
  } catch (error) {
    console.error('Notification error:', error);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

module.exports = router;

