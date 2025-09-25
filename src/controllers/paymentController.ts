import { Request, Response, NextFunction } from 'express';
import {
  createCheckoutSession,
  confirmPayment,
  handleStripeWebhook,
  getUserPayments,
  getPaymentById,
  processRefund,
  getPaymentStatistics,
  CreatePaymentRequest,
  PaymentSearchRequest,
} from '../services/paymentService';
import Payment from '../models/Payment';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../config/logger';
import Stripe from 'stripe';
import { config } from '../config';

// Initialize Stripe for webhook verification
const stripe = new Stripe(config.stripe.secretKey, {
  apiVersion: '2023-10-16',
});

/**
 * Create checkout session
 */
export const createCheckoutSessionController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const clientId = req.user?.userId;
    const { applicationId, amount, currency } = req.body;

    if (!clientId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    if (req.user?.role !== 'CLIENT') {
      return res.status(403).json({
        success: false,
        error: 'Only clients can create payment sessions',
      });
    }

    const result = await createCheckoutSession(applicationId, clientId, amount, currency);

    return res.status(201).json(result);
  }
);

/**
 * Confirm payment
 */
export const confirmPaymentController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { sessionId } = req.params;

    const result = await confirmPayment(sessionId);

    return res.status(200).json(result);
  }
);

/**
 * Handle Stripe webhook
 */
export const stripeWebhookController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const sig = req.headers['stripe-signature'] as string;
    const endpointSecret = config.stripe.webhookSecret;

    let event: Stripe.Event;

    try {
      // Verify webhook signature
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err: any) {
      logger.error('Webhook signature verification failed:', err.message);
      return res.status(400).json({
        success: false,
        error: 'Invalid webhook signature',
      });
    }

    try {
      await handleStripeWebhook(event);
      return res.status(200).json({ received: true });
    } catch (error) {
      logger.error('Webhook processing error:', error);
      return res.status(500).json({
        success: false,
        error: 'Webhook processing failed',
      });
    }
  }
);

/**
 * Get user payments
 */
export const getUserPaymentsController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const searchParams: PaymentSearchRequest = {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 10,
      status: req.query.status as string,
      applicationId: req.query.applicationId as string,
      clientId: req.query.clientId as string,
      landlordId: req.query.landlordId as string,
      sortBy: req.query.sortBy as 'createdAt' | 'amount' || 'createdAt',
      sortOrder: req.query.sortOrder as 'asc' | 'desc' || 'desc',
    };

    const result = await getUserPayments(userId, userRole!, searchParams);

    return res.status(200).json(result);
  }
);

/**
 * Get payment by ID
 */
export const getPaymentController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const result = await getPaymentById(id, userId, userRole!);

    return res.status(200).json(result);
  }
);

/**
 * Process refund
 */
export const processRefundController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const adminId = req.user?.userId;
    const { refundAmount, reason } = req.body;

    if (!adminId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required for refunds',
      });
    }

    const result = await processRefund(id, refundAmount, reason, adminId);

    return res.status(200).json(result);
  }
);

/**
 * Get payment statistics
 */
export const getPaymentStatisticsController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const result = await getPaymentStatistics(userId, userRole);

    return res.status(200).json(result);
  }
);

/**
 * Get all payments (Admin only)
 */
export const getAllPaymentsController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required',
      });
    }

    const searchParams: PaymentSearchRequest = {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 10,
      status: req.query.status as string,
      applicationId: req.query.applicationId as string,
      clientId: req.query.clientId as string,
      landlordId: req.query.landlordId as string,
      sortBy: req.query.sortBy as 'createdAt' | 'amount' || 'createdAt',
      sortOrder: req.query.sortOrder as 'asc' | 'desc' || 'desc',
    };

    const result = await getUserPayments('', 'ADMIN', searchParams);

    return res.status(200).json(result);
  }
);

/**
 * Get payment receipt
 */
export const getPaymentReceiptController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id: paymentId, client_id: clientId } = req.query;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    if (!paymentId) {
      return res.status(400).json({
        success: false,
        error: 'Payment ID is required',
      });
    }

    // Verify user has access to this payment
    const payment = await Payment.findOne({
      _id: paymentId,
      $or: [
        { clientId: userId },
        { landlordId: userId },
      ],
    }).populate([
      { path: 'applicationId', select: 'status moveInDate applicationData' },
      { path: 'clientId', select: 'email profileData' },
      { path: 'landlordId', select: 'email profileData' },
      { path: 'propertyId', select: 'title location price currency images' },
    ]);

    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found',
      });
    }

    // Generate receipt data
    const receipt = {
      id: payment._id,
      amount: payment.amount / 100, // Convert from cents
      currency: payment.currency,
      status: payment.status,
      transactionId: payment.stripePaymentIntentId,
      property: payment.propertyId,
      client: payment.clientId,
      landlord: payment.landlordId,
      application: payment.applicationId,
      createdAt: payment.createdAt,
      receiptUrl: payment.receiptUrl,
    };

    return res.status(200).json({
      success: true,
      receipt,
      message: 'Receipt retrieved successfully',
    });
  }
);
