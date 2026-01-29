const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { Resend } = require("resend");
const User = require("../models/User");
const { generateToken, verifyToken } = require("../middleware/auth");
const { createAuditLog, getRequestMetadata } = require("../utils/auditLogger");

// Initialize Resend
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const router = express.Router();

// Email transporter setup
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'sandbox.smtp.mailtrap.io',
    port: process.env.EMAIL_PORT || 2525,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
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

// Send OTP email
const sendOTPEmail = async (email, otp) => {
  try {
    // Try Resend API first (works on Render without SMTP ports)
    if (resend) {
      try {
        console.log('📧 Attempting to send via Resend API...');
        const { data, error } = await resend.emails.send({
          from: process.env.EMAIL_FROM || 'Landlord No Agent <onboarding@resend.dev>',
          to: email,
          subject: "Your OTP for Landlord No Agent",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #333;">Your OTP Code</h2>
              <p>Your one-time password is:</p>
              <div style="background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
                ${otp}
              </div>
              <p>This code will expire in 10 minutes.</p>
              <p>If you didn't request this code, please ignore this email.</p>
            </div>
          `,
        });

        if (error) {
          throw new Error(error.message);
        }

        console.log('✅ OTP email sent successfully via Resend:', data?.id);
        return { success: true, messageId: data?.id };
      } catch (resendError) {
        console.error('❌ Resend API failed:', resendError.message);
        // Fall through to SMTP
      }
    }

    // Fallback to SMTP if Resend failed or not configured
    if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      console.warn('Email configuration missing. OTP:', otp);
      return { success: false, error: 'Email configuration missing' };
    }

    const transporter = createTransporter();

    // Skip verification in production to avoid timeout issues on Render
    if (process.env.NODE_ENV !== 'production') {
      try {
        await transporter.verify();
      } catch (verifyError) {
        console.error('❌ Email transporter verification failed:', verifyError.message);
        console.log('🔑 OTP for development:', otp);
        return { success: false, error: verifyError.message };
      }
    }

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Your OTP for Landlord No Agent",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Your OTP Code</h2>
          <p>Your one-time password is:</p>
          <div style="background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
            ${otp}
          </div>
          <p>This code will expire in 10 minutes.</p>
          <p>If you didn't request this code, please ignore this email.</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log('✅ OTP email sent successfully');
    return { success: true };
  } catch (error) {
    console.error('❌ Error sending OTP email:', error.message);
    // Log the OTP for development purposes
    console.log('🔑 OTP for development:', otp);
    return { success: false, error: error.message };
  }
};

// Generate OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post("/register", async (req, res) => {
  try {
    const { email, password, role, firstName, lastName, phone } = req.body;

    // Validation
    if (!email || !password || !role || !firstName || !lastName) {
      return res.status(400).json({
        message: "Please provide all required fields",
      });
    }

    if (!["landlord", "client"].includes(role)) {
      return res.status(400).json({
        message: "Invalid role. Must be landlord or client",
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        message: "User already exists with this email",
      });
    }

    // Generate OTP
    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Create user
    const user = new User({
      email: email.toLowerCase(),
      password,
      role,
      firstName,
      lastName,
      phone,
      emailVerificationToken: otp,
      emailVerificationExpires: otpExpires,
    });

    await user.save();

    // Send OTP email
    const emailResult = await sendOTPEmail(email, otp);
    if (!emailResult.success) {
      console.log('Email failed, but continuing with registration. OTP:', otp);
      // Don't fail registration if email fails - just log the OTP
    }

    // Send welcome email (check preferences first)
    try {
      const { sendEmail, getEmailTemplate, checkNotificationPreference } = require('../utils/emailNotifications');
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      
      // Check if user wants welcome emails (defaults to true for new users)
      const canSendWelcome = await checkNotificationPreference(user._id, 'welcome');
      
      if (canSendWelcome) {
        const welcomeTemplate = getEmailTemplate('welcome', {
          name: `${firstName} ${lastName}`.trim() || firstName || email.split('@')[0],
          role: role,
          dashboardUrl: `${frontendUrl}/dashboard/${role}`
        });
        
        if (welcomeTemplate) {
          await sendEmail(email, welcomeTemplate.subject, welcomeTemplate.html, welcomeTemplate.text);
          console.log(`✅ Welcome email sent to ${email}`);
        }
      } else {
        console.log(`Welcome email skipped for ${email} - user has disabled welcome notifications`);
      }
    } catch (welcomeEmailError) {
      console.error('Error sending welcome email:', welcomeEmailError);
      // Don't fail registration if welcome email fails
    }

    // Audit log: User registration
    const { ipAddress, userAgent } = getRequestMetadata(req);
    await createAuditLog({
      action: 'user_registered',
      entityType: 'User',
      entityId: user._id,
      userId: user._id,
      details: { email: user.email, role: user.role },
      ipAddress,
      userAgent
    });

    res.status(201).json({
      message:
        "User registered successfully. Please verify your email with the OTP sent.",
      userId: user._id,
      email: user.email,
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({
      message: "Server error during registration",
    });
  }
});

// @route   POST /api/auth/verify-email
// @desc    Verify email with OTP
// @access  Public
router.post("/verify-email", async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        message: "Email and OTP are required",
      });
    }

    const user = await User.findOne({
      email: email.toLowerCase(),
      emailVerificationToken: otp,
      emailVerificationExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        message: "Invalid or expired OTP",
      });
    }

    // Update user
    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    res.json({
      message: "Email verified successfully",
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        isEmailVerified: user.isEmailVerified,
      },
    });
  } catch (error) {
    console.error("Email verification error:", error);
    res.status(500).json({
      message: "Server error during email verification",
    });
  }
});

// @route   POST /api/auth/resend-otp
// @desc    Resend OTP for email verification
// @access  Public
router.post("/resend-otp", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        message: "Email is required",
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({
        message: "Email is already verified",
      });
    }

    // Generate new OTP
    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    user.emailVerificationToken = otp;
    user.emailVerificationExpires = otpExpires;
    await user.save();

    // Send OTP email
    const emailResult = await sendOTPEmail(email, otp);
    if (!emailResult.success) {
      console.log('Email failed, but continuing with OTP request. OTP:', otp);
      // Don't fail if email fails - just log the OTP
    }

    res.json({
      message: "OTP sent successfully",
    });
  } catch (error) {
    console.error("Resend OTP error:", error);
    res.status(500).json({
      message: "Server error while resending OTP",
    });
  }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({
        message: "Invalid credentials",
      });
    }

    // Check if account is locked
    if (user.isLocked) {
      return res.status(423).json({
        message:
          "Account is temporarily locked due to too many failed login attempts",
      });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      await user.incLoginAttempts();
      return res.status(401).json({
        message: "Invalid credentials",
      });
    }

    // Check if email is verified
    if (!user.isEmailVerified) {
      return res.status(401).json({
        message: "Please verify your email before logging in",
      });
    }

    // Reset login attempts and update last login
    await user.resetLoginAttempts();
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    // Audit log: User login
    const { ipAddress, userAgent } = getRequestMetadata(req);
    await createAuditLog({
      action: 'user_login',
      entityType: 'User',
      entityId: user._id,
      userId: user._id,
      details: { email: user.email, role: user.role },
      ipAddress,
      userAgent
    });

    // Map verification status (same logic as /auth/me endpoint)
    const isVerified = user.isVerified || user.kyc?.status === 'verified';
    const is_verified = isVerified || user.kyc?.status === 'verified';

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        isEmailVerified: user.isEmailVerified,
        isVerified: isVerified,
        is_verified: is_verified,
        kyc: user.kyc ? {
          status: user.kyc.status
        } : undefined,
        lastLogin: user.lastLogin,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      message: "Server error during login",
    });
  }
});

// // @route   POST /api/auth/logout
// // @desc    Logout user (JWT-based)
// // @access  Private
router.post("/logout", verifyToken, async (req, res) => {
  try {
    // Update last logout time
    if (req.user) {
      await User.findByIdAndUpdate(req.user._id, {
        $set: { lastLogout: new Date() },
      });

      // Audit log: User logout
      const { ipAddress, userAgent } = getRequestMetadata(req);
      await createAuditLog({
        action: 'user_logout',
        entityType: 'User',
        entityId: req.user._id,
        userId: req.user._id,
        details: { email: req.user.email, role: req.user.role },
        ipAddress,
        userAgent
      });
    }

    // Client should remove token
    return res.json({
      message: "Logout successful. Please remove token on client.",
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({
      message: "Server error during logout",
    });
  }
});

// @route   POST /api/auth/forgot-password
// @desc    Send password reset email
// @access  Public
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        message: "Email is required",
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    user.passwordResetToken = resetToken;
    user.passwordResetExpires = resetExpires;
    await user.save();

    // Audit log: Password reset requested
    const { ipAddress, userAgent } = getRequestMetadata(req);
    await createAuditLog({
      action: 'password_reset_requested',
      entityType: 'User',
      entityId: user._id,
      userId: user._id,
      details: { email: user.email },
      ipAddress,
      userAgent
    });

    // Send reset email – use Resend first (same as OTP), then fall back to SMTP
    const resetUrl = `${(process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '')}/auth/reset-password?token=${resetToken}`;
    const fromAddress = process.env.EMAIL_FROM || 'Landlord No Agent <onboarding@resend.dev>';
    const logoUrl = `${(process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '')}/logo.png`;

    const resetEmailHtml = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Password Reset</title></head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <div style="background: linear-gradient(135deg, #249479 0%, #1d4ed8 100%); padding: 40px 20px; text-align: center;">
            <img src="${logoUrl}" alt="LandLordNoAgent" style="max-width: 200px; height: auto; margin-bottom: 15px;" />
            <h1 style="color: #fff; margin: 0; font-size: 28px; font-weight: bold;">Password Reset</h1>
            <p style="color: #e0e7ff; margin: 8px 0 0 0; font-size: 16px;">LandLordNoAgent</p>
          </div>
          <div style="padding: 40px 30px;">
            <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 24px;">Reset Your Password</h2>
            <p style="color: #6b7280; line-height: 1.6;">You requested a password reset for your account. Click the button below to set a new password.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="display: inline-block; background-color: #249479; color: #fff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: bold; font-size: 16px;">Reset Password</a>
            </div>
            <p style="color: #6b7280; font-size: 14px;">This link expires in 1 hour. If you didn't request this, please ignore this email.</p>
          </div>
          <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; font-size: 14px; margin: 0;">© ${new Date().getFullYear()} LandLordNoAgent. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    let emailSent = false;

    if (resend) {
      try {
        const { data, error } = await resend.emails.send({
          from: fromAddress,
          to: email,
          subject: 'Password Reset - LandLordNoAgent',
          html: resetEmailHtml,
          text: `Reset your password: ${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, please ignore this email.`,
        });
        if (error) throw new Error(error.message);
        emailSent = true;
        console.log('✅ Password reset email sent via Resend:', data?.id);
      } catch (resendErr) {
        console.error('❌ Resend password reset failed:', resendErr.message);
      }
    }

    if (!emailSent && process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
      try {
        const transporter = createTransporter();
        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: email,
          subject: 'Password Reset - LandLordNoAgent',
          html: resetEmailHtml,
        });
        emailSent = true;
        console.log('✅ Password reset email sent via SMTP');
      } catch (smtpErr) {
        console.error('❌ SMTP password reset failed:', smtpErr.message);
      }
    }

    if (!emailSent) {
      console.error('Password reset email not sent: no Resend API key or SMTP config');
      return res.status(503).json({
        message: 'Unable to send password reset email. Please try again later or contact support.',
      });
    }

    res.json({
      message: 'Password reset email sent',
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      message: 'Server error while sending reset email',
    });
  }
});

// @route   POST /api/auth/reset-password
// @desc    Reset password with token
// @access  Public
router.post("/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        message: "Token and password are required",
      });
    }

    const user = await User.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        message: "Invalid or expired reset token",
      });
    }

    // Update password
    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    // Audit log: Password reset
    const { ipAddress, userAgent } = getRequestMetadata(req);
    await createAuditLog({
      action: 'password_reset',
      entityType: 'User',
      entityId: user._id,
      userId: user._id,
      details: { email: user.email },
      ipAddress,
      userAgent
    });

    res.json({
      message: "Password reset successfully",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({
      message: "Server error during password reset",
    });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get("/me", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");
    // Transform user data to match frontend expectations
    const userData = user.toObject();
    // Map _id to id for frontend compatibility
    userData.id = userData._id;
    // Map isVerified from kyc.status for backward compatibility
    if (!userData.isVerified && user.kyc?.status === 'verified') {
      userData.isVerified = true;
    }
    // Map kyc.status to is_verified for frontend
    userData.is_verified = userData.isVerified || user.kyc?.status === 'verified';
    res.json({ user: userData });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({
      message: "Server error while fetching user",
    });
  }
});

// @route   POST /api/auth/check-email
// @desc    Check if email already exists in the system
// @access  Public
router.post("/check-email", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        message: "Email is required",
        exists: false
      });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    
    res.json({
      exists: !!existingUser
    });
  } catch (error) {
    console.error("Check email error:", error);
    res.status(500).json({
      message: "Server error while checking email",
      exists: false
    });
  }
});

// @route   POST /api/auth/security-log
// @desc    Log security events for audit purposes
// @access  Private
router.post("/security-log", verifyToken, async (req, res) => {
  try {
    const { event, userId, details, timestamp } = req.body;

    // Log to console for now - in production, this could go to a separate logging service
    console.log('[SECURITY LOG]', {
      event,
      userId: userId || req.user._id,
      details,
      timestamp: timestamp || new Date().toISOString(),
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    // Optional: Save to database for audit trail
    // await SecurityLog.create({ event, userId, details, timestamp, ip: req.ip });

    res.json({ success: true });
  } catch (error) {
    console.error("Security log error:", error);
    // Don't fail - security logging should not block user actions
    res.json({ success: false });
  }
});

module.exports = router;
