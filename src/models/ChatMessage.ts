import mongoose, { Schema, Document } from 'mongoose';

export interface IChatMessage extends Document {
  _id: string;
  applicationId: string;
  senderId: string;
  receiverId: string;
  content: string;
  messageType: 'TEXT' | 'IMAGE' | 'FILE';
  fileUrl?: string;
  isRead: boolean;
  moderationFlags?: {
    isBlocked: boolean;
    isFlagged: boolean;
    severity: 'low' | 'medium' | 'high';
    reasons: string[];
  };
  createdAt: Date;
  updatedAt: Date;
}

const ChatMessageSchema: Schema = new Schema({
  applicationId: {
    type: Schema.Types.ObjectId,
    ref: 'Application',
    required: true,
  },
  senderId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  receiverId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000,
  },
  messageType: {
    type: String,
    enum: ['TEXT', 'IMAGE', 'FILE'],
    default: 'TEXT',
  },
  fileUrl: {
    type: String,
    trim: true,
  },
  isRead: {
    type: Boolean,
    default: false,
  },
  moderationFlags: {
    isBlocked: {
      type: Boolean,
      default: false,
    },
    isFlagged: {
      type: Boolean,
      default: false,
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'low',
    },
    reasons: [{
      type: String,
    }],
  },
}, {
  timestamps: true,
});

// Indexes
ChatMessageSchema.index({ applicationId: 1 });
ChatMessageSchema.index({ senderId: 1 });
ChatMessageSchema.index({ receiverId: 1 });
ChatMessageSchema.index({ createdAt: -1 });

// Compound indexes
ChatMessageSchema.index({ applicationId: 1, createdAt: -1 });
ChatMessageSchema.index({ senderId: 1, receiverId: 1 });
ChatMessageSchema.index({ isRead: 1, receiverId: 1 });

export default mongoose.model<IChatMessage>('ChatMessage', ChatMessageSchema);
