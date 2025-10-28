# 🚀 Quick Fix: Set Up Resend for Render

## The Problem
You're getting **"Connection timeout"** on Render because:
- Render **blocks SMTP ports** (587, 465, 2525)
- Gmail SMTP requires these ports
- This won't work on Render

## The Solution: Use Resend API ✅

Resend uses HTTPS (port 443) which works everywhere, including Render!

## Step 1: Get Resend API Key

1. Go to [resend.com](https://resend.com)
2. Sign up for free account
3. Go to **"API Keys"** in sidebar
4. Click **"Create API Key"**
5. Name it "Landlord No Agent Backend"
6. Copy the API key (starts with `re_...`)

## Step 2: Add to Render Environment Variables

In your Render dashboard:

1. Go to your service
2. Click **"Environment"** in sidebar
3. Add this variable:
   ```
   RESEND_API_KEY=re_your_actual_api_key_here
   ```
4. Click **"Save Changes"**
5. Your service will automatically restart

## Step 3: Optional - Set From Address

If you have your own domain configured with Resend:
```
EMAIL_FROM=Landlord No Agent <noreply@yourdomain.com>
```

Otherwise, it will use:
```
EMAIL_FROM=Landlord No Agent <onboarding@resend.dev>
```

## Step 4: Verify It Works

1. Test registration on your app
2. Check server logs for:
   ```
   📧 Attempting to send via Resend API...
   ✅ OTP email sent successfully via Resend: abc123
   ```
3. Check the user's actual email inbox - they should receive the OTP!

## What I Changed

I updated `routes/auth.js` to:
- ✅ Try Resend API **first** (works on Render)
- ✅ Fall back to SMTP if Resend fails (for local dev)
- ✅ Skip SMTP verification in production (avoids timeout)
- ✅ Better error logging with emojis

## Free Tier Limits

- **100 emails/day** on Resend free tier
- Perfect for development and testing!
- Upgrade when you need more

## Troubleshooting

**Email not arriving?**
- Check spam folder
- Verify the email address is correct
- Check Resend dashboard for email logs
- Check server logs for errors

**Still seeing timeouts?**
- Make sure `RESEND_API_KEY` is set in Render
- Restart the service after adding env var
- Check spelling of environment variable name

## Why This Works

- **Resend**: Uses HTTPS API (always allowed on Render)
- **Gmail SMTP**: Requires port 587/465 (blocked on Render)
- **Mailtrap**: Only for testing, doesn't send to real users

Your app is now configured to work on Render! 🎉

