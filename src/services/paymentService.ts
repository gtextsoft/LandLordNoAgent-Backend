import Stripe from 'stripe';
import Payment from '../models/Payment';
import Application from '../models/Application';
import User from '../models/User';
import Property from '../models/Property';
import { ApiResponse } from '../types';
import { logger } from '../config/logger';
import { NotFoundError, ValidationError, AuthorizationError } from '../middleware/errorHandler';
import { config } from '../config';

// Initialize Stripe
const stripe = new Stripe(config.stripe.secretKey, {
  apiVersion: '2023-10-16',
});

// Payment creation interface
export interface CreatePaymentRequest {
  applicationId: string;
  amount: number;
  currency: string;
  paymentMethod?: string;
}

// Payment search interface
export interface PaymentSearchRequest {
  page?: number;
  limit?: number;
  status?: string;
  applicationId?: string;
  clientId?: string;
  landlordId?: string;
  sortBy?: 'createdAt' | 'amount';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Create Stripe checkout session
 */
export async function createCheckoutSession(
  applicationId: string,
  clientId: string,
  amount: number,
  currency: string = 'USD'
): Promise<ApiResponse<{ sessionId: string; url: string }>> {
  try {
    // Verify application exists and belongs to client
    const application = await Application.findById(applicationId)
      .populate('propertyId')
      .populate('landlordId');
    
    if (!application) {
      throw new NotFoundError('Application not found');
    }

    if (application.clientId.toString() !== clientId) {
      throw new AuthorizationError('You can only make payments for your own applications');
    }

    if (application.status !== 'ACCEPTED') {
      throw new ValidationError('Application must be accepted before payment');
    }

    // Calculate commission (5% of rent amount)
    const commissionRate = 0.05;
    const commissionAmount = Math.round(amount * commissionRate * 100) / 100; // Round to 2 decimal places
    const platformAmount = commissionAmount;
    const landlordAmount = amount - commissionAmount;

    // Create payment record
    const payment = new Payment({
      applicationId: application._id,
      clientId: application.clientId,
      landlordId: application.landlordId,
      propertyId: (application.propertyId as any)._id,
      amount: amount * 100, // Convert to cents for Stripe
      currency: currency.toLowerCase(),
      status: 'PENDING',
      paymentMethod: 'stripe',
      commissionAmount: platformAmount * 100, // Convert to cents
    });

    await payment.save();

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: `Rent Payment - ${(application.propertyId as any).title}`,
              description: `Monthly rent payment for property application`,
            },
            unit_amount: amount * 100, // Convert to cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${config.server.corsOrigin}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.server.corsOrigin}/payment/cancel`,
      metadata: {
        paymentId: payment._id.toString(),
        applicationId: applicationId,
        clientId: clientId,
        landlordId: application.landlordId.toString(),
        propertyId: (application.propertyId as any)._id.toString(),
      },
      customer_email: (application as any).clientId.email,
    });

    // Update payment with session ID
    payment.stripePaymentIntentId = session.id;
    await payment.save();

    logger.info(`Checkout session created: ${session.id} for payment: ${payment._id}`);

    return {
      success: true,
      data: {
        sessionId: session.id,
        url: session.url!,
      },
      message: 'Checkout session created successfully',
    };
  } catch (error) {
    logger.error('Create checkout session error:', error);
    throw error;
  }
}

/**
 * Confirm payment after successful checkout
 */
export async function confirmPayment(sessionId: string): Promise<ApiResponse<any>> {
  try {
    // Retrieve session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    if (!session.metadata) {
      throw new ValidationError('Invalid session metadata');
    }

    const paymentId = session.metadata.paymentId;
    const applicationId = session.metadata.applicationId;

    // Find payment record
    const payment = await Payment.findById(paymentId);
    if (!payment) {
      throw new NotFoundError('Payment not found');
    }

    if (payment.status !== 'PENDING') {
      throw new ValidationError('Payment already processed');
    }

    // Update payment status
    payment.status = 'COMPLETED';
    payment.stripePaymentIntentId = session.payment_intent as string;
    payment.receiptUrl = (session as any).receipt_url;
    await payment.save();

    // Update application status if needed
    await Application.findByIdAndUpdate(applicationId, {
      $set: { paymentStatus: 'COMPLETED' }
    });

    logger.info(`Payment confirmed: ${paymentId} for session: ${sessionId}`);

    return {
      success: true,
      data: payment,
      message: 'Payment confirmed successfully',
    };
  } catch (error) {
    logger.error('Confirm payment error:', error);
    throw error;
  }
}

/**
 * Handle Stripe webhook
 */
export async function handleStripeWebhook(event: Stripe.Event): Promise<ApiResponse<null>> {
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object as Stripe.Checkout.Session;
        await confirmPayment(session.id);
        break;
      
      case 'payment_intent.payment_failed':
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await handlePaymentFailure(paymentIntent.id);
        break;
      
      default:
        logger.info(`Unhandled event type: ${event.type}`);
    }

    return {
      success: true,
      data: null,
      message: 'Webhook processed successfully',
    };
  } catch (error) {
    logger.error('Stripe webhook error:', error);
    throw error;
  }
}

/**
 * Handle payment failure
 */
async function handlePaymentFailure(paymentIntentId: string): Promise<void> {
  try {
    const payment = await Payment.findOne({ stripePaymentIntentId: paymentIntentId });
    if (payment) {
      payment.status = 'FAILED';
      await payment.save();
      logger.info(`Payment marked as failed: ${payment._id}`);
    }
  } catch (error) {
    logger.error('Handle payment failure error:', error);
  }
}

/**
 * Get payments for user
 */
export async function getUserPayments(
  userId: string,
  userRole: string,
  searchParams: PaymentSearchRequest = {}
): Promise<ApiResponse<{ payments: any[]; total: number; page: number; totalPages: number }>> {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = searchParams;

    // Build filter based on user role
    const filter: any = {};

    if (userRole === 'CLIENT') {
      filter.clientId = userId;
    } else if (userRole === 'LANDLORD') {
      filter.landlordId = userId;
    } else if (userRole === 'ADMIN') {
      // Admin can see all payments
    } else {
      throw new AuthorizationError('Invalid user role');
    }

    if (status) {
      filter.status = status;
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Build sort object
    const sort: any = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Execute queries
    const [payments, total] = await Promise.all([
      Payment.find(filter)
        .populate([
          { path: 'applicationId', select: 'status moveInDate' },
          { path: 'clientId', select: 'email profileData' },
          { path: 'landlordId', select: 'email profileData' },
          { path: 'propertyId', select: 'title location price currency' },
        ])
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Payment.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      success: true,
      data: {
        payments,
        total,
        page,
        totalPages,
      },
      message: 'Payments retrieved successfully',
    };
  } catch (error) {
    logger.error('Get user payments error:', error);
    throw error;
  }
}

/**
 * Get payment by ID
 */
export async function getPaymentById(paymentId: string, userId: string, userRole: string): Promise<ApiResponse<any>> {
  try {
    const payment = await Payment.findById(paymentId)
      .populate([
        { path: 'applicationId', select: 'status moveInDate applicationData' },
        { path: 'clientId', select: 'email profileData' },
        { path: 'landlordId', select: 'email profileData' },
        { path: 'propertyId', select: 'title location price currency images' },
      ]);

    if (!payment) {
      throw new NotFoundError('Payment not found');
    }

    // Check permissions
    const canView = 
      userRole === 'ADMIN' ||
      payment.clientId.toString() === userId ||
      payment.landlordId.toString() === userId;

    if (!canView) {
      throw new AuthorizationError('You do not have permission to view this payment');
    }

    return {
      success: true,
      data: payment,
      message: 'Payment retrieved successfully',
    };
  } catch (error) {
    logger.error('Get payment by ID error:', error);
    throw error;
  }
}

/**
 * Process refund
 */
export async function processRefund(
  paymentId: string,
  refundAmount?: number,
  reason?: string,
  adminId?: string
): Promise<ApiResponse<any>> {
  try {
    const payment = await Payment.findById(paymentId);
    if (!payment) {
      throw new NotFoundError('Payment not found');
    }

    if (payment.status !== 'COMPLETED') {
      throw new ValidationError('Only completed payments can be refunded');
    }

    if (!payment.stripePaymentIntentId) {
      throw new ValidationError('No Stripe payment intent found');
    }

    // Calculate refund amount
    const refundAmountCents = refundAmount ? Math.round(refundAmount * 100) : payment.amount;

    // Create refund in Stripe
    const refund = await stripe.refunds.create({
      payment_intent: payment.stripePaymentIntentId,
      amount: refundAmountCents,
      reason: 'requested_by_customer',
      metadata: {
        paymentId: paymentId,
        adminId: adminId || '',
        reason: reason || 'No reason provided',
      },
    });

    // Update payment record
    payment.status = 'REFUNDED';
    payment.refundAmount = refundAmountCents;
    payment.refundReason = reason;
    await payment.save();

    logger.info(`Refund processed: ${refund.id} for payment: ${paymentId}`);

    return {
      success: true,
      data: {
        refundId: refund.id,
        amount: refund.amount / 100, // Convert back to dollars
        status: refund.status,
      },
      message: 'Refund processed successfully',
    };
  } catch (error) {
    logger.error('Process refund error:', error);
    throw error;
  }
}

/**
 * Get payment statistics
 */
export async function getPaymentStatistics(
  userId?: string,
  userRole?: string
): Promise<ApiResponse<{
  totalPayments: number;
  completedPayments: number;
  pendingPayments: number;
  failedPayments: number;
  refundedPayments: number;
  totalRevenue: number;
  totalCommission: number;
  averagePaymentAmount: number;
  paymentsByMonth: Record<string, number>;
}>> {
  try {
    // Build filter based on user role
    const filter: any = {};

    if (userRole === 'CLIENT') {
      filter.clientId = userId;
    } else if (userRole === 'LANDLORD') {
      filter.landlordId = userId;
    } else if (userRole === 'ADMIN') {
      // Admin can see all payments
    }

    const [
      totalPayments,
      completedPayments,
      pendingPayments,
      failedPayments,
      refundedPayments,
      revenueStats,
      paymentsByMonth,
    ] = await Promise.all([
      Payment.countDocuments(filter),
      Payment.countDocuments({ ...filter, status: 'COMPLETED' }),
      Payment.countDocuments({ ...filter, status: 'PENDING' }),
      Payment.countDocuments({ ...filter, status: 'FAILED' }),
      Payment.countDocuments({ ...filter, status: 'REFUNDED' }),
      Payment.aggregate([
        { $match: { ...filter, status: 'COMPLETED' } },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$amount' },
            totalCommission: { $sum: '$commissionAmount' },
            averageAmount: { $avg: '$amount' },
          },
        },
      ]),
      Payment.aggregate([
        { $match: { ...filter, status: 'COMPLETED' } },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),
    ]);

    const revenueData = revenueStats[0] || { totalRevenue: 0, totalCommission: 0, averageAmount: 0 };
    const totalRevenue = revenueData.totalRevenue / 100; // Convert from cents
    const totalCommission = revenueData.totalCommission / 100; // Convert from cents
    const averagePaymentAmount = revenueData.averageAmount / 100; // Convert from cents

    const paymentsByMonthMap = paymentsByMonth.reduce((acc: any, item: any) => {
      const key = `${item._id.year}-${item._id.month.toString().padStart(2, '0')}`;
      acc[key] = item.count;
      return acc;
    }, {});

    return {
      success: true,
      data: {
        totalPayments,
        completedPayments,
        pendingPayments,
        failedPayments,
        refundedPayments,
        totalRevenue,
        totalCommission,
        averagePaymentAmount,
        paymentsByMonth: paymentsByMonthMap,
      },
      message: 'Payment statistics retrieved successfully',
    };
  } catch (error) {
    logger.error('Get payment statistics error:', error);
    throw error;
  }
}
