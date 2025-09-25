import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { connectDatabase } from '../config/database';
import { config } from '../config';
import { logger } from '../config/logger';
import User, { IUser } from '../models/User';
import { UserRole, JwtPayload, RegisterRequest, LoginRequest } from '../types';
import { ApiResponse } from '../types';
import { sendVerificationEmail, sendWelcomeEmail, generateVerificationCode } from './emailService';

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, config.auth.bcryptRounds);
}

/**
 * Compare a password with its hash
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate JWT token
 */
export function generateToken(payload: { userId: string; email: string; role: UserRole }): string {
  return jwt.sign(payload, config.auth.jwtSecret, {
    expiresIn: config.auth.jwtExpiresIn,
  } as jwt.SignOptions);
}

/**
 * Verify JWT token
 */
export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, config.auth.jwtSecret) as JwtPayload;
}

/**
 * Register a new user
 */
export async function registerUser(userData: RegisterRequest): Promise<ApiResponse<{ user: IUser; token: string; verificationSent: boolean }>> {
  try {
    // Validate role - only allow CLIENT and LANDLORD registration
    if (userData.role === 'ADMIN') {
      return {
        success: false,
        error: 'Admin role cannot be registered through this endpoint',
      };
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: userData.email.toLowerCase() });

    if (existingUser) {
      return {
        success: false,
        error: 'User with this email already exists',
      };
    }

    // Hash password
    const passwordHash = await hashPassword(userData.password);

    // Generate verification code
    const verificationCode = generateVerificationCode();
    const verificationExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Create user
    const user = new User({
      email: userData.email.toLowerCase(),
      passwordHash,
      role: userData.role,
      profileData: userData.profileData || {},
      emailVerificationCode: verificationCode,
      emailVerificationExpires: verificationExpires,
      isVerified: false,
    });

    await user.save();

    // Generate token
    const token = generateToken({
      userId: user._id.toString(),
      email: user.email,
      role: user.role as UserRole,
    });

    // Send verification email
    const emailSent = await sendVerificationEmail({
      email: user.email,
      verificationCode,
      firstName: user.profileData?.firstName,
    });

    // Remove password hash from response
    const userResponse = user.toObject();
    delete (userResponse as any).passwordHash;
    delete (userResponse as any).emailVerificationCode;

    logger.info(`New user registered: ${user.email} with role ${user.role}, verification email sent: ${emailSent}`);

    return {
      success: true,
      data: {
        user: userResponse,
        token,
        verificationSent: emailSent,
      },
      message: emailSent 
        ? 'User registered successfully. Please check your email for verification code.'
        : 'User registered successfully. Email verification could not be sent.',
    };
  } catch (error) {
    logger.error('Registration error:', error);
    return {
      success: false,
      error: 'Registration failed',
    };
  }
}

/**
 * Login user
 */
export async function loginUser(credentials: LoginRequest): Promise<ApiResponse<{ user: IUser; token: string }>> {
  try {
    // Find user by email
    const user = await User.findOne({ email: credentials.email.toLowerCase() });

    if (!user) {
      return {
        success: false,
        error: 'Invalid email or password',
      };
    }

    // Verify password
    const isPasswordValid = await comparePassword(credentials.password, user.passwordHash);
    if (!isPasswordValid) {
      return {
        success: false,
        error: 'Invalid email or password',
      };
    }

    // Generate token
    const token = generateToken({
      userId: user._id.toString(),
      email: user.email,
      role: user.role as UserRole,
    });

    // Remove password hash from response
    const userResponse = user.toObject();
    delete (userResponse as any).passwordHash;

    logger.info(`User logged in: ${user.email}`);

    return {
      success: true,
      data: {
        user: userResponse,
        token,
      },
      message: 'Login successful',
    };
  } catch (error) {
    logger.error('Login error:', error);
    return {
      success: false,
      error: 'Login failed',
    };
  }
}

/**
 * Get user by ID
 */
export async function getUserById(userId: string): Promise<ApiResponse<IUser>> {
  try {
    const user = await User.findById(userId);

    if (!user) {
      return {
        success: false,
        error: 'User not found',
      };
    }

    // Remove password hash from response
    const userResponse = user.toObject();
    delete (userResponse as any).passwordHash;

    return {
      success: true,
      data: userResponse,
    };
  } catch (error) {
    logger.error('Get user error:', error);
    return {
      success: false,
      error: 'Failed to get user',
    };
  }
}

/**
 * Update user profile
 */
export async function updateUserProfile(
  userId: string,
  profileData: any
): Promise<ApiResponse<IUser>> {
  try {
    const user = await User.findByIdAndUpdate(
      userId,
      { 
        $set: { 
          profileData: {
            ...profileData,
          },
        },
      },
      { new: true }
    );

    if (!user) {
      return {
        success: false,
        error: 'User not found',
      };
    }

    // Remove password hash from response
    const userResponse = user.toObject();
    delete (userResponse as any).passwordHash;

    logger.info(`User profile updated: ${user.email}`);

    return {
      success: true,
      data: userResponse,
      message: 'Profile updated successfully',
    };
  } catch (error) {
    logger.error('Update profile error:', error);
    return {
      success: false,
      error: 'Failed to update profile',
    };
  }
}

/**
 * Change user password
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<ApiResponse> {
  try {
    // Get user with password hash
    const user = await User.findById(userId);

    if (!user) {
      return {
        success: false,
        error: 'User not found',
      };
    }

    // Verify current password
    const isCurrentPasswordValid = await comparePassword(currentPassword, user.passwordHash);
    if (!isCurrentPasswordValid) {
      return {
        success: false,
        error: 'Current password is incorrect',
      };
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // Update password
    await User.findByIdAndUpdate(userId, { passwordHash: newPasswordHash });

    logger.info(`Password changed for user: ${user.email}`);

    return {
      success: true,
      message: 'Password changed successfully',
    };
  } catch (error) {
    logger.error('Change password error:', error);
    return {
      success: false,
      error: 'Failed to change password',
    };
  }
}

/**
 * Verify user email
 */
export async function verifyUserEmail(userId: string): Promise<ApiResponse> {
  try {
    await User.findByIdAndUpdate(userId, { isVerified: true });

    logger.info(`Email verified for user: ${userId}`);

    return {
      success: true,
      message: 'Email verified successfully',
    };
  } catch (error) {
    logger.error('Email verification error:', error);
    return {
      success: false,
      error: 'Failed to verify email',
    };
  }
}

/**
 * Check if user exists by email
 */
export async function userExists(email: string): Promise<boolean> {
  try {
    const user = await User.findOne({ email: email.toLowerCase() }, { _id: 1 });
    return !!user;
  } catch (error) {
    logger.error('Check user exists error:', error);
    return false;
  }
}

/**
 * Get user by email
 */
export async function getUserByEmail(email: string): Promise<ApiResponse<IUser>> {
  try {
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return {
        success: false,
        error: 'User not found',
      };
    }

    // Remove password hash from response
    const userResponse = user.toObject();
    delete (userResponse as any).passwordHash;

    return {
      success: true,
      data: userResponse,
    };
  } catch (error) {
    logger.error('Get user by email error:', error);
    return {
      success: false,
      error: 'Failed to get user',
    };
  }
}

/**
 * Update user KYC data
 */
export async function updateUserKyc(
  userId: string,
  kycData: any
): Promise<ApiResponse<IUser>> {
  try {
    const user = await User.findByIdAndUpdate(
      userId,
      { 
        $set: { 
          kycData: {
            ...kycData,
            submittedAt: new Date(),
            verificationStatus: 'pending',
          },
        },
      },
      { new: true }
    );

    if (!user) {
      return {
        success: false,
        error: 'User not found',
      };
    }

    // Remove password hash from response
    const userResponse = user.toObject();
    delete (userResponse as any).passwordHash;

    logger.info(`KYC data updated for user: ${user.email}`);

    return {
      success: true,
      data: userResponse,
      message: 'KYC data submitted successfully',
    };
  } catch (error) {
    logger.error('Update KYC error:', error);
    return {
      success: false,
      error: 'Failed to update KYC data',
    };
  }
}

/**
 * Update user verification status
 */
export async function updateUserVerification(
  userId: string,
  isVerified: boolean
): Promise<ApiResponse<IUser>> {
  try {
    const user = await User.findByIdAndUpdate(
      userId,
      { isVerified },
      { new: true }
    );

    if (!user) {
      return {
        success: false,
        error: 'User not found',
      };
    }

    // Remove password hash from response
    const userResponse = user.toObject();
    delete (userResponse as any).passwordHash;

    logger.info(`User verification status updated: ${user.email} - ${isVerified}`);

    return {
      success: true,
      data: userResponse,
      message: `User ${isVerified ? 'verified' : 'unverified'} successfully`,
    };
  } catch (error) {
    logger.error('Update verification error:', error);
    return {
      success: false,
      error: 'Failed to update verification status',
    };
  }
}

/**
 * Verify email with verification code
 */
export async function verifyEmailWithCode(email: string, verificationCode: string): Promise<ApiResponse<{ user: IUser }>> {
  try {
    const user = await User.findOne({ 
      email: email.toLowerCase(),
      emailVerificationCode: verificationCode,
      emailVerificationExpires: { $gt: new Date() }
    });

    if (!user) {
      return {
        success: false,
        error: 'Invalid or expired verification code',
      };
    }

    if (user.isVerified) {
      return {
        success: false,
        error: 'Email already verified',
      };
    }

    // Update user verification status
    user.isVerified = true;
    user.emailVerifiedAt = new Date();
    user.emailVerificationCode = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    // Send welcome email
    await sendWelcomeEmail({
      email: user.email,
      firstName: user.profileData?.firstName || 'User',
      role: user.role,
    });

    // Remove password hash from response
    const userResponse = user.toObject();
    delete (userResponse as any).passwordHash;

    logger.info(`Email verified for user: ${user.email}`);

    return {
      success: true,
      data: { user: userResponse },
      message: 'Email verified successfully! Welcome to LandlordNoAgent!',
    };
  } catch (error) {
    logger.error('Email verification error:', error);
    return {
      success: false,
      error: 'Email verification failed',
    };
  }
}

/**
 * Resend verification code
 */
export async function resendVerificationCode(email: string): Promise<ApiResponse<{ verificationSent: boolean }>> {
  try {
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return {
        success: false,
        error: 'User not found',
      };
    }

    if (user.isVerified) {
      return {
        success: false,
        error: 'Email already verified',
      };
    }

    // Generate new verification code
    const verificationCode = generateVerificationCode();
    const verificationExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Update user with new code
    user.emailVerificationCode = verificationCode;
    user.emailVerificationExpires = verificationExpires;
    await user.save();

    // Send verification email
    const emailSent = await sendVerificationEmail({
      email: user.email,
      verificationCode,
      firstName: user.profileData?.firstName,
    });

    logger.info(`Verification code resent to: ${user.email}, sent: ${emailSent}`);

    return {
      success: true,
      data: { verificationSent: emailSent },
      message: emailSent 
        ? 'Verification code resent successfully. Please check your email.'
        : 'Failed to send verification code. Please try again.',
    };
  } catch (error) {
    logger.error('Resend verification code error:', error);
    return {
      success: false,
      error: 'Failed to resend verification code',
    };
  }
}