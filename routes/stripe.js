const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
// const { verifyToken } = require('../middleware/auth');
const { verifyToken } = require('../middleware/auth');

/**
 * POST /api/stripe/create-checkout
 * Create a Stripe checkout session for payment
 */

console.log('verifyToken is:', verifyToken);

router.post('/create-checkout', verifyToken, async (req, res) => {
  try {
    console.log('=== STRIPE CREATE CHECKOUT DEBUG ===');
    console.log('Request received at:', new Date().toISOString());

    const { applicationId, clientId, landlordId, propertyId, currency, description } = req.body;

    // Validate required fields
    if (!applicationId || !clientId || !landlordId || !propertyId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log('Request data:', { applicationId, clientId, landlordId, propertyId, currency });

    // TODO: Replace with MongoDB backend data loading
    const row = {
      id: applicationId,
      client_id: clientId,
      lease_duration: 12,
      property_id: propertyId,
      property_title: description || 'Property Rental',
      property_price: 1000,
      property_duration: 12,
      property_landlord_id: landlordId,
      property_is_available: true,
    };

    console.log('Application data loaded:', row);

    // Validate the application belongs to the client
    if (row.client_id !== clientId) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Validate the property is available
    if (!row.property_is_available) {
      return res.status(400).json({ error: 'Property is no longer available' });
    }

    // Calculate total amount
    const leaseDuration = row.lease_duration || row.property_duration || 12;
    const monthlyRent = row.property_price;
    const totalAmount = Math.round(monthlyRent * leaseDuration * 100); // Convert to cents

    console.log('Payment calculation:', { monthlyRent, leaseDuration, totalAmount, currency });

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: (currency || 'NGN').toLowerCase(),
            product_data: {
              name: `${row.property_title} - ${leaseDuration} month lease`,
              description: `Rental payment for ${leaseDuration} months`,
            },
            unit_amount: totalAmount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/cancel`,
      metadata: {
        applicationId,
        clientId,
        landlordId,
        propertyId,
        leaseDuration: leaseDuration.toString(),
        monthlyRent: monthlyRent.toString(),
      },
    });

    console.log('Stripe session created:', session.id);

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
router.post('/confirm', async (req, res) => {
  try {
    console.log('=== STRIPE CONFIRM DEBUG ===');
    const { session_id } = req.body;
    console.log('Session ID:', session_id);

    if (!session_id) {
      return res.status(400).json({ error: 'Missing session_id' });
    }

    const session = await stripe.checkout.sessions.retrieve(session_id);
    
    if (!session || session.payment_status !== 'paid') {
      return res.status(409).json({ error: 'Payment not completed' });
    }

    // TODO: Replace with MongoDB backend payment processing
    console.log('Payment confirmed for session:', session.id);

    const paymentData = {
      sessionId: session.id,
      paymentIntentId: session.payment_intent,
      amount: session.amount_total,
      currency: session.currency,
      status: 'completed',
      applicationId: session.metadata?.applicationId,
      clientId: session.metadata?.clientId,
      landlordId: session.metadata?.landlordId,
      propertyId: session.metadata?.propertyId,
    };

    console.log('Payment data processed:', paymentData);

    res.json({
      success: true,
      payment: paymentData,
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
          console.log('Checkout session completed:', session.id);
          // TODO: Process payment completion in MongoDB
          break;
        }

        case 'payment_intent.succeeded': {
          const paymentIntent = event.data.object;
          console.log('Payment intent succeeded:', paymentIntent.id);
          // TODO: Process successful payment in MongoDB
          break;
        }

        case 'payment_intent.payment_failed': {
          const paymentIntent = event.data.object;
          console.log('Payment intent failed:', paymentIntent.id);
          // TODO: Handle failed payment in MongoDB
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

