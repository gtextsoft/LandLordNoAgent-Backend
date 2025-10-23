const express = require('express');
const Message = require('../models/Message');
const Application = require('../models/Application');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/messages/application/:applicationId
// @desc    Get messages for an application
// @access  Private
router.get('/application/:applicationId', verifyToken, async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    // Verify user has access to this application
    const application = await Application.findById(applicationId);
    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    const hasAccess = 
      req.user.role === 'admin' ||
      application.client.toString() === req.user._id.toString() ||
      application.landlord.toString() === req.user._id.toString();

    if (!hasAccess) {
      return res.status(403).json({ message: 'Not authorized to view messages for this application' });
    }

    const messages = await Message.getConversation(applicationId, parseInt(page), parseInt(limit));

    res.json({ messages });

  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ message: 'Server error while fetching messages' });
  }
});

// @route   POST /api/messages
// @desc    Send a message
// @access  Private
router.post('/', verifyToken, async (req, res) => {
  try {
    const { applicationId, message, messageType = 'text', attachments = [] } = req.body;

    if (!applicationId || !message) {
      return res.status(400).json({ 
        message: 'Application ID and message content are required' 
      });
    }

    // Verify application exists and user has access
    const application = await Application.findById(applicationId)
      .populate('client', 'firstName lastName')
      .populate('landlord', 'firstName lastName')
      .populate('property', 'title');

    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    const hasAccess = 
      req.user.role === 'admin' ||
      application.client._id.toString() === req.user._id.toString() ||
      application.landlord._id.toString() === req.user._id.toString();

    if (!hasAccess) {
      return res.status(403).json({ message: 'Not authorized to send messages for this application' });
    }

    // Determine receiver
    const receiverId = req.user._id.toString() === application.client._id.toString() 
      ? application.landlord._id 
      : application.client._id;

    // Create message
    const newMessage = new Message({
      application: applicationId,
      sender: req.user._id,
      receiver: receiverId,
      message,
      messageType,
      attachments
    });

    await newMessage.save();

    // Populate sender and receiver info
    await newMessage.populate([
      { path: 'sender', select: 'firstName lastName avatar' },
      { path: 'receiver', select: 'firstName lastName avatar' }
    ]);

    res.status(201).json({
      message: 'Message sent successfully',
      data: newMessage
    });

  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ message: 'Server error while sending message' });
  }
});

// @route   PUT /api/messages/:id/read
// @desc    Mark message as read
// @access  Private
router.put('/:id/read', verifyToken, async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);

    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Check if user is the receiver
    if (message.receiver.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to mark this message as read' });
    }

    await message.markAsRead();

    res.json({ message: 'Message marked as read' });

  } catch (error) {
    console.error('Mark message as read error:', error);
    res.status(500).json({ message: 'Server error while updating message' });
  }
});

// @route   PUT /api/messages/application/:applicationId/read-all
// @desc    Mark all messages in conversation as read
// @access  Private
router.put('/application/:applicationId/read-all', verifyToken, async (req, res) => {
  try {
    const { applicationId } = req.params;

    // Verify user has access to this application
    const application = await Application.findById(applicationId);
    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    const hasAccess = 
      req.user.role === 'admin' ||
      application.client.toString() === req.user._id.toString() ||
      application.landlord.toString() === req.user._id.toString();

    if (!hasAccess) {
      return res.status(403).json({ message: 'Not authorized to mark messages as read for this application' });
    }

    await Message.markAllAsRead(applicationId, req.user._id);

    res.json({ message: 'All messages marked as read' });

  } catch (error) {
    console.error('Mark all messages as read error:', error);
    res.status(500).json({ message: 'Server error while updating messages' });
  }
});

// @route   GET /api/messages/unread-count
// @desc    Get unread message count for user
// @access  Private
router.get('/unread-count', verifyToken, async (req, res) => {
  try {
    const unreadCount = await Message.getUnreadCount(req.user._id);
    res.json({ unreadCount });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ message: 'Server error while fetching unread count' });
  }
});

// @route   POST /api/messages/:id/moderate
// @desc    Moderate a message (Admin only)
// @access  Private (Admin)
router.post('/:id/moderate', verifyToken, async (req, res) => {
  try {
    const { action, reason } = req.body;

    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to moderate messages' });
    }

    if (!['approved', 'flagged', 'hidden', 'deleted'].includes(action)) {
      return res.status(400).json({ message: 'Invalid moderation action' });
    }

    const message = await Message.findById(req.params.id);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    await message.moderate(req.user._id, action, reason);

    res.json({ message: 'Message moderated successfully' });

  } catch (error) {
    console.error('Moderate message error:', error);
    res.status(500).json({ message: 'Server error while moderating message' });
  }
});

// @route   GET /api/messages/admin/flagged
// @desc    Get flagged messages (Admin only)
// @access  Private (Admin)
router.get('/admin/flagged', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to view flagged messages' });
    }

    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const messages = await Message.find({
      isModerated: true,
      moderationAction: 'flagged'
    })
      .populate('sender', 'firstName lastName email')
      .populate('receiver', 'firstName lastName email')
      .populate('application', 'property client')
      .sort({ moderatedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Message.countDocuments({
      isModerated: true,
      moderationAction: 'flagged'
    });

    res.json({
      messages,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total,
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Get flagged messages error:', error);
    res.status(500).json({ message: 'Server error while fetching flagged messages' });
  }
});

module.exports = router;
