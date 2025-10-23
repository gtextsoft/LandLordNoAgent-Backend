const mongoose = require('mongoose');

const viewingAppointmentSchema = new mongoose.Schema({
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    required: true
  },
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  landlord: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Scheduling Information
  scheduledDate: {
    type: Date,
    required: true
  },
  scheduledTime: {
    type: String,
    required: true
  },
  duration: {
    type: Number,
    default: 60, // minutes
    min: 15,
    max: 240
  },
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'completed', 'cancelled', 'no_show'],
    default: 'pending'
  },
  
  // Communication
  notes: {
    type: String
  },
  clientNotes: {
    type: String
  },
  landlordNotes: {
    type: String
  },
  
  // Contact Information
  clientContact: {
    phone: String,
    email: String
  },
  landlordContact: {
    phone: String,
    email: String
  },
  
  // Meeting Details
  meetingLocation: {
    type: String,
    default: 'Property Location'
  },
  meetingInstructions: String,
  
  // Completion Information
  completedAt: Date,
  feedback: {
    clientRating: {
      type: Number,
      min: 1,
      max: 5
    },
    clientComments: String,
    landlordRating: {
      type: Number,
      min: 1,
      max: 5
    },
    landlordComments: String
  },
  
  // Cancellation Information
  cancelledAt: Date,
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  cancellationReason: String,
  
  // Reminders
  remindersSent: [{
    type: {
      type: String,
      enum: ['email', 'sms', 'push']
    },
    sentAt: Date,
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  
  // Follow-up
  followUpRequired: {
    type: Boolean,
    default: false
  },
  followUpDate: Date,
  followUpCompleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes for performance
viewingAppointmentSchema.index({ property: 1 });
viewingAppointmentSchema.index({ client: 1 });
viewingAppointmentSchema.index({ landlord: 1 });
viewingAppointmentSchema.index({ status: 1 });
viewingAppointmentSchema.index({ scheduledDate: 1 });
viewingAppointmentSchema.index({ createdAt: -1 });

// Compound index for scheduling conflicts
viewingAppointmentSchema.index({ 
  property: 1, 
  scheduledDate: 1, 
  scheduledTime: 1 
});

// Virtual for appointment date and time
viewingAppointmentSchema.virtual('appointmentDateTime').get(function() {
  const date = new Date(this.scheduledDate);
  const [hours, minutes] = this.scheduledTime.split(':');
  date.setHours(parseInt(hours), parseInt(minutes), 0, 0);
  return date;
});

// Virtual for end time
viewingAppointmentSchema.virtual('endDateTime').get(function() {
  const startTime = this.appointmentDateTime;
  return new Date(startTime.getTime() + this.duration * 60000);
});

// Virtual for time until appointment
viewingAppointmentSchema.virtual('timeUntilAppointment').get(function() {
  const now = new Date();
  const appointmentTime = this.appointmentDateTime;
  return Math.floor((appointmentTime - now) / (1000 * 60 * 60 * 24)); // days
});

// Pre-save middleware to validate scheduling
viewingAppointmentSchema.pre('save', async function(next) {
  if (this.isNew || this.isModified('scheduledDate') || this.isModified('scheduledTime')) {
    // Check for conflicts with other appointments
    const conflictingAppointment = await this.constructor.findOne({
      _id: { $ne: this._id },
      property: this.property,
      status: { $in: ['pending', 'confirmed'] },
      $or: [
        {
          scheduledDate: this.scheduledDate,
          scheduledTime: this.scheduledTime
        }
      ]
    });

    if (conflictingAppointment) {
      return next(new Error('There is already an appointment scheduled at this time'));
    }
  }
  next();
});

// Static method to get appointment statistics
viewingAppointmentSchema.statics.getAppointmentStats = function(landlordId, startDate, endDate) {
  const match = { landlord: landlordId };
  if (startDate && endDate) {
    match.scheduledDate = { $gte: startDate, $lte: endDate };
  }

  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);
};

// Static method to get upcoming appointments
viewingAppointmentSchema.statics.getUpcomingAppointments = function(userId, userRole, limit = 10) {
  const match = { scheduledDate: { $gte: new Date() } };
  
  if (userRole === 'client') {
    match.client = userId;
  } else if (userRole === 'landlord') {
    match.landlord = userId;
  }

  return this.find(match)
    .populate('property', 'title address images')
    .populate('client', 'firstName lastName email phone')
    .populate('landlord', 'firstName lastName email phone')
    .sort({ scheduledDate: 1 })
    .limit(limit);
};

// Static method to check availability
viewingAppointmentSchema.statics.checkAvailability = function(propertyId, date, time, duration = 60) {
  const appointmentDate = new Date(`${date}T${time}`);
  const endTime = new Date(appointmentDate.getTime() + duration * 60000);

  return this.find({
    property: propertyId,
    status: { $in: ['pending', 'confirmed'] },
    scheduledDate: date,
    $or: [
      {
        scheduledTime: time
      }
    ]
  });
};

module.exports = mongoose.model('ViewingAppointment', viewingAppointmentSchema);