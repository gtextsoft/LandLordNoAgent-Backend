# Email Configuration Setup

## Quick Fix for Email Issues

Your backend is experiencing email connection timeouts. Here's how to fix it:

## Option 1: Mailtrap Setup (Recommended for Development)

1. **Sign up at [mailtrap.io](https://mailtrap.io)**
2. **Create a new inbox** for your project
3. **Get your SMTP credentials** from the inbox settings
4. **Update your `.env` file**:

```env
EMAIL_HOST=sandbox.smtp.mailtrap.io
EMAIL_PORT=2525
EMAIL_USER=your-mailtrap-username
EMAIL_PASSWORD=your-mailtrap-password
EMAIL_FROM=noreply@landlordnoagent.com
```

## Option 2: Gmail Setup (Alternative)

1. **Enable 2-Factor Authentication** on your Gmail account
2. **Generate an App Password**:
   - Go to Google Account settings
   - Security → 2-Step Verification → App passwords
   - Generate a new app password for "Mail"
3. **Update your `.env` file**:

```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-16-character-app-password
EMAIL_FROM=noreply@landlordnoagent.com
```

## Option 2: Use Resend (Recommended for Production)

1. **Sign up at [resend.com](https://resend.com)**
2. **Get your API key**
3. **Update your `.env` file**:

```env
RESEND_API_KEY=re_your_api_key_here
EMAIL_HOST=smtp.resend.com
EMAIL_PORT=587
EMAIL_USER=resend
EMAIL_PASSWORD=your_resend_api_key
```

## Option 3: Use Mailgun

1. **Sign up at [mailgun.com](https://mailgun.com)**
2. **Get your SMTP credentials**
3. **Update your `.env` file**:

```env
EMAIL_HOST=smtp.mailgun.org
EMAIL_PORT=587
EMAIL_USER=postmaster@your-domain.mailgun.org
EMAIL_PASSWORD=your-mailgun-password
```

## Option 4: Use SendGrid

1. **Sign up at [sendgrid.com](https://sendgrid.com)**
2. **Get your SMTP credentials**
3. **Update your `.env` file**:

```env
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=587
EMAIL_USER=apikey
EMAIL_PASSWORD=your-sendgrid-api-key
```

## Testing Your Configuration

After updating your `.env` file:

1. **Restart your server**: `npm run dev`
2. **Test registration** - the OTP will be logged to console if email fails
3. **Check server logs** for connection success/failure

## Troubleshooting

- **Connection timeout**: Check your internet connection and firewall settings
- **Authentication failed**: Verify your email credentials
- **Port blocked**: Try port 465 with `secure: true` instead of 587
- **Rate limiting**: The system is configured to handle rate limits automatically

## Development Mode

In development mode, if email fails, the OTP will be logged to the console so you can still test the functionality.
