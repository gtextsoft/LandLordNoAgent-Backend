const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
// const { verifyToken } = require('../middleware/auth');
const { verifyToken } = require('../middleware/auth');
const {
  handleCheckoutSessionCompleted,
  handlePaymentIntentSucceeded,
  handlePaymentIntentFailed
} = require('../services/stripeWebhookHandlers');

/**
 * POST /api/stripe/create-checkout
 * Create a Stripe checkout session for payment
 */

router.post('/create-checkout', verifyToken, async (req, res) => {
  try {
    // NOTE: Frontend currently uses `/api/payments/create-checkout`, not this endpoint.
    // We keep it for compatibility, but it must not rely on hardcoded placeholder data.
    const { applicationId, amount, currency = 'NGN' } = req.body;

    if (!applicationId) {
      return res.status(400).json({ error: 'applicationId is required' });
    }

    // Load application + property to validate ownership and determine payment type.
    const Application = require('../models/Application');
    const Property = require('../models/Property');

    const application = await Application.findById(applicationId)
      .populate('property', 'title price isAvailable')
      .populate('client', '_id email');

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    if (String(application.client?._id) !== String(req.user?._id)) {
      return res.status(403).json({ error: 'Not authorized to pay for this application' });
    }

    if (application.property?.isAvailable === false) {
      return res.status(400).json({ error: 'Property is no longer available' });
    }

    // Default amount: use request amount if provided, else use application fee if set, else fall back to property price.
    const resolvedAmount =
      Number(amount) ||
      Number(application.applicationFee?.amount) ||
      Number(application.property?.price) ||
      0;

    if (!resolvedAmount || Number.isNaN(resolvedAmount) || resolvedAmount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }

    const isRentPayment = application.status === 'approved' || application.status === 'accepted';
    const paymentType = isRentPayment ? 'rent' : 'application_fee';
    const productName = isRentPayment
      ? `Rent Payment - ${application.property?.title || 'Property'} (Escrow)`
      : `Application Fee - ${application.property?.title || 'Property'}`;
    const description = isRentPayment
      ? `Rent payment for property: ${application.property?.title || 'Property'}. Payment will be held in escrow.`
      : `Application fee for property: ${application.property?.title || 'Property'}`;

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: String(currency).toLowerCase(),
            product_data: {
              name: productName,
              description,
            },
            unit_amount: Math.round(resolvedAmount * 100),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/cancel`,
      metadata: {
        applicationId,
        userId: req.user?._id?.toString(),
        type: paymentType
      },
    });

    res.json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    console.error('Stripe checkout creation error:', error);
    res.status(500).json({
      error: 'Failed to create checkout session',
      details: error.message,
    });
  }
});

/**
 * POST /api/stripe/confirm
 * Confirm a Stripe payment session
 */
router.post('/confirm', verifyToken, async (req, res) => {
  try {
    const { session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({ error: 'Missing session_id' });
    }

    const session = await stripe.checkout.sessions.retrieve(session_id);
    
    if (!session || session.payment_status !== 'paid') {
      return res.status(409).json({ error: 'Payment not completed' });
    }

    // Ensure the session belongs to the authenticated user if metadata includes userId.
    const sessionUserId = session.metadata?.userId;
    if (sessionUserId && req.user?._id && String(sessionUserId) !== String(req.user._id)) {
      return res.status(403).json({ error: 'Not authorized to confirm this payment' });
    }

    // Create/update MongoDB payment using the shared idempotent handler.
    const payment = await handleCheckoutSessionCompleted(session);

    res.json({
      success: true,
      payment: payment
        ? {
            id: payment._id,
            amount: payment.amount,
            currency: payment.currency,
            status: payment.status,
            stripeSessionId: payment.stripeSessionId,
            stripePaymentIntentId: payment.stripePaymentIntentId
          }
        : null,
    });
  } catch (error) {
    console.error('Payment confirmation error:', error);
    res.status(500).json({
      error: 'Failed to confirm payment',
      details: error.message,
    });
  }
});

/**
 * POST /api/stripe/webhook
 * Handle Stripe webhook events
 */
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'];

    if (!signature) {
      return res.status(400).json({ error: 'Missing stripe signature' });
    }

    let event;

    try {
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!webhookSecret) {
        console.error('STRIPE_WEBHOOK_SECRET is not set');
        return res.status(500).json({ error: 'Webhook secret not configured' });
      }

      event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return res.status(400).json({ error: 'Invalid signature' });
    }

    try {
      console.log('Processing webhook event:', event.type);

      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          await handleCheckoutSessionCompleted(session);
          break;
        }

        case 'payment_intent.succeeded': {
          const paymentIntent = event.data.object;
          await handlePaymentIntentSucceeded(paymentIntent);
          break;
        }

        case 'payment_intent.payment_failed': {
          const paymentIntent = event.data.object;
          await handlePaymentIntentFailed(paymentIntent);
          break;
        }

        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      res.json({ received: true });
    } catch (error) {
      console.error('Webhook processing error:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }
);

module.exports = router;

