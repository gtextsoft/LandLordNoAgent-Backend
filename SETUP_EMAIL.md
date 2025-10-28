# 📧 Email Setup Guide

## Problem
You're seeing this error:
```
Error sending OTP email: Error: Invalid login: 535 5.7.0 Invalid credentials
```

This means your email SMTP credentials are missing or incorrect in your `.env` file.

## Solution: Set Up Mailtrap for Development

### Step 1: Create/Update Your .env File

Create a `.env` file in the root directory (`LandLordNoAgentBackend/`) with the following content:

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

# Email Configuration (for OTP) - Mailtrap Setup
EMAIL_HOST=sandbox.smtp.mailtrap.io
EMAIL_PORT=2525
EMAIL_USER=your-mailtrap-username
EMAIL_PASSWORD=your-mailtrap-password
EMAIL_FROM=noreply@landlordnoagent.com

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

### Step 2: Get Mailtrap Credentials

1. Go to [mailtrap.io](https://mailtrap.io)
2. Sign up for a free account (no credit card required)
3. Create a new inbox (click "Add Inbox")
4. Navigate to "SMTP Settings" tab in your inbox
5. Copy your credentials:
   - **Username** (put this in `EMAIL_USER`)
   - **Password** (put this in `EMAIL_PASSWORD`)

### Step 3: Update Your .env File

Replace the placeholders in your `.env` file:
```env
EMAIL_USER=abc123def456   # Your actual Mailtrap username
EMAIL_PASSWORD=xyz789uvw012   # Your actual Mailtrap password
```

### Step 4: Restart Your Server

Stop your server (Ctrl+C) and restart it:
```bash
npm run dev
```

### Step 5: Test

Try registering a new user or resending an OTP. The OTP will be:
- ✅ Sent to your Mailtrap inbox (viewable online)
- ✅ Also logged to console for quick testing

## 🔍 How to View Test Emails in Mailtrap

1. Go to your Mailtrap inbox
2. You'll see all test emails there
3. Click on any email to view:
   - HTML content
   - Plain text
   - Headers
   - Attachment analysis

## ⚠️ Important Notes

- **Sandbox vs Live**: The credentials you just set up are for Mailtrap's **Sandbox** (Email Testing), which **does NOT send emails to real users** - it only captures them for viewing in your inbox
- **To Send Real Emails**: You need to use Mailtrap's **Email Sending** feature with different credentials (see below)
- **Development Mode**: The app will still log OTPs to console even if email fails, so you can continue testing
- **Production**: Make sure to configure real email credentials before deploying
- **Free Tier**: Mailtrap free tier allows up to 100 emails/month

## 🔴 Sending Real Emails to Users

If you want to **actually send emails to real users** during development, you have 3 options:

### Option 1: Use Mailtrap Email Sending (Recommended for Dev)

Mailtrap also has an "Email Sending" feature that actually sends to real recipients:

1. Go to Mailtrap → "Email Sending" in the sidebar
2. Click "Add Domain" or use their transactional SMTP
3. Use these **different** credentials:
   - **Host**: `smtp.mailtrap.io`
   - **Port**: `587` or `2525`
   - **Username**: Your Email Sending username (different from sandbox)
   - **Password**: Your Email Sending password (different from sandbox)

Update your `.env`:
```env
EMAIL_HOST=smtp.mailtrap.io
EMAIL_PORT=587
EMAIL_USER=your-email-sending-username
EMAIL_PASSWORD=your-email-sending-password
```

### Option 2: Use Gmail (Easy Setup)

For quick real email testing:

1. Enable 2-Factor Auth on Gmail
2. Create an App Password (Google Account → Security → App passwords)
3. Update your `.env`:
```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-gmail@gmail.com
EMAIL_PASSWORD=your-16-char-app-password
```

### Option 3: Use SendGrid or Resend (Production-Ready)

- **SendGrid**: Free tier with 100 emails/day
- **Resend**: Modern email API, free tier available

Check the `EMAIL_SETUP.md` file for detailed instructions on these services.

## ✅ What I Fixed

I've updated the email handling code to:
- Better handle missing/incorrect credentials
- Not crash the registration process when email fails
- Show clearer error messages with emojis
- Log OTP to console for easy testing in development
- Gracefully degrade when email service is unavailable

You can now test the registration flow even without email configured!

