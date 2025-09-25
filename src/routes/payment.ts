import express from 'express';
import {
  createCheckoutSessionController,
  confirmPaymentController,
  stripeWebhookController,
  getUserPaymentsController,
  getPaymentController,
  processRefundController,
  getPaymentStatisticsController,
  getAllPaymentsController,
  getPaymentReceiptController,
} from '../controllers/paymentController';
import { authenticateToken, requireRole } from '../middleware/auth';
import { validationSchemas } from '../middleware/validation';

const router = express.Router();

// Stripe webhook (no authentication required - uses webhook signature)
router.post('/webhook', stripeWebhookController);

// Client routes
router.post('/checkout', authenticateToken, requireRole(['CLIENT']), validationSchemas.createPayment, createCheckoutSessionController);
router.get('/my-payments', authenticateToken, requireRole(['CLIENT']), getUserPaymentsController);
router.get('/statistics', authenticateToken, requireRole(['CLIENT']), getPaymentStatisticsController);

// Landlord routes
router.get('/landlord/payments', authenticateToken, requireRole(['LANDLORD']), getUserPaymentsController);
router.get('/landlord/statistics', authenticateToken, requireRole(['LANDLORD']), getPaymentStatisticsController);

// Admin routes
router.get('/admin/all', authenticateToken, requireRole(['ADMIN']), getAllPaymentsController);
router.put('/admin/:id/refund', authenticateToken, requireRole(['ADMIN']), validationSchemas.paymentParams, validationSchemas.refundPayment, processRefundController);
router.get('/admin/statistics', authenticateToken, requireRole(['ADMIN']), getPaymentStatisticsController);

// Shared routes
router.get('/:id', authenticateToken, validationSchemas.paymentParams, getPaymentController);
router.get('/confirm/:sessionId', confirmPaymentController);
router.get('/receipt', authenticateToken, getPaymentReceiptController);

export default router;
