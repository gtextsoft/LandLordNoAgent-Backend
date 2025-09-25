import mongoose, { Schema, Document } from 'mongoose';

export interface IPayment extends Document {
  _id: string;
  applicationId: string;
  clientId: string;
  landlordId: string;
  propertyId: string;
  amount: number;
  currency: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
  paymentMethod: string;
  stripePaymentIntentId?: string;
  commissionAmount: number;
  receiptUrl?: string;
  refundAmount?: number;
  refundReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema: Schema = new Schema({
  applicationId: {
    type: Schema.Types.ObjectId,
    ref: 'Application',
    required: true,
  },
  clientId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  landlordId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  propertyId: {
    type: Schema.Types.ObjectId,
    ref: 'Property',
    required: true,
  },
  amount: {
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
  status: {
    type: String,
    enum: ['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED'],
    default: 'PENDING',
  },
  paymentMethod: {
    type: String,
    default: 'stripe',
  },
  stripePaymentIntentId: {
    type: String,
    trim: true,
  },
  commissionAmount: {
    type: Number,
    default: 0,
    min: 0,
  },
  receiptUrl: {
    type: String,
    trim: true,
  },
  refundAmount: {
    type: Number,
    min: 0,
  },
  refundReason: {
    type: String,
    trim: true,
    maxlength: 500,
  },
}, {
  timestamps: true,
});

// Indexes
PaymentSchema.index({ applicationId: 1 });
PaymentSchema.index({ clientId: 1 });
PaymentSchema.index({ landlordId: 1 });
PaymentSchema.index({ propertyId: 1 });
PaymentSchema.index({ status: 1 });
PaymentSchema.index({ stripePaymentIntentId: 1 });
PaymentSchema.index({ createdAt: -1 });

// Compound indexes
PaymentSchema.index({ clientId: 1, status: 1 });
PaymentSchema.index({ landlordId: 1, status: 1 });

export default mongoose.model<IPayment>('Payment', PaymentSchema);
