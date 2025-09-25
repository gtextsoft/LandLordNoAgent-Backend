import { Request, Response } from 'express';
import { logger } from '../config/logger';
import * as authService from '../services/auth';
import { RegisterRequest, LoginRequest } from '../types';

/**
 * Register a new user
 */
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const userData: RegisterRequest = req.body;

    const result = await authService.registerUser(userData);

    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Register controller error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

/**
 * Login user
 */
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const credentials: LoginRequest = req.body;

    const result = await authService.loginUser(credentials);

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(401).json(result);
    }
  } catch (error) {
    logger.error('Login controller error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

/**
 * Get current user profile
 */
export const getProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    const result = await authService.getUserById(userId);

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    logger.error('Get profile controller error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

/**
 * Update user profile
 */
export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    const profileData = req.body;

    const result = await authService.updateUserProfile(userId, profileData);

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Update profile controller error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

/**
 * Change user password
 */
export const changePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const { currentPassword, newPassword } = req.body;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    if (!currentPassword || !newPassword) {
      res.status(400).json({
        success: false,
        error: 'Current password and new password are required',
      });
      return;
    }

    const result = await authService.changePassword(userId, currentPassword, newPassword);

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Change password controller error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

/**
 * Verify user email
 */
export const verifyEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    const result = await authService.verifyUserEmail(userId);

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Verify email controller error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

/**
 * Forgot password - send reset email (placeholder for now)
 */
export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({
        success: false,
        error: 'Email is required',
      });
      return;
    }

    // Check if user exists
    const userExists = await authService.userExists(email);
    
    if (!userExists) {
      // Don't reveal if user exists or not for security
      res.status(200).json({
        success: true,
        message: 'If the email exists, a reset link has been sent',
      });
      return;
    }

    // TODO: Implement email service to send reset link
    // For now, just return success
    res.status(200).json({
      success: true,
      message: 'Password reset link sent to your email',
    });
  } catch (error) {
    logger.error('Forgot password controller error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

/**
 * Reset password (placeholder for now)
 */
export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      res.status(400).json({
        success: false,
        error: 'Token and new password are required',
      });
      return;
    }

    // TODO: Implement token verification and password reset
    // For now, just return success
    res.status(200).json({
      success: true,
      message: 'Password reset successfully',
    });
  } catch (error) {
    logger.error('Reset password controller error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

/**
 * Logout user (client-side token removal)
 */
export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    // Since we're using JWT tokens, logout is handled client-side
    // by removing the token from storage
    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    logger.error('Logout controller error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

/**
 * Refresh token (placeholder for future implementation)
 */
export const refreshToken = async (req: Request, res: Response): Promise<void> => {
  try {
    // TODO: Implement refresh token logic
    res.status(501).json({
      success: false,
      error: 'Refresh token not implemented yet',
    });
  } catch (error) {
    logger.error('Refresh token controller error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

/**
 * Verify email with verification code
 */
export const verifyEmailWithCode = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, verificationCode } = req.body;

    if (!email || !verificationCode) {
      res.status(400).json({
        success: false,
        error: 'Email and verification code are required',
      });
      return;
    }

    const result = await authService.verifyEmailWithCode(email, verificationCode);

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Verify email with code controller error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

/**
 * Resend verification code
 */
export const resendVerificationCode = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({
        success: false,
        error: 'Email is required',
      });
      return;
    }

    const result = await authService.resendVerificationCode(email);

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Resend verification code controller error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

/**
 * Send general email
 */
export const sendEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { type, to, data, options } = req.body;

    // Import email service
    const { sendEmail: emailService } = await import('../services/emailService');

    const result = await emailService(type, to, data, options);

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Send email controller error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};