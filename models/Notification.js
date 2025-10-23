const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: [
      'application_received',
      'application_approved',
      'application_rejected',
      'payment_received',
      'payment_failed',
      'maintenance_request',
      'maintenance_completed',
      'viewing_scheduled',
      'viewing_cancelled',
      'message_received',
      'property_verified',
      'kyc_approved',
      'kyc_rejected',
      'system_announcement',
      'other'
    ],
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: Date,
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  relatedEntity: {
    type: {
      type: String,
      enum: ['property', 'application', 'payment', 'maintenance', 'message', 'user']
    },
    id: {
      type: mongoose.Schema.Types.ObjectId
    }
  },
  actionUrl: String,
  metadata: {
    source: String,
    ipAddress: String,
    userAgent: String
  },
  expiresAt: Date,
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for efficient queries
notificationSchema.index({ 
  user: 1, 
  isRead: 1, 
  createdAt: -1 
});

notificationSchema.index({ 
  user: 1, 
  type: 1, 
  createdAt: -1 
});

notificationSchema.index({ 
  isActive: 1, 
  expiresAt: 1 
});

// Virtual for notification age
notificationSchema.virtual('ageInHours').get(function() {
  return Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60));
});

// Method to mark as read
notificationSchema.methods.markAsRead = function() {
  this.isRead = true;
  this.readAt = new Date();
  return this.save();
};

// Method to mark as unread
notificationSchema.methods.markAsUnread = function() {
  this.isRead = false;
  this.readAt = undefined;
  return this.save();
};

// Static method to create notification
notificationSchema.statics.createNotification = function(data) {
  return this.create({
    user: data.userId,
    type: data.type,
    title: data.title,
    message: data.message,
    priority: data.priority || 'medium',
    relatedEntity: data.relatedEntity,
    actionUrl: data.actionUrl,
    metadata: data.metadata,
    expiresAt: data.expiresAt
  });
};

// Static method to get user notifications
notificationSchema.statics.getUserNotifications = function(userId, page = 1, limit = 20, unreadOnly = false) {
  const query = { user: userId, isActive: true };
  
  if (unreadOnly) {
    query.isRead = false;
  }
  
  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);
};

// Static method to mark all as read
notificationSchema.statics.markAllAsRead = function(userId) {
  return this.updateMany(
    { user: userId, isRead: false },
    { 
      isRead: true, 
      readAt: new Date() 
    }
  );
};

// Static method to cleanup expired notifications
notificationSchema.statics.cleanupExpired = function() {
  return this.updateMany(
    { 
      expiresAt: { $lt: new Date() },
      isActive: true 
    },
    { isActive: false }
  );
};

module.exports = mongoose.model('Notification', notificationSchema);
