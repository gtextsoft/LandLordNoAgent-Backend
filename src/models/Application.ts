import mongoose, { Schema, Document } from 'mongoose';

export interface IApplication extends Document {
  _id: string;
  clientId: string;
  propertyId: string;
  landlordId: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
  applicationData?: {
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
    employmentInfo: {
      employer: string;
      position: string;
      startDate: Date;
      monthlySalary: number;
      employmentType: 'full-time' | 'part-time' | 'contract' | 'self-employed';
    };
    references: Array<{
      name: string;
      relationship: string;
      phone: string;
      email: string;
    }>;
    additionalInfo?: string;
  };
  landlordNotes?: string;
  adminNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ApplicationSchema: Schema = new Schema({
  clientId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  propertyId: {
    type: Schema.Types.ObjectId,
    ref: 'Property',
    required: true,
  },
  landlordId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  status: {
    type: String,
    enum: ['PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED'],
    default: 'PENDING',
  },
  applicationData: {
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
    employmentInfo: {
      employer: { type: String },
      position: { type: String },
      startDate: { type: Date },
      monthlySalary: { type: Number },
      employmentType: {
        type: String,
        enum: ['full-time', 'part-time', 'contract', 'self-employed'],
      },
    },
    references: [{
      name: { type: String },
      relationship: { type: String },
      phone: { type: String },
      email: { type: String },
    }],
    additionalInfo: { type: String },
  },
  landlordNotes: {
    type: String,
    trim: true,
    maxlength: 500,
  },
  adminNotes: {
    type: String,
    trim: true,
    maxlength: 500,
  },
}, {
  timestamps: true,
});

// Indexes
ApplicationSchema.index({ clientId: 1 });
ApplicationSchema.index({ propertyId: 1 });
ApplicationSchema.index({ landlordId: 1 });
ApplicationSchema.index({ status: 1 });
ApplicationSchema.index({ createdAt: -1 });

// Compound indexes
ApplicationSchema.index({ clientId: 1, status: 1 });
ApplicationSchema.index({ landlordId: 1, status: 1 });
ApplicationSchema.index({ propertyId: 1, status: 1 });

export default mongoose.model<IApplication>('Application', ApplicationSchema);
