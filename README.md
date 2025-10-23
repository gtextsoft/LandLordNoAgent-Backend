# Landlord No Agent - Backend API

A comprehensive backend API for the Landlord No Agent platform built with Node.js, Express, and MongoDB.

## 🚀 Features

- **Authentication & Authorization**: JWT-based auth with role-based access control
- **User Management**: Registration, login, profile management, KYC verification
- **Property Management**: CRUD operations, image uploads, search and filtering
- **Application System**: Property applications with document uploads
- **Payment Processing**: Stripe integration for application fees
- **Messaging System**: Real-time communication between landlords and clients
- **Maintenance Requests**: Property maintenance tracking
- **Viewing Appointments**: Schedule and manage property viewings
- **Admin Dashboard**: Comprehensive admin panel with analytics
- **File Uploads**: Secure file upload system for documents and images

## 🛠️ Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose
- **Authentication**: JWT (JSON Web Tokens)
- **File Uploads**: Multer
- **Payments**: Stripe
- **Email**: Nodemailer
- **Security**: Helmet, CORS, Rate Limiting

## 📦 Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

<<<<<<< HEAD
3. **Environment Setup**
   ```bash
   cp env.local .env
   # Edit .env with your configuration
   ```

4. **Start the server**
   ```bash
   # Development
   npm run dev
   
   # Production
   npm start
   ```

## 🔧 Environment Variables

Create a `.env` file in the backend directory with the following variables:

```env
# Server Configuration
PORT=5001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
API_BASE_URL=http://localhost:5001

# Database
MONGODB_URI=mongodb://localhost:27017/landlord-no-agent

# JWT Secret
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Email Configuration (for OTP)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# File Upload
UPLOAD_PATH=./uploads
MAX_FILE_SIZE=10485760

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## 📚 API Documentation

### Authentication Endpoints

- `POST /api/auth/register` - Register new user
- `POST /api/auth/verify-email` - Verify email with OTP
- `POST /api/auth/resend-otp` - Resend OTP
- `POST /api/auth/login` - User login
- `POST /api/auth/forgot-password` - Send password reset email
- `POST /api/auth/reset-password` - Reset password
- `GET /api/auth/me` - Get current user

### Property Endpoints

- `GET /api/properties` - Get all properties (with filters)
- `GET /api/properties/:id` - Get single property
- `POST /api/properties` - Create property (Landlord only)
- `PUT /api/properties/:id` - Update property
- `DELETE /api/properties/:id` - Delete property
- `GET /api/properties/landlord/:landlordId` - Get landlord's properties

### Application Endpoints

- `GET /api/applications` - Get user's applications
- `GET /api/applications/:id` - Get single application
- `POST /api/applications` - Create application (Client only)
- `PUT /api/applications/:id` - Update application
- `DELETE /api/applications/:id` - Withdraw application

### Payment Endpoints

- `POST /api/payments/create-checkout` - Create Stripe checkout session
- `POST /api/payments/webhook` - Stripe webhook handler
- `GET /api/payments/history` - Get payment history
- `GET /api/payments/:id` - Get payment details

### Message Endpoints

- `GET /api/messages/application/:applicationId` - Get conversation
- `POST /api/messages` - Send message
- `PUT /api/messages/:id/read` - Mark message as read
- `PUT /api/messages/application/:applicationId/read-all` - Mark all as read

### Admin Endpoints

- `GET /api/admin/dashboard` - Get dashboard statistics
- `GET /api/admin/users` - Get all users
- `PUT /api/admin/users/:id/status` - Update user status
- `GET /api/admin/properties` - Get all properties
- `PUT /api/admin/properties/:id/verify` - Verify property

### Upload Endpoints

- `POST /api/upload/single` - Upload single file
- `POST /api/upload/multiple` - Upload multiple files
- `POST /api/upload/property-images` - Upload property images
- `POST /api/upload/documents` - Upload documents
- `DELETE /api/upload/:filename` - Delete file

## 🗄️ Database Models

### User Model
- Personal information (name, email, phone)
- Role-based access (landlord, client, admin)
- KYC verification status
- Profile and preferences

### Property Model
- Property details (title, description, price)
- Location information
- Images and amenities
- Availability and lease terms

### Application Model
- Personal and employment information
- Rental history
- Financial information
- Document uploads
- Application status and decisions

### Payment Model
- Stripe integration
- Payment status and history
- Application fees and rent payments

### Message Model
- Application-based messaging
- File attachments
- Moderation support

## 🔒 Security Features

- **JWT Authentication**: Secure token-based authentication
- **Role-based Authorization**: Different access levels for users
- **Rate Limiting**: Prevent abuse and DDoS attacks
- **CORS Protection**: Configured for frontend domain
- **Helmet**: Security headers
- **Input Validation**: Request validation and sanitization
- **File Upload Security**: File type and size restrictions

## 🚀 Deployment

### Using PM2 (Recommended)

1. **Install PM2**
   ```bash
   npm install -g pm2
   ```

2. **Create ecosystem file**
   ```bash
   # ecosystem.config.js
   module.exports = {
     apps: [{
       name: 'landlord-api',
       script: 'server.js',
       instances: 'max',
       exec_mode: 'cluster',
       env: {
         NODE_ENV: 'production',
         PORT: 5001
       }
     }]
   };
   ```

3. **Start application**
   ```bash
   pm2 start ecosystem.config.js
   pm2 save
   pm2 startup
   ```

### Using Docker

1. **Create Dockerfile**
   ```dockerfile
   FROM node:18-alpine
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci --only=production
   COPY . .
   EXPOSE 5001
   CMD ["npm", "start"]
   ```

2. **Build and run**
   ```bash
   docker build -t landlord-api .
   docker run -p 5001:5001 landlord-api
   ```

## 📊 Health Check

The API provides a health check endpoint:

```
GET /api/health
```

Response:
```json
{
  "status": "OK",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 3600
}
```

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

## 📝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the ISC License.

## 🆘 Support

For support and questions, please contact the development team or create an issue in the repository.
=======
2. **Configure environment variables:**
   ```bash
   cp env.example .env
   # Edit .env with your configuration
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```

### What You'll See

When you start the server, you'll see a comprehensive startup display showing:

```
============================================================
🚀 LANDLORD NO AGENT - BACKEND SERVER STARTING
============================================================
📋 Configuration:
   🔧 Environment: development
   🌐 Port: 3001
   🔗 CORS Origin: http://localhost:3000
   🗄️  Database URL: mongodb://***:***@localhost:27017/landlordnoagent
============================================================
📡 Connecting to MongoDB at localhost:27017/landlordnoagent...
✅ Successfully connected to MongoDB
   📍 Host: localhost:27017
   🗄️  Database: landlordnoagent
   🔗 Connection State: connected
✅ Database connected successfully
🔧 Creating database indexes...
✅ Database indexes created successfully

============================================================
🎉 SERVER STARTED SUCCESSFULLY!
============================================================
🌐 Server running on: http://localhost:3001
📊 Environment: development
🔗 CORS origin: http://localhost:3000
📚 API Documentation: http://localhost:3001/api/docs
❤️  Health Check: http://localhost:3001/health
============================================================

🔍 Database Status:
   ✅ Connected: true
   📊 Collections: 6
   ✅ Required Collections: true
============================================================
```

### Available Endpoints

- **API Base:** `http://localhost:3001/api`
- **Health Check:** `http://localhost:3001/health`
- **API Documentation:** `http://localhost:3001/api/docs`
- **Properties:** `http://localhost:3001/api/properties`
- **Auth:** `http://localhost:3001/api/auth`

## Table of Contents

1. [User Authentication & Authorization](#user-authentication--authorization)
2. [Database Schema](#database-schema)
3. [User Management](#user-management)
4. [Property Management](#property-management)
5. [Application Management](#application-management)
6. [Payment System](#payment-system)
7. [Chat & Messaging](#chat--messaging)
8. [KYC & Verification](#kyc--verification)
9. [Notifications & Email](#notifications--email)
10. [Admin Features](#admin-features)
11. [File Management](#file-management)
12. [API Endpoints](#api-endpoints)
13. [Security & Validation](#security--validation)
14. [Environment Configuration](#environment-configuration)

## User Authentication & Authorization

### User Roles
- **Client**: Property seekers/tenants
- **Landlord**: Property owners/managers
- **Admin**: Platform administrators

### Authentication Features
- Email/password authentication
- Role-based access control
- JWT token management
- Password reset functionality
- Email verification
- Auto-logout on inactivity
- Protected route middleware

### Required Endpoints
```
POST /auth/register
POST /auth/login
POST /auth/logout
POST /auth/forgot-password
POST /auth/reset-password
POST /auth/verify-email
GET /auth/me
PUT /auth/profile
```

## Database Schema

### Core Tables

#### Users Table
```sql
users (
  id UUID PRIMARY KEY,
  email VARCHAR UNIQUE NOT NULL,
  password_hash VARCHAR NOT NULL,
  role ENUM('client', 'landlord', 'admin') NOT NULL,
  is_verified BOOLEAN DEFAULT FALSE,
  kyc_data JSONB,
  profile_data JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
)
```

#### Properties Table
```sql
properties (
  id UUID PRIMARY KEY,
  landlord_id UUID REFERENCES users(id),
  title VARCHAR NOT NULL,
  description TEXT,
  property_type ENUM('self_contain', 'mini_flat', 'one_bedroom', 'two_bedroom', 'three_bedroom', 'four_bedroom', 'bungalow', 'detached_duplex', 'semi_detached_duplex', 'terraced_duplex', 'mansion', 'penthouse', 'shop', 'warehouse'),
  price DECIMAL NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  location JSONB NOT NULL, -- {address, city, state, country, coordinates}
  amenities TEXT[],
  images TEXT[],
  videos TEXT[],
  house_documents TEXT[],
  is_available BOOLEAN DEFAULT TRUE,
  is_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
)
```

#### Applications Table
```sql
applications (
  id UUID PRIMARY KEY,
  client_id UUID REFERENCES users(id),
  property_id UUID REFERENCES properties(id),
  landlord_id UUID REFERENCES users(id),
  status ENUM('pending', 'accepted', 'rejected', 'cancelled') DEFAULT 'pending',
  application_data JSONB,
  landlord_notes TEXT,
  admin_notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
)
```

#### Payments Table
```sql
payments (
  id UUID PRIMARY KEY,
  application_id UUID REFERENCES applications(id),
  client_id UUID REFERENCES users(id),
  landlord_id UUID REFERENCES users(id),
  property_id UUID REFERENCES properties(id),
  amount DECIMAL NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  status ENUM('pending', 'completed', 'failed', 'refunded') DEFAULT 'pending',
  payment_method VARCHAR DEFAULT 'stripe',
  stripe_payment_intent_id VARCHAR,
  commission_amount DECIMAL DEFAULT 0,
  receipt_url TEXT,
  refund_amount DECIMAL,
  refund_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
)
```

#### Chat Messages Table
```sql
chat_messages (
  id UUID PRIMARY KEY,
  application_id UUID REFERENCES applications(id),
  sender_id UUID REFERENCES users(id),
  receiver_id UUID REFERENCES users(id),
  content TEXT NOT NULL,
  message_type ENUM('text', 'image', 'file') DEFAULT 'text',
  file_url TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  moderation_flags JSONB,
  created_at TIMESTAMP DEFAULT NOW()
)
```

#### Notifications Table
```sql
notifications (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  type VARCHAR NOT NULL,
  title VARCHAR NOT NULL,
  message TEXT NOT NULL,
  data JSONB,
  is_read BOOLEAN DEFAULT FALSE,
  priority ENUM('low', 'medium', 'high', 'urgent') DEFAULT 'medium',
  created_at TIMESTAMP DEFAULT NOW()
)
```

#### Commission Payouts Table
```sql
commission_payouts (
  id UUID PRIMARY KEY,
  landlord_id UUID REFERENCES users(id),
  amount DECIMAL NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  status ENUM('pending', 'approved', 'paid', 'rejected') DEFAULT 'pending',
  payment_method VARCHAR,
  payment_reference VARCHAR,
  admin_notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
)
```

#### Reports Table
```sql
reports (
  id UUID PRIMARY KEY,
  reporter_id UUID REFERENCES users(id),
  reported_user_id UUID REFERENCES users(id),
  reported_property_id UUID REFERENCES properties(id),
  report_type ENUM('spam', 'inappropriate', 'fraud', 'harassment', 'other'),
  description TEXT NOT NULL,
  status ENUM('pending', 'under_review', 'resolved', 'dismissed') DEFAULT 'pending',
  admin_notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
)
```

#### Disputes Table
```sql
disputes (
  id UUID PRIMARY KEY,
  client_id UUID REFERENCES users(id),
  landlord_id UUID REFERENCES users(id),
  application_id UUID REFERENCES applications(id),
  dispute_type ENUM('payment', 'property', 'service', 'other'),
  description TEXT NOT NULL,
  status ENUM('open', 'under_review', 'resolved', 'closed') DEFAULT 'open',
  resolution TEXT,
  admin_notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
)
```

#### Platform Settings Table
```sql
platform_settings (
  id UUID PRIMARY KEY,
  commission_rate DECIMAL DEFAULT 0.05,
  platform_fee DECIMAL DEFAULT 0,
  currency_settings JSONB,
  email_templates JSONB,
  maintenance_mode BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMP DEFAULT NOW()
)
```

#### Audit Logs Table
```sql
audit_logs (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  action VARCHAR NOT NULL,
  resource_type VARCHAR NOT NULL,
  resource_id VARCHAR NOT NULL,
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
)
```

## User Management

### Client Features
- Browse and search properties
- Save favorite properties
- Submit rental applications
- Make rent payments
- Chat with landlords
- Upload KYC documents
- Track application status
- View payment history
- Schedule property viewings
- Submit maintenance requests
- Rate and review properties

### Landlord Features
- Create and manage property listings
- Review tenant applications
- Accept/reject applications
- Manage rent payments
- Chat with clients
- Upload property documents
- View property analytics
- Manage property availability
- Handle maintenance requests
- Schedule property viewings

### Admin Features
- Manage all users
- Approve/reject properties
- Handle KYC verification
- Manage transactions and commissions
- Resolve disputes
- Moderate content
- Platform analytics
- Email management
- Audit logs
- Platform settings

## Property Management

### Property Types (Nigeria-focused)
- Self Contain (Studio)
- Mini Flat (1 Bedroom)
- 1-4 Bedroom Flats
- Bungalow
- Detached/Semi-Detached/Terraced Duplex
- Mansion
- Penthouse
- Shop/Office Space
- Warehouse

### Property Features
- Multi-currency support (USD, NGN)
- Image and video uploads
- Document management
- Amenities selection
- Location with coordinates
- Availability management
- Verification workflow
- Analytics and insights

### Required Endpoints
```
GET /properties - List properties with filters
GET /properties/:id - Get property details
POST /properties - Create property (landlord)
PUT /properties/:id - Update property (landlord)
DELETE /properties/:id - Delete property (landlord)
POST /properties/:id/images - Upload property images
POST /properties/:id/documents - Upload property documents
PUT /properties/:id/availability - Toggle availability
GET /properties/search - Advanced property search
```

## Application Management

### Application Workflow
1. Client submits application
2. Landlord reviews application
3. Landlord accepts/rejects
4. Payment processing (if accepted)
5. Chat communication
6. Maintenance requests

### Required Endpoints
```
GET /applications - List applications (role-based)
GET /applications/:id - Get application details
POST /applications - Submit application (client)
PUT /applications/:id/status - Update status (landlord)
PUT /applications/:id/notes - Add notes (landlord/admin)
GET /applications/user/:userId - User's applications
```

## Payment System

### Payment Features
- Stripe integration
- Multi-currency support
- Commission calculation
- Receipt generation
- Refund processing
- Payment history
- Webhook handling

### Required Endpoints
```
POST /payments/create-checkout - Create Stripe checkout session
POST /payments/confirm - Confirm payment
POST /payments/webhook - Stripe webhook handler
GET /payments - List payments (role-based)
GET /payments/:id - Get payment details
GET /payments/receipt/:id - Generate receipt
POST /payments/refund - Process refund
```

## Chat & Messaging

### Chat Features
- Real-time messaging
- File sharing
- Content moderation
- Message history
- Read receipts
- Admin monitoring

### Content Moderation
- Profanity filtering
- Spam detection
- Inappropriate content flagging
- Admin notification system
- Message logging

### Required Endpoints
```
GET /chat/:applicationId/messages - Get chat messages
POST /chat/:applicationId/messages - Send message
PUT /chat/messages/:id/read - Mark as read
POST /chat/:applicationId/files - Upload file
GET /chat/:applicationId/history - Message history
```

## KYC & Verification

### KYC Process
1. Personal information collection
2. Document upload (ID, proof of address, bank statement, employment letter)
3. Admin review
4. Approval/rejection
5. Verification status update

### Required Endpoints
```
GET /kyc/:userId - Get KYC data
POST /kyc/:userId - Submit KYC data
PUT /kyc/:userId/verify - Admin verification
GET /kyc/pending - List pending KYC (admin)
PUT /kyc/:userId/status - Update verification status
```

## Notifications & Email

### Notification Types
- Application status updates
- Payment confirmations
- New messages
- System announcements
- Admin notifications
- Maintenance alerts

### Email Templates
- Welcome email
- Email verification
- Password reset
- Application updates
- Payment confirmations
- Receipt generation

### Required Endpoints
```
GET /notifications - Get user notifications
PUT /notifications/:id/read - Mark as read
PUT /notifications/read-all - Mark all as read
POST /notifications/send - Send notification
GET /email/templates - Get email templates
POST /email/send - Send email
```

## Admin Features

### User Management
- List and filter users
- Verify user accounts
- Manage user roles
- KYC verification workflow
- User analytics

### Property Management
- Approve/reject properties
- Property verification
- Bulk operations
- Property analytics

### Transaction Management
- View all transactions
- Commission management
- Payout processing
- Financial analytics

### Content Moderation
- Review reported content
- Handle disputes
- Manage violations
- Audit logs

### Platform Management
- Platform settings
- Commission rates
- Email templates
- System maintenance

### Required Endpoints
```
GET /admin/users - List all users
PUT /admin/users/:id/verify - Verify user
GET /admin/properties - List all properties
PUT /admin/properties/:id/verify - Verify property
GET /admin/transactions - List all transactions
GET /admin/reports - List reports
PUT /admin/reports/:id/status - Update report status
GET /admin/disputes - List disputes
PUT /admin/disputes/:id/resolve - Resolve dispute
GET /admin/analytics - Platform analytics
PUT /admin/settings - Update platform settings
```

## File Management

### File Upload Features
- Image optimization
- Document validation
- File type restrictions
- Size limits
- Secure storage
- CDN integration

### File Types
- Property images (JPG, PNG, WebP)
- Property videos (MP4, MOV)
- Documents (PDF, DOC, DOCX)
- KYC documents (PDF, JPG, PNG)

### Required Endpoints
```
POST /upload/images - Upload images
POST /upload/documents - Upload documents
POST /upload/kyc - Upload KYC documents
DELETE /files/:id - Delete file
GET /files/:id - Get file info
```

## API Endpoints Summary

### Authentication
- `POST /auth/register` - User registration
- `POST /auth/login` - User login
- `POST /auth/logout` - User logout
- `POST /auth/forgot-password` - Password reset request
- `POST /auth/reset-password` - Password reset
- `POST /auth/verify-email` - Email verification
- `GET /auth/me` - Get current user
- `PUT /auth/profile` - Update profile

### Properties
- `GET /properties` - List properties
- `GET /properties/:id` - Get property details
- `POST /properties` - Create property
- `PUT /properties/:id` - Update property
- `DELETE /properties/:id` - Delete property
- `POST /properties/:id/images` - Upload images
- `POST /properties/:id/documents` - Upload documents
- `PUT /properties/:id/availability` - Toggle availability
- `GET /properties/search` - Search properties

### Applications
- `GET /applications` - List applications
- `GET /applications/:id` - Get application details
- `POST /applications` - Submit application
- `PUT /applications/:id/status` - Update status
- `PUT /applications/:id/notes` - Add notes
- `GET /applications/user/:userId` - User applications

### Payments
- `POST /payments/create-checkout` - Create checkout
- `POST /payments/confirm` - Confirm payment
- `POST /payments/webhook` - Webhook handler
- `GET /payments` - List payments
- `GET /payments/:id` - Get payment details
- `GET /payments/receipt/:id` - Generate receipt
- `POST /payments/refund` - Process refund

### Chat
- `GET /chat/:applicationId/messages` - Get messages
- `POST /chat/:applicationId/messages` - Send message
- `PUT /chat/messages/:id/read` - Mark as read
- `POST /chat/:applicationId/files` - Upload file
- `GET /chat/:applicationId/history` - Message history

### KYC
- `GET /kyc/:userId` - Get KYC data
- `POST /kyc/:userId` - Submit KYC
- `PUT /kyc/:userId/verify` - Verify KYC
- `GET /kyc/pending` - List pending KYC
- `PUT /kyc/:userId/status` - Update status

### Notifications
- `GET /notifications` - Get notifications
- `PUT /notifications/:id/read` - Mark as read
- `PUT /notifications/read-all` - Mark all as read
- `POST /notifications/send` - Send notification

### Admin
- `GET /admin/users` - List users
- `PUT /admin/users/:id/verify` - Verify user
- `GET /admin/properties` - List properties
- `PUT /admin/properties/:id/verify` - Verify property
- `GET /admin/transactions` - List transactions
- `GET /admin/reports` - List reports
- `PUT /admin/reports/:id/status` - Update report
- `GET /admin/disputes` - List disputes
- `PUT /admin/disputes/:id/resolve` - Resolve dispute
- `GET /admin/analytics` - Platform analytics
- `PUT /admin/settings` - Update settings

### File Management
- `POST /upload/images` - Upload images
- `POST /upload/documents` - Upload documents
- `POST /upload/kyc` - Upload KYC docs
- `DELETE /files/:id` - Delete file
- `GET /files/:id` - Get file info

## Security & Validation

### Security Features
- JWT token authentication
- Role-based access control
- Input validation and sanitization
- Rate limiting
- CORS configuration
- SQL injection prevention
- XSS protection
- File upload validation
- Content moderation
- Audit logging

### Validation Rules
- Email format validation
- Password strength requirements
- File type and size validation
- Property data validation
- Payment amount validation
- Message content validation

## Environment Configuration

### Required Environment Variables
```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/landlordnoagent
REDIS_URL=redis://localhost:6379

# Authentication
JWT_SECRET=your-jwt-secret
JWT_EXPIRES_IN=7d

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLIC_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Email
RESEND_API_KEY=re_...
EMAIL_FROM=noreply@landlordnoagent.com
EMAIL_REPLY_TO=support@landlordnoagent.com

# File Storage
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1
AWS_S3_BUCKET=landlordnoagent-uploads

# Application
NODE_ENV=development
PORT=3001
CORS_ORIGIN=http://localhost:3000
```

## Technology Stack Recommendations

### Backend Framework
- **Node.js** with **Express.js** or **Fastify**
- **TypeScript** for type safety
- **Prisma** or **TypeORM** for database ORM
- **PostgreSQL** for primary database
- **Redis** for caching and sessions

### Authentication
- **JWT** for token management
- **bcrypt** for password hashing
- **express-rate-limit** for rate limiting

### Payment Processing
- **Stripe** for payment processing
- **stripe-node** for server-side integration

### File Storage
- **AWS S3** or **Cloudinary** for file storage
- **multer** for file upload handling
- **sharp** for image optimization

### Email Service
- **Resend** or **SendGrid** for email delivery
- **nodemailer** for email sending

### Real-time Communication
- **Socket.io** for real-time chat
- **Redis** for message queuing

### Monitoring & Logging
- **Winston** for logging
- **Morgan** for HTTP request logging
- **Sentry** for error tracking

## Development Guidelines

1. **API Design**: Follow RESTful conventions
2. **Error Handling**: Implement consistent error responses
3. **Validation**: Validate all inputs on server-side
4. **Security**: Implement proper authentication and authorization
5. **Testing**: Write unit and integration tests
6. **Documentation**: Document all API endpoints
7. **Performance**: Implement caching and optimization
8. **Monitoring**: Set up logging and monitoring
9. **Backup**: Implement database backup strategy
10. **Deployment**: Use containerization (Docker)

## Next Steps

1. Set up the database schema
2. Implement authentication system
3. Create user management APIs
4. Build property management features
5. Implement payment system
6. Add chat functionality
7. Create admin panel APIs
8. Implement file upload system
9. Add notification system
10. Set up monitoring and logging

This comprehensive backend will support all the features visible in the frontend application and provide a solid foundation for the rental property management platform.
>>>>>>> de8eed21a124426eedf0fe71d24c83f38a6359b5
