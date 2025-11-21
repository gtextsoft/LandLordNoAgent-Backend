const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { Resend } = require("resend");
const User = require("../models/User");
const { generateToken, verifyToken } = require("../middleware/auth");

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
router.post("/logout", async (req, res) => {
  try {
    // OPTIONAL: Audit log
    if (req.user) {
      await User.findByIdAndUpdate(req.user.id, {
        $set: { lastLogout: new Date() },
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

    // Send reset email
    const transporter = createTransporter();
    const resetUrl = `${process.env.FRONTEND_URL}/auth/reset-password?token=${resetToken}`;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Password Reset - Landlord No Agent",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Password Reset Request</h2>
          <p>You requested a password reset for your account.</p>
          <p>Click the link below to reset your password:</p>
          <a href="${resetUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
          <p>This link will expire in 1 hour.</p>
          <p>If you didn't request this reset, please ignore this email.</p>
        </div>
      `,
    });

    res.json({
      message: "Password reset email sent",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({
      message: "Server error while sending reset email",
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

module.exports = router;
