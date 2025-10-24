# Mailtrap Setup Guide

## 🚀 Quick Setup for Mailtrap

### Step 1: Create Mailtrap Account
1. Go to [mailtrap.io](https://mailtrap.io)
2. Sign up for a free account
3. Verify your email address

### Step 2: Create an Inbox
1. After logging in, click "Add Inbox"
2. Name it "Landlord No Agent" or similar
3. Click "Create Inbox"

### Step 3: Get SMTP Credentials
1. Click on your new inbox
2. Go to "SMTP Settings" tab
3. Copy the following credentials:
   - **Host**: `sandbox.smtp.mailtrap.io`
   - **Port**: `2525`
   - **Username**: (your username)
   - **Password**: (your password)

### Step 4: Update Your .env File
Add these lines to your `.env` file:

```env
EMAIL_HOST=sandbox.smtp.mailtrap.io
EMAIL_PORT=2525
EMAIL_USER=your-mailtrap-username
EMAIL_PASSWORD=your-mailtrap-password
EMAIL_FROM=noreply@landlordnoagent.com
```

### Step 5: Test Your Configuration
Run the test script:

```bash
node test-email.js
```

### Step 6: Restart Your Server
```bash
npm run dev
```

## ✅ Benefits of Mailtrap

- **Safe Testing**: Emails are caught and never sent to real recipients
- **No Spam**: Perfect for development and testing
- **Easy Debugging**: View email content and headers
- **Free Plan**: Up to 100 emails per month
- **Reliable**: No connection timeouts or authentication issues

## 🔍 How to View Test Emails

1. Go to your Mailtrap inbox
2. Click on "Inboxes" in the sidebar
3. Select your inbox
4. You'll see all test emails sent from your application
5. Click on any email to view its content, headers, and HTML

## 🚨 Troubleshooting

- **Connection timeout**: Check your internet connection
- **Authentication failed**: Verify your username and password
- **Port blocked**: Make sure port 2525 is not blocked by firewall
- **Rate limiting**: Mailtrap has generous limits, but avoid sending too many emails at once

## 📧 Production Migration

When you're ready for production, you can:
1. Use Mailtrap's "Live" feature to send real emails
2. Switch to a production email service like SendGrid, Mailgun, or AWS SES
3. Keep using Mailtrap for testing while using another service for production
