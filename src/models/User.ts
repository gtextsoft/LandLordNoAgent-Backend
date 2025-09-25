import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  _id: string;
  email: string;
  passwordHash: string;
  role: 'CLIENT' | 'LANDLORD' | 'ADMIN';
  isVerified: boolean;
  emailVerificationCode?: string;
  emailVerificationExpires?: Date;
  emailVerifiedAt?: Date;
  kycData?: {
    personalInfo: {
      firstName: string;
      lastName: string;
      phone: string;
      address: string;
      city: string;
      state: string;
      postalCode: string;
      dateOfBirth: Date;
      nationality: string;
      occupation: string;
      employer: string;
      monthlyIncome: number;
    };
    documents: {
      idCard: {
        fileUrl: string;
        fileName: string;
        status: 'pending' | 'approved' | 'rejected';
        notes?: string;
      };
      proofOfAddress: {
        fileUrl: string;
        fileName: string;
        status: 'pending' | 'approved' | 'rejected';
        notes?: string;
      };
      proofOfIncome: {
        fileUrl: string;
        fileName: string;
        status: 'pending' | 'approved' | 'rejected';
        notes?: string;
      };
      bankStatement: {
        fileUrl: string;
        fileName: string;
        status: 'pending' | 'approved' | 'rejected';
        notes?: string;
      };
    };
    verificationStatus: 'pending' | 'in_review' | 'approved' | 'rejected';
    submittedAt?: Date;
    reviewedAt?: Date;
    adminNotes?: string;
  };
  profileData?: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    avatar?: string;
    preferences?: {
      currency: string;
      notifications: {
        email: boolean;
        push: boolean;
        sms: boolean;
      };
      language: string;
    };
  };
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema = new Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  passwordHash: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ['CLIENT', 'LANDLORD', 'ADMIN'],
    default: 'CLIENT',
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  emailVerificationCode: {
    type: String,
    required: false,
  },
  emailVerificationExpires: {
    type: Date,
    required: false,
  },
  emailVerifiedAt: {
    type: Date,
    required: false,
  },
  kycData: {
    personalInfo: {
      firstName: { type: String },
      lastName: { type: String },
      phone: { type: String },
      address: { type: String },
      city: { type: String },
      state: { type: String },
      postalCode: { type: String },
      dateOfBirth: { type: Date },
      nationality: { type: String },
      occupation: { type: String },
      employer: { type: String },
      monthlyIncome: { type: Number },
    },
    documents: {
      idCard: {
        fileUrl: { type: String },
        fileName: { type: String },
        status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
        notes: { type: String },
      },
      proofOfAddress: {
        fileUrl: { type: String },
        fileName: { type: String },
        status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
        notes: { type: String },
      },
      proofOfIncome: {
        fileUrl: { type: String },
        fileName: { type: String },
        status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
        notes: { type: String },
      },
      bankStatement: {
        fileUrl: { type: String },
        fileName: { type: String },
        status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
        notes: { type: String },
      },
    },
    verificationStatus: {
      type: String,
      enum: ['pending', 'in_review', 'approved', 'rejected'],
      default: 'pending',
    },
    submittedAt: { type: Date },
    reviewedAt: { type: Date },
    adminNotes: { type: String },
  },
  profileData: {
    firstName: { type: String },
    lastName: { type: String },
    phone: { type: String },
    avatar: { type: String },
    preferences: {
      currency: { type: String, default: 'USD' },
      notifications: {
        email: { type: Boolean, default: true },
        push: { type: Boolean, default: true },
        sms: { type: Boolean, default: false },
      },
      language: { type: String, default: 'en' },
    },
  },
}, {
  timestamps: true,
});

// Indexes
// Note: email index is automatically created by unique: true in schema
UserSchema.index({ role: 1 });
UserSchema.index({ isVerified: 1 });
UserSchema.index({ 'kycData.verificationStatus': 1 });

export default mongoose.model<IUser>('User', UserSchema);
