import { Resend } from 'resend';
import { config } from '../config';
import { logger } from '../config/logger';

// Email verification interface
export interface EmailVerificationData {
  email: string;
  verificationCode: string;
  firstName?: string;
}

// Password reset interface
export interface PasswordResetData {
  email: string;
  resetToken: string;
  firstName?: string;
}

// Welcome email interface
export interface WelcomeEmailData {
  email: string;
  firstName: string;
  role: string;
}

// Application notification interface
export interface ApplicationNotificationData {
  email: string;
  firstName: string;
  propertyTitle: string;
  status: string;
  landlordName?: string;
}

// Payment notification interface
export interface PaymentNotificationData {
  email: string;
  firstName: string;
  amount: number;
  currency: string;
  propertyTitle: string;
  transactionId: string;
}

// Initialize Resend
const resend = new Resend(config.email.resendApiKey);

/**
 * Send email verification code
 */
export async function sendVerificationEmail(data: EmailVerificationData): Promise<boolean> {
  try {
    const { data: emailData, error } = await resend.emails.send({
      from: config.email.from,
      to: [data.email],
      subject: 'Verify Your Email Address - LandlordNoAgent',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Email Verification</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
            .container { max-width: 600px; margin: 0 auto; background: white; padding: 20px; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
            .header { text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; margin: -20px -20px 20px -20px; }
            .header h1 { margin: 0; font-size: 28px; font-weight: bold; }
            .content { padding: 20px 0; }
            .verification-code { background: #f8f9fa; border: 2px dashed #007bff; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
            .code { font-size: 32px; font-weight: bold; color: #007bff; letter-spacing: 5px; font-family: 'Courier New', monospace; }
            .instructions { background: #e9ecef; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 14px; }
            .button { display: inline-block; background: #007bff; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; margin: 10px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🏠 LandlordNoAgent</h1>
              <p>Welcome to the future of rental property management!</p>
            </div>
            
            <div class="content">
              <h2>Hello${data.firstName ? ` ${data.firstName}` : ''}! 👋</h2>
              
              <p>Thank you for signing up with LandlordNoAgent! To complete your registration and start using our platform, please verify your email address using the code below:</p>
              
              <div class="verification-code">
                <p><strong>Your Verification Code:</strong></p>
                <div class="code">${data.verificationCode}</div>
                <p><small>This code will expire in 10 minutes</small></p>
              </div>
              
              <div class="instructions">
                <h3>📝 How to verify:</h3>
                <ol>
                  <li>Go back to the LandlordNoAgent app</li>
                  <li>Enter the verification code above</li>
                  <li>Click "Verify Email"</li>
                  <li>Start exploring amazing properties!</li>
                </ol>
              </div>
              
              <p>If you didn't create an account with us, please ignore this email.</p>
              
              <p>Need help? Contact our support team at <a href="mailto:support@landlordnoagent.com">support@landlordnoagent.com</a></p>
            </div>
            
            <div class="footer">
              <p>© 2024 LandlordNoAgent. All rights reserved.</p>
              <p>This is an automated message, please do not reply to this email.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    if (error) {
      logger.error('Resend email error:', error);
      return false;
    }

    logger.info(`Verification email sent to: ${data.email}, ID: ${emailData?.id}`);
    return true;
  } catch (error) {
    logger.error('Send verification email error:', error);
    return false;
  }
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(data: PasswordResetData): Promise<boolean> {
  try {
    const { data: emailData, error } = await resend.emails.send({
      from: config.email.from,
      to: [data.email],
      subject: 'Reset Your Password - LandlordNoAgent',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Password Reset</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
            .container { max-width: 600px; margin: 0 auto; background: white; padding: 20px; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
            .header { text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; margin: -20px -20px 20px -20px; }
            .header h1 { margin: 0; font-size: 28px; font-weight: bold; }
            .content { padding: 20px 0; }
            .reset-link { background: #f8f9fa; border: 2px dashed #dc3545; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
            .link { font-size: 16px; color: #dc3545; word-break: break-all; }
            .button { display: inline-block; background: #dc3545; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; margin: 10px 0; }
            .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔒 LandlordNoAgent</h1>
              <p>Password Reset Request</p>
            </div>
            
            <div class="content">
              <h2>Hello${data.firstName ? ` ${data.firstName}` : ''}! 👋</h2>
              
              <p>We received a request to reset your password for your LandlordNoAgent account.</p>
              
              <div class="reset-link">
                <p><strong>Reset Token:</strong></p>
                <div class="link">${data.resetToken}</div>
                <p><small>This token will expire in 1 hour</small></p>
              </div>
              
              <p>Use this token to reset your password. If you didn't request this reset, please ignore this email and your password will remain unchanged.</p>
              
              <p>Need help? Contact our support team at <a href="mailto:support@landlordnoagent.com">support@landlordnoagent.com</a></p>
            </div>
            
            <div class="footer">
              <p>© 2024 LandlordNoAgent. All rights reserved.</p>
              <p>This is an automated message, please do not reply to this email.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    if (error) {
      logger.error('Resend email error:', error);
      return false;
    }

    logger.info(`Password reset email sent to: ${data.email}, ID: ${emailData?.id}`);
    return true;
  } catch (error) {
    logger.error('Send password reset email error:', error);
    return false;
  }
}

/**
 * Send welcome email
 */
export async function sendWelcomeEmail(data: WelcomeEmailData): Promise<boolean> {
  try {
    const roleMessage = data.role === 'CLIENT' 
      ? 'Start exploring amazing properties and find your perfect home!'
      : 'List your properties and connect with potential tenants!';

    const { data: emailData, error } = await resend.emails.send({
      from: config.email.from,
      to: [data.email],
      subject: 'Welcome to LandlordNoAgent! 🎉',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Welcome to LandlordNoAgent</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
            .container { max-width: 600px; margin: 0 auto; background: white; padding: 20px; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
            .header { text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; margin: -20px -20px 20px -20px; }
            .header h1 { margin: 0; font-size: 28px; font-weight: bold; }
            .content { padding: 20px 0; }
            .welcome-box { background: #d4edda; border: 1px solid #c3e6cb; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; }
            .button { display: inline-block; background: #28a745; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; margin: 10px 5px; }
            .features { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 20px 0; }
            .feature { background: #f8f9fa; padding: 15px; border-radius: 5px; text-align: center; }
            .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 Welcome to LandlordNoAgent!</h1>
              <p>Your account has been successfully verified!</p>
            </div>
            
            <div class="content">
              <h2>Hello ${data.firstName}! 👋</h2>
              
              <div class="welcome-box">
                <h3>🎊 Congratulations!</h3>
                <p>Your email has been verified and your account is now active!</p>
              </div>
              
              <p>${roleMessage}</p>
              
              <div class="features">
                <div class="feature">
                  <h4>🏠 Properties</h4>
                  <p>Browse and manage rental properties</p>
                </div>
                <div class="feature">
                  <h4>💬 Chat</h4>
                  <p>Communicate directly with landlords/tenants</p>
                </div>
                <div class="feature">
                  <h4>💳 Payments</h4>
                  <p>Secure payment processing</p>
                </div>
                <div class="feature">
                  <h4>📱 Mobile</h4>
                  <p>Access from anywhere, anytime</p>
                </div>
              </div>
              
              <div style="text-align: center;">
                <a href="${config.server.corsOrigin}/dashboard" class="button">Get Started</a>
                <a href="${config.server.corsOrigin}/properties" class="button">Browse Properties</a>
              </div>
              
              <p>Need help? Contact our support team at <a href="mailto:support@landlordnoagent.com">support@landlordnoagent.com</a></p>
            </div>
            
            <div class="footer">
              <p>© 2024 LandlordNoAgent. All rights reserved.</p>
              <p>This is an automated message, please do not reply to this email.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    if (error) {
      logger.error('Resend email error:', error);
      return false;
    }

    logger.info(`Welcome email sent to: ${data.email}, ID: ${emailData?.id}`);
    return true;
  } catch (error) {
    logger.error('Send welcome email error:', error);
    return false;
  }
}

/**
 * Send application status notification
 */
export async function sendApplicationNotification(data: ApplicationNotificationData): Promise<boolean> {
  try {
    const statusEmoji = data.status === 'ACCEPTED' ? '🎉' : data.status === 'REJECTED' ? '😔' : '📋';
    const statusColor = data.status === 'ACCEPTED' ? '#28a745' : data.status === 'REJECTED' ? '#dc3545' : '#007bff';

    const { data: emailData, error } = await resend.emails.send({
      from: config.email.from,
      to: [data.email],
      subject: `Application Update: ${data.propertyTitle} - ${data.status}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Application Update</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
            .container { max-width: 600px; margin: 0 auto; background: white; padding: 20px; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
            .header { text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; margin: -20px -20px 20px -20px; }
            .header h1 { margin: 0; font-size: 28px; font-weight: bold; }
            .content { padding: 20px 0; }
            .status-box { background: ${statusColor}20; border: 2px solid ${statusColor}; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
            .status { font-size: 24px; font-weight: bold; color: ${statusColor}; }
            .button { display: inline-block; background: ${statusColor}; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; margin: 10px 0; }
            .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${statusEmoji} LandlordNoAgent</h1>
              <p>Application Status Update</p>
            </div>
            
            <div class="content">
              <h2>Hello ${data.firstName}! 👋</h2>
              
              <p>We have an update regarding your application for:</p>
              <h3>🏠 ${data.propertyTitle}</h3>
              
              <div class="status-box">
                <div class="status">${data.status}</div>
                ${data.landlordName ? `<p>From: ${data.landlordName}</p>` : ''}
              </div>
              
              <p>Please log in to your account to view the full details and next steps.</p>
              
              <div style="text-align: center;">
                <a href="${config.server.corsOrigin}/applications" class="button">View Application</a>
              </div>
              
              <p>Need help? Contact our support team at <a href="mailto:support@landlordnoagent.com">support@landlordnoagent.com</a></p>
            </div>
            
            <div class="footer">
              <p>© 2024 LandlordNoAgent. All rights reserved.</p>
              <p>This is an automated message, please do not reply to this email.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    if (error) {
      logger.error('Resend email error:', error);
      return false;
    }

    logger.info(`Application notification sent to: ${data.email}, ID: ${emailData?.id}`);
    return true;
  } catch (error) {
    logger.error('Send application notification error:', error);
    return false;
  }
}

/**
 * Send payment confirmation email
 */
export async function sendPaymentConfirmation(data: PaymentNotificationData): Promise<boolean> {
  try {
    const { data: emailData, error } = await resend.emails.send({
      from: config.email.from,
      to: [data.email],
      subject: `Payment Confirmation - ${data.currency} ${data.amount} - LandlordNoAgent`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Payment Confirmation</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
            .container { max-width: 600px; margin: 0 auto; background: white; padding: 20px; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
            .header { text-align: center; background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; margin: -20px -20px 20px -20px; }
            .header h1 { margin: 0; font-size: 28px; font-weight: bold; }
            .content { padding: 20px 0; }
            .payment-details { background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 8px; padding: 20px; margin: 20px 0; }
            .amount { font-size: 32px; font-weight: bold; color: #28a745; text-align: center; margin: 10px 0; }
            .button { display: inline-block; background: #28a745; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; margin: 10px 0; }
            .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>💳 LandlordNoAgent</h1>
              <p>Payment Confirmation</p>
            </div>
            
            <div class="content">
              <h2>Hello ${data.firstName}! 👋</h2>
              
              <p>Your payment has been successfully processed!</p>
              
              <div class="payment-details">
                <h3>Payment Details:</h3>
                <p><strong>Property:</strong> ${data.propertyTitle}</p>
                <div class="amount">${data.currency} ${data.amount}</div>
                <p><strong>Transaction ID:</strong> ${data.transactionId}</p>
                <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
              </div>
              
              <p>Thank you for using LandlordNoAgent for your rental needs!</p>
              
              <div style="text-align: center;">
                <a href="${config.server.corsOrigin}/payments" class="button">View Payment History</a>
              </div>
              
              <p>Need help? Contact our support team at <a href="mailto:support@landlordnoagent.com">support@landlordnoagent.com</a></p>
            </div>
            
            <div class="footer">
              <p>© 2024 LandlordNoAgent. All rights reserved.</p>
              <p>This is an automated message, please do not reply to this email.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    if (error) {
      logger.error('Resend email error:', error);
      return false;
    }

    logger.info(`Payment confirmation sent to: ${data.email}, ID: ${emailData?.id}`);
    return true;
  } catch (error) {
    logger.error('Send payment confirmation error:', error);
    return false;
  }
}

/**
 * Generate verification code
 */
export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Generate reset token
 */
export function generateResetToken(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}
