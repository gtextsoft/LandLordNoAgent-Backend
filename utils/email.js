const nodemailer = require('nodemailer');
const { Resend } = require('resend');

// Initialize Resend if API key is available
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Create email transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    // host: process.env.EMAIL_HOST || 'sandbox.smtp.mailtrap.io',
    port: process.env.EMAIL_PORT || 587,
    // port: process.env.EMAIL_PORT || 2525,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    },
    connectionTimeout: 60000, // 60 seconds
    greetingTimeout: 30000,   // 30 seconds
    socketTimeout: 60000,     // 60 seconds
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    rateLimit: 14, // max 14 emails per second
    debug: process.env.NODE_ENV === 'development'
  });
};

// Generate OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Send OTP email
const sendOTPEmail = async (email, otp, firstName = 'User') => {
  try {
    // Check if email configuration is available
    if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      console.warn('⚠️  Email configuration missing in .env file');
      console.log('🔑 OTP for development:', otp);
      return { success: false, error: 'Email configuration missing' };
    }

    const transporter = createTransporter();
    
    // Verify transporter configuration (skip in development if it fails)
    try {
      await transporter.verify();
    } catch (verifyError) {
      console.error('❌ Email transporter verification failed:', verifyError.message);
      console.log('🔑 OTP for development:', otp);
      // In development, don't throw error - just log OTP
      if (process.env.NODE_ENV === 'production') {
        throw verifyError;
      }
      return { success: false, error: verifyError.message };
    }
    
    const mailOptions = {
      from: `"Landlord No Agent" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Your OTP for Landlord No Agent',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #f8f9fa; padding: 20px; text-align: center;">
            <h1 style="color: #333; margin: 0;">Landlord No Agent</h1>
          </div>
          <div style="padding: 30px 20px;">
            <h2 style="color: #333; margin-bottom: 20px;">Hello ${firstName}!</h2>
            <p style="color: #666; font-size: 16px; line-height: 1.6;">
              Your One-Time Password (OTP) for account verification is:
            </p>
            <div style="background-color: #f8f9fa; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px;">
              <h1 style="color: #007bff; font-size: 32px; letter-spacing: 5px; margin: 0;">${otp}</h1>
            </div>
            <p style="color: #666; font-size: 14px; line-height: 1.6;">
              This OTP is valid for 10 minutes. Please do not share this code with anyone.
            </p>
            <p style="color: #666; font-size: 14px; line-height: 1.6;">
              If you didn't request this OTP, please ignore this email.
            </p>
          </div>
          <div style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px;">
            <p>© 2024 Landlord No Agent. All rights reserved.</p>
          </div>
        </div>
      `
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('✅ OTP email sent successfully:', result.messageId);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('❌ Error sending OTP email:', error.message);
    // Log the OTP for development purposes
    console.log('🔑 OTP for development:', otp);
    // Don't throw error - return failure
    return { success: false, error: error.message };
  }
};

// Send welcome email
const sendWelcomeEmail = async (email, firstName, role) => {
  try {
    const transporter = createTransporter();
    
    const roleText = role === 'landlord' ? 'Landlord' : 'Client';
    
    const mailOptions = {
      from: `"Landlord No Agent" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Welcome to Landlord No Agent!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #f8f9fa; padding: 20px; text-align: center;">
            <h1 style="color: #333; margin: 0;">Welcome to Landlord No Agent!</h1>
          </div>
          <div style="padding: 30px 20px;">
            <h2 style="color: #333; margin-bottom: 20px;">Hello ${firstName}!</h2>
            <p style="color: #666; font-size: 16px; line-height: 1.6;">
              Welcome to Landlord No Agent! Your account has been successfully created as a ${roleText}.
            </p>
            <p style="color: #666; font-size: 16px; line-height: 1.6;">
              You can now start using our platform to ${role === 'landlord' ? 'list your properties and manage applications' : 'search for properties and submit applications'}.
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}/dashboard/${role}" 
                 style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                Go to Dashboard
              </a>
            </div>
            <p style="color: #666; font-size: 14px; line-height: 1.6;">
              If you have any questions, please don't hesitate to contact our support team.
            </p>
          </div>
          <div style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px;">
            <p>© 2024 Landlord No Agent. All rights reserved.</p>
          </div>
        </div>
      `
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('Welcome email sent successfully:', result.messageId);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('Error sending welcome email:', error);
    throw new Error('Failed to send welcome email');
  }
};

// Send application notification email
const sendApplicationNotificationEmail = async (email, firstName, propertyTitle, landlordName) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: `"Landlord No Agent" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `New Application for ${propertyTitle}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #f8f9fa; padding: 20px; text-align: center;">
            <h1 style="color: #333; margin: 0;">New Application Received</h1>
          </div>
          <div style="padding: 30px 20px;">
            <h2 style="color: #333; margin-bottom: 20px;">Hello ${firstName}!</h2>
            <p style="color: #666; font-size: 16px; line-height: 1.6;">
              You have received a new application for your property: <strong>${propertyTitle}</strong>
            </p>
            <p style="color: #666; font-size: 16px; line-height: 1.6;">
              The applicant is interested in viewing your property. Please review the application and respond accordingly.
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}/dashboard/landlord" 
                 style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                Review Application
              </a>
            </div>
          </div>
          <div style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px;">
            <p>© 2024 Landlord No Agent. All rights reserved.</p>
          </div>
        </div>
      `
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('Application notification email sent successfully:', result.messageId);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('Error sending application notification email:', error);
    throw new Error('Failed to send application notification email');
  }
};

// Send password reset email
const sendPasswordResetEmail = async (email, firstName, resetToken) => {
  try {
    const transporter = createTransporter();
    
    const resetUrl = `${process.env.FRONTEND_URL}/auth/reset-password?token=${resetToken}`;
    
    const mailOptions = {
      from: `"Landlord No Agent" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Password Reset Request',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #f8f9fa; padding: 20px; text-align: center;">
            <h1 style="color: #333; margin: 0;">Password Reset</h1>
          </div>
          <div style="padding: 30px 20px;">
            <h2 style="color: #333; margin-bottom: 20px;">Hello ${firstName}!</h2>
            <p style="color: #666; font-size: 16px; line-height: 1.6;">
              You requested a password reset for your Landlord No Agent account.
            </p>
            <p style="color: #666; font-size: 16px; line-height: 1.6;">
              Click the button below to reset your password:
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" 
                 style="background-color: #dc3545; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                Reset Password
              </a>
            </div>
            <p style="color: #666; font-size: 14px; line-height: 1.6;">
              This link will expire in 1 hour. If you didn't request this reset, please ignore this email.
            </p>
          </div>
          <div style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px;">
            <p>© 2024 Landlord No Agent. All rights reserved.</p>
          </div>
        </div>
      `
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('Password reset email sent successfully:', result.messageId);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw new Error('Failed to send password reset email');
  }
};

module.exports = {
  generateOTP,
  sendOTPEmail,
  sendWelcomeEmail,
  sendApplicationNotificationEmail,
  sendPasswordResetEmail
};
