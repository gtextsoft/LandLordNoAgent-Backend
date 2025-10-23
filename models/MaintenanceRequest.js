const mongoose = require('mongoose');

const maintenanceRequestSchema = new mongoose.Schema({
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    required: true
  },
  tenant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  landlord: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Request Details
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  category: {
    type: String,
    enum: ['plumbing', 'electrical', 'hvac', 'appliance', 'structural', 'pest_control', 'cleaning', 'other'],
    required: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  
  // Status and Progress
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed', 'cancelled'],
    default: 'pending'
  },
  
  // Cost Information
  estimatedCost: {
    type: Number,
    min: 0
  },
  actualCost: {
    type: Number,
    min: 0
  },
  
  // Scheduling
  scheduledDate: Date,
  completedDate: Date,
  
  // Assignment
  assignedTo: {
    type: String,
    trim: true
  },
  
  // Notes and Communication
  notes: {
    type: String
  },
  landlordNotes: {
    type: String
  },
  tenantNotes: {
    type: String
  },
  
  // Images/Documents
  images: [{
    url: String,
    caption: String,
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Approval and Completion
  approvedAt: Date,
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  completedAt: Date,
  completedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Follow-up
  followUpRequired: {
    type: Boolean,
    default: false
  },
  followUpDate: Date,
  followUpNotes: String
}, {
  timestamps: true
});

// Indexes for performance
maintenanceRequestSchema.index({ property: 1 });
maintenanceRequestSchema.index({ tenant: 1 });
maintenanceRequestSchema.index({ landlord: 1 });
maintenanceRequestSchema.index({ status: 1 });
maintenanceRequestSchema.index({ priority: 1 });
maintenanceRequestSchema.index({ category: 1 });
maintenanceRequestSchema.index({ createdAt: -1 });
maintenanceRequestSchema.index({ scheduledDate: 1 });

// Virtual for days since request
maintenanceRequestSchema.virtual('daysSinceRequest').get(function() {
  return Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60 * 24));
});

// Virtual for urgency score
maintenanceRequestSchema.virtual('urgencyScore').get(function() {
  let score = 0;
  
  // Priority scoring
  const priorityScores = { low: 1, medium: 2, high: 3, urgent: 4 };
  score += priorityScores[this.priority] || 0;
  
  // Days since request scoring
  const daysSince = this.daysSinceRequest;
  if (daysSince > 7) score += 2;
  else if (daysSince > 3) score += 1;
  
  // Status scoring
  if (this.status === 'pending') score += 1;
  
  return score;
});

// Static method to get maintenance statistics
maintenanceRequestSchema.statics.getMaintenanceStats = function(landlordId, startDate, endDate) {
  const match = { landlord: landlordId };
  if (startDate && endDate) {
    match.createdAt = { $gte: startDate, $lte: endDate };
  }

  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalCost: { $sum: '$actualCost' }
      }
    }
  ]);
};

// Static method to get requests by category
maintenanceRequestSchema.statics.getRequestsByCategory = function(landlordId, startDate, endDate) {
  const match = { landlord: landlordId };
  if (startDate && endDate) {
    match.createdAt = { $gte: startDate, $lte: endDate };
  }

  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 },
        avgCost: { $avg: '$actualCost' }
      }
    },
    { $sort: { count: -1 } }
  ]);
};

module.exports = mongoose.model('MaintenanceRequest', maintenanceRequestSchema);