import mongoose, { Schema, Document } from 'mongoose';

export interface IProperty extends Document {
  _id: string;
  landlordId: string;
  title: string;
  description?: string;
  propertyType: 'SELF_CONTAIN' | 'MINI_FLAT' | 'ONE_BEDROOM' | 'TWO_BEDROOM' | 'THREE_BEDROOM' | 'FOUR_BEDROOM' | 'BUNGALOW' | 'DETACHED_DUPLEX' | 'SEMI_DETACHED_DUPLEX' | 'TERRACED_DUPLEX' | 'MANSION' | 'PENTHOUSE' | 'SHOP' | 'WAREHOUSE';
  price: number;
  currency: string;
  location: {
    address: string;
    city: string;
    state: string;
    country: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  };
  amenities: string[];
  images: string[];
  videos: string[];
  houseDocuments: string[];
  isAvailable: boolean;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PropertySchema: Schema = new Schema({
  landlordId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },
  description: {
    type: String,
    trim: true,
    maxlength: 1000,
  },
  propertyType: {
    type: String,
    enum: [
      'SELF_CONTAIN', 'MINI_FLAT', 'ONE_BEDROOM', 'TWO_BEDROOM', 'THREE_BEDROOM',
      'FOUR_BEDROOM', 'BUNGALOW', 'DETACHED_DUPLEX', 'SEMI_DETACHED_DUPLEX',
      'TERRACED_DUPLEX', 'MANSION', 'PENTHOUSE', 'SHOP', 'WAREHOUSE'
    ],
    required: true,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  currency: {
    type: String,
    default: 'USD',
    uppercase: true,
    length: 3,
  },
  location: {
    address: {
      type: String,
      required: true,
      trim: true,
    },
    city: {
      type: String,
      required: true,
      trim: true,
    },
    state: {
      type: String,
      required: true,
      trim: true,
    },
    country: {
      type: String,
      default: 'Nigeria',
      trim: true,
    },
    coordinates: {
      lat: {
        type: Number,
        min: -90,
        max: 90,
      },
      lng: {
        type: Number,
        min: -180,
        max: 180,
      },
    },
  },
  amenities: [{
    type: String,
    trim: true,
  }],
  images: [{
    type: String,
    trim: true,
  }],
  videos: [{
    type: String,
    trim: true,
  }],
  houseDocuments: [{
    type: String,
    trim: true,
  }],
  isAvailable: {
    type: Boolean,
    default: true,
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

// Indexes
PropertySchema.index({ landlordId: 1 });
PropertySchema.index({ propertyType: 1 });
PropertySchema.index({ price: 1 });
PropertySchema.index({ currency: 1 });
PropertySchema.index({ 'location.city': 1 });
PropertySchema.index({ 'location.state': 1 });
PropertySchema.index({ isAvailable: 1 });
PropertySchema.index({ isVerified: 1 });
PropertySchema.index({ createdAt: -1 });

// Text search index
PropertySchema.index({
  title: 'text',
  description: 'text',
  'location.address': 'text',
  'location.city': 'text',
  'location.state': 'text',
});

export default mongoose.model<IProperty>('Property', PropertySchema);
