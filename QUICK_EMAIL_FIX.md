# 🔴 Quick Fix: Mailtrap Sandbox vs Real Emails

## The Problem
You're seeing OTPs in your Mailtrap inbox but NOT in the user's actual email.

**Why?** Because you're using Mailtrap's **Sandbox** (Email Testing), which **only captures emails** - it doesn't send them to real recipients!

## Quick Solutions

### Option A: Use Gmail (Fastest)

1. **Enable 2-Factor Auth** on your Gmail
2. **Create App Password**:
   - Go to https://myaccount.google.com/security
   - 2-Step Verification → App passwords
   - Generate password for "Mail"
3. **Update `.env`**:
```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=abcd-efgh-ijkl-mnop
```
4. **Restart server** - now emails go to real users!

---

### Option B: Use Mailtrap Email Sending

1. Go to Mailtrap.io → **"Email Sending"** (NOT Email Testing)
2. Click **"Add Domain"** or use SMTP credentials
3. Get the **Email Sending** credentials (different from sandbox)
4. **Update `.env`**:
```env
EMAIL_HOST=smtp.mailtrap.io
EMAIL_PORT=587
EMAIL_USER=your-email-sending-username
EMAIL_PASSWORD=your-email-sending-password
```
5. **Restart server**

---

### Option C: Use Resend (Modern & Easy)

1. Sign up at https://resend.com
2. Get API key
3. **Update `.env`**:
```env
EMAIL_HOST=smtp.resend.com
EMAIL_PORT=465
EMAIL_USER=resend
EMAIL_PASSWORD=re_your_api_key_here
```
4. **Restart server**

---

## Test It

After updating `.env` and restarting:

1. Register a new user
2. Check if OTP arrives in their actual email inbox
3. Check server console for any errors

## Current Behavior

Right now with Mailtrap Sandbox:
- ✅ Emails are being "sent" successfully
- ✅ You can see them in Mailtrap inbox
- ❌ But they DON'T reach real users (by design)

That's exactly what's supposed to happen with the Sandbox - it's for testing email templates, not sending to real users!

