import { Router } from 'express';
import * as authController from '../controllers/authController';
import { authenticateToken } from '../middleware/auth';
import { validationSchemas } from '../middleware/validation';

const router = Router();

router.post('/register', validationSchemas.register, authController.register);

/**
 * @route POST /auth/signup
 * @desc Register a new user (alias for register)
 * @access Public
 */
router.post('/signup', validationSchemas.register, authController.register);

router.post('/login', validationSchemas.login, authController.login);

/**
 * @route POST /auth/signin
 * @desc Login user (alias for login)
 * @access Public
 */
router.post('/signin', validationSchemas.login, authController.login);

/**
 * @route POST /auth/forgot-password
 * @desc Send password reset email
 * @access Public
 */
router.post('/forgot-password', validationSchemas.forgotPassword, authController.forgotPassword);

/**
 * @route POST /auth/reset-password
 * @desc Reset user password
 * @access Public
 */
router.post('/reset-password', validationSchemas.resetPassword, authController.resetPassword);

router.get('/me', authenticateToken, authController.getProfile);

/**
 * @route PUT /auth/profile
 * @desc Update user profile
 * @access Private
 */
router.put('/profile', authenticateToken, validationSchemas.updateProfile, authController.updateProfile);

/**
 * @route PUT /auth/change-password
 * @desc Change user password
 * @access Private
 */
router.put('/change-password', authenticateToken, authController.changePassword);

/**
 * @route POST /auth/verify-email
 * @desc Verify user email
 * @access Private
 */
router.post('/verify-email', authenticateToken, authController.verifyEmail);

/**
 * @route POST /auth/verify-email-code
 * @desc Verify email with verification code
 * @access Public
 */
router.post('/verify-email-code', validationSchemas.verifyEmailWithCode, authController.verifyEmailWithCode);

/**
 * @route POST /auth/resend-verification
 * @desc Resend verification code
 * @access Public
 */
router.post('/resend-verification', validationSchemas.resendVerification, authController.resendVerificationCode);

/**
 * @route POST /auth/send-email
 * @desc Send general email
 * @access Public
 */
router.post('/send-email', authController.sendEmail);

/**
 * @route POST /auth/logout
 * @desc Logout user
 * @access Private
 */
router.post('/logout', authenticateToken, authController.logout);

/**
 * @route POST /auth/refresh
 * @desc Refresh JWT token
 * @access Private
 */
router.post('/refresh', authenticateToken, authController.refreshToken);

export default router;
