// Core application types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  errors?: Record<string, string[]>;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// User types
export interface User {
  id: string;
  email: string;
  role: UserRole;
  isVerified: boolean;
  kycData?: KycData;
  profileData?: ProfileData;
  createdAt: string;
  updatedAt: string;
}

export type UserRole = 'CLIENT' | 'LANDLORD' | 'ADMIN';

export interface ProfileData {
  firstName?: string;
  lastName?: string;
  phone?: string;
  avatar?: string;
  preferences?: UserPreferences;
}

export interface UserPreferences {
  currency: string;
  notifications: NotificationSettings;
  language: string;
}

export interface NotificationSettings {
  email: boolean;
  push: boolean;
  sms: boolean;
}

// KYC types
export interface KycData {
  personalInfo: PersonalInfo;
  documents: KycDocuments;
  verificationStatus: VerificationStatus;
  submittedAt?: string;
  reviewedAt?: string;
  adminNotes?: string;
}

export interface PersonalInfo {
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  dateOfBirth: string;
  nationality: string;
  occupation: string;
  employer: string;
  monthlyIncome: number;
}

export interface KycDocuments {
  idCard: DocumentInfo;
  proofOfAddress: DocumentInfo;
  proofOfIncome: DocumentInfo;
  bankStatement: DocumentInfo;
}

export interface DocumentInfo {
  fileUrl: string;
  fileName: string;
  status: DocumentStatus;
  notes?: string;
}

export type VerificationStatus = 'pending' | 'in_review' | 'approved' | 'rejected';
export type DocumentStatus = 'pending' | 'approved' | 'rejected';

// Property types
export interface Property {
  id: string;
  landlordId: string;
  title: string;
  description?: string;
  propertyType: PropertyType;
  price: number;
  currency: string;
  location: PropertyLocation;
  amenities: string[];
  images: string[];
  videos: string[];
  houseDocuments: string[];
  isAvailable: boolean;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
  landlord?: User;
}

export type PropertyType = 
  | 'SELF_CONTAIN'
  | 'MINI_FLAT'
  | 'ONE_BEDROOM'
  | 'TWO_BEDROOM'
  | 'THREE_BEDROOM'
  | 'FOUR_BEDROOM'
  | 'BUNGALOW'
  | 'DETACHED_DUPLEX'
  | 'SEMI_DETACHED_DUPLEX'
  | 'TERRACED_DUPLEX'
  | 'MANSION'
  | 'PENTHOUSE'
  | 'SHOP'
  | 'WAREHOUSE';

export interface PropertyLocation {
  address: string;
  city: string;
  state: string;
  country: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
}

// Application types
export interface Application {
  id: string;
  clientId: string;
  propertyId: string;
  landlordId: string;
  status: ApplicationStatus;
  applicationData?: ApplicationData;
  landlordNotes?: string;
  adminNotes?: string;
  createdAt: string;
  updatedAt: string;
  client?: User;
  property?: Property;
  landlord?: User;
}

export type ApplicationStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';

export interface ApplicationData {
  personalInfo: PersonalInfo;
  employmentInfo: EmploymentInfo;
  references: Reference[];
  additionalInfo?: string;
}

export interface EmploymentInfo {
  employer: string;
  position: string;
  startDate: string;
  monthlySalary: number;
  employmentType: string;
}

export interface Reference {
  name: string;
  relationship: string;
  phone: string;
  email: string;
}

// Payment types
export interface Payment {
  id: string;
  applicationId: string;
  clientId: string;
  landlordId: string;
  propertyId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  paymentMethod: string;
  stripePaymentIntentId?: string;
  commissionAmount: number;
  receiptUrl?: string;
  refundAmount?: number;
  refundReason?: string;
  createdAt: string;
  updatedAt: string;
  application?: Application;
  client?: User;
  landlord?: User;
  property?: Property;
}

export type PaymentStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';

// Chat types
export interface ChatMessage {
  id: string;
  applicationId: string;
  senderId: string;
  receiverId: string;
  content: string;
  messageType: MessageType;
  fileUrl?: string;
  isRead: boolean;
  moderationFlags?: ModerationFlags;
  createdAt: string;
  sender?: User;
  receiver?: User;
}

export type MessageType = 'TEXT' | 'IMAGE' | 'FILE';

export interface ModerationFlags {
  isBlocked: boolean;
  isFlagged: boolean;
  severity: 'low' | 'medium' | 'high';
  reasons: string[];
}

// Notification types
export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  data?: any;
  isRead: boolean;
  priority: NotificationPriority;
  createdAt: string;
}

export type NotificationPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

// Commission types
export interface CommissionPayout {
  id: string;
  landlordId: string;
  amount: number;
  currency: string;
  status: CommissionStatus;
  paymentMethod?: string;
  paymentReference?: string;
  adminNotes?: string;
  createdAt: string;
  updatedAt: string;
  landlord?: User;
}

export type CommissionStatus = 'PENDING' | 'APPROVED' | 'PAID' | 'REJECTED';

// Report types
export interface Report {
  id: string;
  reporterId: string;
  reportedUserId?: string;
  reportedPropertyId?: string;
  reportType: ReportType;
  description: string;
  status: ReportStatus;
  adminNotes?: string;
  createdAt: string;
  updatedAt: string;
  reporter?: User;
  reportedUser?: User;
  reportedProperty?: Property;
}

export type ReportType = 'SPAM' | 'INAPPROPRIATE' | 'FRAUD' | 'HARASSMENT' | 'OTHER';
export type ReportStatus = 'PENDING' | 'UNDER_REVIEW' | 'RESOLVED' | 'DISMISSED';

// Dispute types
export interface Dispute {
  id: string;
  clientId: string;
  landlordId: string;
  applicationId: string;
  disputeType: DisputeType;
  description: string;
  status: DisputeStatus;
  resolution?: string;
  adminNotes?: string;
  createdAt: string;
  updatedAt: string;
  client?: User;
  landlord?: User;
  application?: Application;
}

export type DisputeType = 'PAYMENT' | 'PROPERTY' | 'SERVICE' | 'OTHER';
export type DisputeStatus = 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' | 'CLOSED';

// Platform settings types
export interface PlatformSettings {
  id: string;
  commissionRate: number;
  platformFee: number;
  currencySettings?: CurrencySettings;
  emailTemplates?: EmailTemplates;
  maintenanceMode: boolean;
  updatedAt: string;
}

export interface CurrencySettings {
  defaultCurrency: string;
  supportedCurrencies: string[];
  exchangeRates?: Record<string, number>;
}

export interface EmailTemplates {
  welcome: string;
  verification: string;
  passwordReset: string;
  applicationUpdate: string;
  paymentConfirmation: string;
}

// Audit log types
export interface AuditLog {
  id: string;
  userId?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  details?: any;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
  user?: User;
}

// Request/Response types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  role: UserRole;
  profileData?: ProfileData;
}

export interface CreatePropertyRequest {
  title: string;
  description?: string;
  propertyType: PropertyType;
  price: number;
  currency?: string;
  location: PropertyLocation;
  amenities: string[];
}

export interface UpdatePropertyRequest extends Partial<CreatePropertyRequest> {
  isAvailable?: boolean;
}

export interface SubmitApplicationRequest {
  propertyId: string;
  applicationData: ApplicationData;
}

export interface CreatePaymentRequest {
  applicationId: string;
  amount: number;
  currency?: string;
}

export interface SendMessageRequest {
  applicationId: string;
  content: string;
  messageType?: MessageType;
}

export interface CreateReportRequest {
  reportedUserId?: string;
  reportedPropertyId?: string;
  reportType: ReportType;
  description: string;
}

// Filter and search types
export interface PropertyFilters {
  propertyType?: PropertyType[];
  minPrice?: number;
  maxPrice?: number;
  currency?: string;
  city?: string;
  state?: string;
  amenities?: string[];
  isAvailable?: boolean;
  isVerified?: boolean;
}

export interface ApplicationFilters {
  status?: ApplicationStatus[];
  clientId?: string;
  landlordId?: string;
  propertyId?: string;
}

export interface PaymentFilters {
  status?: PaymentStatus[];
  clientId?: string;
  landlordId?: string;
  currency?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// File upload types
export interface FileUpload {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface UploadedFile {
  url: string;
  filename: string;
  mimetype: string;
  size: number;
}

// Webhook types
export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: {
    object: any;
  };
}

export interface StripeCheckoutSession {
  id: string;
  payment_status: string;
  payment_intent?: string;
  amount_total?: number;
  currency?: string;
  metadata?: Record<string, string>;
}

// JWT payload type
export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
  iat: number;
  exp: number;
}

// Express request extensions
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}
