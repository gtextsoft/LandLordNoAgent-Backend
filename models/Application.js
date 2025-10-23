const mongoose = require('mongoose');

const applicationSchema = new mongoose.Schema({
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
  
  // Application Details
  status: {
    type: String,
    enum: ['pending', 'under_review', 'approved', 'rejected', 'withdrawn'],
    default: 'pending'
  },
  applicationDate: {
    type: Date,
    default: Date.now
  },
  reviewedAt: Date,
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewNotes: String,
  
  // Personal Information
  personalInfo: {
    firstName: String,
    lastName: String,
    email: String,
    phone: String,
    dateOfBirth: Date,
    ssn: String, // Encrypted
    emergencyContact: {
      name: String,
      phone: String,
      relationship: String
    }
  },
  
  // Employment Information
  employment: {
    employer: String,
    position: String,
    startDate: Date,
    monthlyIncome: Number,
    employmentType: {
      type: String,
      enum: ['full-time', 'part-time', 'contract', 'self-employed', 'unemployed', 'student', 'retired']
    },
    employerPhone: String,
    supervisorName: String
  },
  
  // Rental History
  rentalHistory: [{
    address: String,
    landlordName: String,
    landlordPhone: String,
    rentAmount: Number,
    leaseStart: Date,
    leaseEnd: Date,
    reasonForLeaving: String,
    reference: String
  }],
  
  // Financial Information
  financialInfo: {
    monthlyIncome: Number,
    otherIncome: Number,
    bankAccount: String, // Encrypted
    creditScore: Number,
    debts: [{
      creditor: String,
      amount: Number,
      monthlyPayment: Number
    }]
  },
  
  // Documents
  documents: [{
    type: {
      type: String,
      enum: ['id', 'pay_stub', 'bank_statement', 'employment_letter', 'reference_letter', 'other']
    },
    url: String,
    name: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Application Preferences
  preferences: {
    moveInDate: Date,
    leaseLength: Number, // months
    petInfo: {
      hasPets: Boolean,
      petType: String,
      petCount: Number,
      petDescription: String
    },
    additionalInfo: String
  },
  
  // Communication
  messages: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  }],
  
  // Payment Information
  applicationFee: {
    amount: Number,
    paid: {
      type: Boolean,
      default: false
    },
    paymentId: String,
    paidAt: Date
  },
  
  // Background Check
  backgroundCheck: {
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'completed', 'failed'],
      default: 'pending'
    },
    reportUrl: String,
    completedAt: Date
  },
  
  // Final Decision
  decision: {
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    },
    decisionDate: Date,
    decisionReason: String,
    leaseStartDate: Date,
    leaseEndDate: Date,
    monthlyRent: Number,
    securityDeposit: Number
  }
}, {
  timestamps: true
});

// Indexes for performance
applicationSchema.index({ property: 1 });
applicationSchema.index({ client: 1 });
applicationSchema.index({ landlord: 1 });
applicationSchema.index({ status: 1 });
applicationSchema.index({ applicationDate: -1 });
applicationSchema.index({ client: 1, property: 1 }, { unique: true });

// Virtual for full name
applicationSchema.virtual('clientName').get(function() {
  return `${this.personalInfo.firstName} ${this.personalInfo.lastName}`;
});

// Virtual for application duration
applicationSchema.virtual('daysSinceApplication').get(function() {
  return Math.floor((Date.now() - this.applicationDate) / (1000 * 60 * 60 * 24));
});

// Update property applications count when application status changes
applicationSchema.post('save', async function(doc) {
  if (doc.isModified('status')) {
    await doc.constructor.updateApplicationsCount(doc.property);
  }
});

applicationSchema.post('remove', async function(doc) {
  await doc.constructor.updateApplicationsCount(doc.property);
});

// Static method to update applications count
applicationSchema.statics.updateApplicationsCount = function(propertyId) {
  return mongoose.model('Property').findById(propertyId)
    .then(property => {
      if (property) {
        return property.updateApplicationsCount();
      }
    });
};

module.exports = mongoose.model('Application', applicationSchema);