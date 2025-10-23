const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  application: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Application',
    required: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Message Content
  message: {
    type: String,
    required: true,
    trim: true
  },
  messageType: {
    type: String,
    enum: ['text', 'image', 'file', 'system'],
    default: 'text'
  },
  
  // Attachments
  attachments: [{
    filename: String,
    originalName: String,
    url: String,
    mimeType: String,
    size: Number,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Message Status
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: Date,
  
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
  moderationAction: {
    type: String,
    enum: ['approved', 'flagged', 'hidden', 'deleted']
  },
  moderationReason: String,
  
  // System Messages
  isSystemMessage: {
    type: Boolean,
    default: false
  },
  systemAction: {
    type: String,
    enum: ['application_created', 'status_changed', 'payment_received', 'viewing_scheduled', 'other']
  },
  
  // Reply Information
  isReply: {
    type: Boolean,
    default: false
  },
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  
  // Timestamps
  sentAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for performance
messageSchema.index({ application: 1, sentAt: -1 });
messageSchema.index({ sender: 1 });
messageSchema.index({ receiver: 1 });
messageSchema.index({ isRead: 1 });
messageSchema.index({ isModerated: 1 });
messageSchema.index({ sentAt: -1 });

// Virtual for sender name
messageSchema.virtual('senderName').get(function() {
  return this.populate('sender', 'firstName lastName');
});

// Virtual for receiver name
messageSchema.virtual('receiverName').get(function() {
  return this.populate('receiver', 'firstName lastName');
});

// Mark as read
messageSchema.methods.markAsRead = function() {
  this.isRead = true;
  this.readAt = new Date();
  return this.save();
};

// Mark as moderated
messageSchema.methods.moderate = function(moderatedBy, action, reason) {
  this.isModerated = true;
  this.moderatedBy = moderatedBy;
  this.moderatedAt = new Date();
  this.moderationAction = action;
  this.moderationReason = reason;
  return this.save();
};

// Static method to get conversation
messageSchema.statics.getConversation = function(applicationId, page = 1, limit = 50) {
  const skip = (page - 1) * limit;
  
  return this.find({ application: applicationId })
    .populate('sender', 'firstName lastName avatar')
    .populate('receiver', 'firstName lastName avatar')
    .populate('attachments')
    .sort({ sentAt: -1 })
    .skip(skip)
    .limit(limit);
};

// Static method to mark all messages as read
messageSchema.statics.markAllAsRead = function(applicationId, userId) {
  return this.updateMany(
    { 
      application: applicationId,
      receiver: userId,
      isRead: false
    },
    { 
      isRead: true,
      readAt: new Date()
    }
  );
};

// Static method to get unread count
messageSchema.statics.getUnreadCount = function(userId) {
  return this.countDocuments({
    receiver: userId,
    isRead: false
  });
};

module.exports = mongoose.model('Message', messageSchema);