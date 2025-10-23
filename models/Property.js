const mongoose = require('mongoose');

const propertySchema = new mongoose.Schema({
  landlord: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'USD'
  },
  propertyType: {
    type: String,
    enum: ['apartment', 'house', 'condo', 'studio', 'townhouse', 'other'],
    required: true
  },
  bedrooms: {
    type: Number,
    required: true,
    min: 0
  },
  bathrooms: {
    type: Number,
    required: true,
    min: 0
  },
  squareFeet: Number,
  
  // Location
  address: {
    street: {
      type: String,
      required: true
    },
    city: {
      type: String,
      required: true
    },
    state: {
      type: String,
      required: true
    },
    zipCode: {
      type: String,
      required: true
    },
    country: {
      type: String,
      default: 'US'
    },
    coordinates: {
      lat: Number,
      lng: Number
    }
  },
  
  // Images
  images: [{
    url: {
      type: String,
      required: true
    },
    caption: String,
    isPrimary: {
      type: Boolean,
      default: false
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Features and Amenities
  features: [String],
  amenities: [String],
  
  // Availability
  isAvailable: {
    type: Boolean,
    default: true
  },
  availableFrom: Date,
  leaseTerms: {
    minLease: {
      type: Number,
      default: 12 // months
    },
    maxLease: Number,
    deposit: Number,
    petAllowed: {
      type: Boolean,
      default: false
    },
    petDeposit: Number,
    utilitiesIncluded: {
      type: Boolean,
      default: false
    }
  },
  
  // Property Status
  status: {
    type: String,
    enum: ['draft', 'active', 'rented', 'inactive'],
    default: 'draft'
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verifiedAt: Date,
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Viewing and Application
  viewingsEnabled: {
    type: Boolean,
    default: true
  },
  applicationFee: {
    type: Number,
    default: 0
  },
  
  // Analytics
  views: {
    type: Number,
    default: 0
  },
  applicationsCount: {
    type: Number,
    default: 0
  },
  lastViewed: Date,
  
  // SEO
  slug: {
    type: String,
    unique: true,
    lowercase: true
  },
  metaDescription: String,
  keywords: [String]
}, {
  timestamps: true
});

// Indexes for performance
propertySchema.index({ landlord: 1 });
propertySchema.index({ status: 1, isAvailable: 1 });
propertySchema.index({ 'address.city': 1, 'address.state': 1 });
propertySchema.index({ price: 1 });
propertySchema.index({ propertyType: 1 });
propertySchema.index({ bedrooms: 1, bathrooms: 1 });
propertySchema.index({ createdAt: -1 });
// propertySchema.index({ slug: 1 });

// Virtual for full address
propertySchema.virtual('fullAddress').get(function() {
  return `${this.address.street}, ${this.address.city}, ${this.address.state} ${this.address.zipCode}`;
});

// Virtual for primary image
propertySchema.virtual('primaryImage').get(function() {
  const primary = this.images.find(img => img.isPrimary);
  return primary ? primary.url : (this.images.length > 0 ? this.images[0].url : null);
});

// Generate slug before saving
propertySchema.pre('save', function(next) {
  if (this.isModified('title') || this.isNew) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') + '-' + this._id.toString().slice(-6);
  }
  next();
});

// Update applications count when applications are added/removed
propertySchema.methods.updateApplicationsCount = function() {
  return mongoose.model('Application').countDocuments({ property: this._id })
    .then(count => {
      this.applicationsCount = count;
      return this.save();
    });
};

// Increment view count
propertySchema.methods.incrementViews = function() {
  this.views += 1;
  this.lastViewed = new Date();
  return this.save();
};

module.exports = mongoose.model('Property', propertySchema);