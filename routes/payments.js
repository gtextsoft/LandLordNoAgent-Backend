const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Payment = require('../models/Payment');
const Application = require('../models/Application');
const { verifyToken, authorize } = require('../middleware/auth');

const router = express.Router();

// @route   POST /api/payments/create-checkout
// @desc    Create Stripe checkout session
// @access  Private
router.post('/create-checkout', verifyToken, async (req, res) => {
  try {
    const { applicationId, amount, currency = 'usd' } = req.body;

    if (!applicationId || !amount) {
      return res.status(400).json({ 
        message: 'Application ID and amount are required' 
      });
    }

    // Verify application exists and user has access
    const application = await Application.findById(applicationId)
      .populate('property', 'title price')
      .populate('client', 'firstName lastName email');

    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    if (application.client._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to make payment for this application' });
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: `Application Fee - ${application.property.title}`,
              description: `Application fee for property: ${application.property.title}`,
            },
            unit_amount: Math.round(amount * 100), // Convert to cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/payment/cancel`,
      metadata: {
        applicationId: applicationId,
        userId: req.user._id.toString(),
        type: 'application_fee'
      },
      customer_email: application.client.email,
    });

    res.json({
      sessionId: session.id,
      url: session.url
    });

  } catch (error) {
    console.error('Create checkout session error:', error);
    res.status(500).json({ 
      message: 'Server error while creating checkout session' 
    });
  }
});

// @route   POST /api/payments/webhook
// @desc    Handle Stripe webhook
// @access  Public
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object);
        break;
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object);
        break;
      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(event.data.object);
        break;
      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

// Handle successful checkout session
const handleCheckoutSessionCompleted = async (session) => {
  try {
    const { applicationId, userId, type } = session.metadata;

    if (type === 'application_fee') {
      // Update application payment status
      await Application.findByIdAndUpdate(applicationId, {
        'applicationFee.paid': true,
        'applicationFee.paymentId': session.payment_intent,
        'applicationFee.paidAt': new Date()
      });

      // Create payment record
      const payment = new Payment({
        application: applicationId,
        user: userId,
        amount: session.amount_total / 100, // Convert from cents
        currency: session.currency,
        stripePaymentIntentId: session.payment_intent,
        stripeSessionId: session.id,
        status: 'completed',
        type: 'application_fee'
      });

      await payment.save();
    }

  } catch (error) {
    console.error('Handle checkout session completed error:', error);
  }
};

// Handle successful payment intent
const handlePaymentIntentSucceeded = async (paymentIntent) => {
  try {
    // Update payment status
    await Payment.findOneAndUpdate(
      { stripePaymentIntentId: paymentIntent.id },
      { status: 'completed' }
    );
  } catch (error) {
    console.error('Handle payment intent succeeded error:', error);
  }
};

// Handle failed payment intent
const handlePaymentIntentFailed = async (paymentIntent) => {
  try {
    // Update payment status
    await Payment.findOneAndUpdate(
      { stripePaymentIntentId: paymentIntent.id },
      { status: 'failed', failureReason: paymentIntent.last_payment_error?.message }
    );
  } catch (error) {
    console.error('Handle payment intent failed error:', error);
  }
};

// @route   GET /api/payments/history
// @desc    Get user payment history
// @access  Private
router.get('/history', verifyToken, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const payments = await Payment.find({ user: req.user._id })
      .populate('application', 'property client')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Payment.countDocuments({ user: req.user._id });

    res.json({
      payments,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total,
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Get payment history error:', error);
    res.status(500).json({ message: 'Server error while fetching payment history' });
  }
});

// @route   GET /api/payments/:id
// @desc    Get payment details
// @access  Private
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate('application', 'property client')
      .populate('user', 'firstName lastName email');

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    // Check if user has access to this payment
    if (payment.user._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to view this payment' });
    }

    res.json({ payment });

  } catch (error) {
    console.error('Get payment error:', error);
    res.status(500).json({ message: 'Server error while fetching payment' });
  }
});

// @route   GET /api/payments/receipt
// @desc    Generate payment receipt (query params)
// @access  Private
router.get('/receipt', verifyToken, async (req, res) => {
  try {
    const { id: paymentId, client_id: clientId } = req.query;

    if (!paymentId || !clientId) {
      return res.status(400).json({ 
        error: 'Missing payment ID or client ID',
        details: 'Both id and client_id parameters are required'
      });
    }

    // TODO: Replace with MongoDB backend call
    // For now, we'll simulate a successful payment lookup
    console.log('Looking up payment:', { paymentId, clientId });
    
    // Simulate payment data
    const payment = {
      id: paymentId,
      amount: 12000,
      currency: 'usd',
      status: 'completed',
      description: 'Rental Payment',
      transaction_id: `txn_${paymentId}`,
      stripe_payment_intent_id: `pi_${paymentId}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      commission_rate: 0.10,
      commission_amount: 1200,
      landlord_amount: 10800,
      application: {
        id: 'app_123',
        lease_duration: 12,
        monthly_income: 5001,
        employment_status: 'employed',
        move_in_date: '2024-02-01',
        created_at: new Date().toISOString(),
        client: {
          id: clientId,
          email: 'client@example.com',
          kyc_data: {
            firstName: 'John',
            lastName: 'Doe'
          }
        },
        property: {
          id: 'prop_123',
          title: 'Beautiful Apartment',
          location: 'New York, NY',
          price: 1000,
          duration: 12
        }
      },
      landlord: {
        id: 'landlord_123',
        email: 'landlord@example.com',
        kyc_data: {
          firstName: 'Jane',
          lastName: 'Smith'
        }
      }
    };

    // Generate receipt data
    const receiptData = {
      receiptNumber: `RCT-${payment.id.substring(0, 8).toUpperCase()}`,
      issueDate: new Date().toISOString(),
      payment: {
        id: payment.id,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        description: payment.description,
        transactionId: payment.transaction_id,
        stripePaymentIntentId: payment.stripe_payment_intent_id,
        createdAt: payment.created_at,
        updatedAt: payment.updated_at
      },
      client: {
        id: payment.application?.client?.id,
        email: payment.application?.client?.email,
        name: payment.application?.client?.kyc_data?.firstName || 
              payment.application?.client?.email?.split('@')[0] || 
              'Client'
      },
      landlord: {
        id: payment.landlord?.id,
        email: payment.landlord?.email,
        name: payment.landlord?.kyc_data?.firstName || 
              payment.landlord?.email?.split('@')[0] || 
              'Landlord'
      },
      property: {
        id: payment.application?.property?.id,
        title: payment.application?.property?.title,
        location: payment.application?.property?.location,
        price: payment.application?.property?.price,
        duration: payment.application?.property?.duration
      },
      application: {
        id: payment.application?.id,
        leaseDuration: payment.application?.lease_duration,
        monthlyIncome: payment.application?.monthly_income,
        employmentStatus: payment.application?.employment_status,
        moveInDate: payment.application?.move_in_date,
        createdAt: payment.application?.created_at
      },
      platform: {
        name: 'LandLordNoAgent',
        website: process.env.FRONTEND_URL || 'http://localhost:3000',
        supportEmail: 'support@landlordnoagent.com',
        commissionRate: payment.commission_rate || 0,
        commissionAmount: payment.commission_amount || 0,
        landlordAmount: payment.landlord_amount || payment.amount
      }
    };

    console.log('Receipt generated successfully for payment:', paymentId);

    res.json({ 
      success: true,
      receipt: receiptData,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Generate receipt error:', error);
    res.status(500).json({ 
      error: 'Failed to generate receipt',
      details: error.message || 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// @route   GET /api/payments/receipt/:paymentId
// @desc    Generate payment receipt (path param)
// @access  Private
router.get('/receipt/:paymentId', verifyToken, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.paymentId)
      .populate('application', 'property client')
      .populate('user', 'firstName lastName email');

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    // Check if user has access to this receipt
    if (payment.user._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to view this receipt' });
    }

    // Generate receipt data
    const receipt = {
      paymentId: payment._id,
      date: payment.createdAt,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      user: {
        name: `${payment.user.firstName} ${payment.user.lastName}`,
        email: payment.user.email
      },
      application: {
        propertyTitle: payment.application?.property?.title || 'N/A',
        applicationId: payment.application?._id
      },
      stripePaymentIntentId: payment.stripePaymentIntentId
    };

    res.json({ receipt });

  } catch (error) {
    console.error('Generate receipt error:', error);
    res.status(500).json({ message: 'Server error while generating receipt' });
  }
});

// Admin routes
// @route   GET /api/payments/admin/all
// @desc    Get all payments (Admin only)
// @access  Private (Admin)
router.get('/admin/all', verifyToken, authorize('admin'), async (req, res) => {
  try {
    const { status, type, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filters = {};
    if (status) filters.status = status;
    if (type) filters.type = type;

    const payments = await Payment.find(filters)
      .populate('application', 'property client')
      .populate('user', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Payment.countDocuments(filters);

    res.json({
      payments,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total,
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Get all payments error:', error);
    res.status(500).json({ message: 'Server error while fetching payments' });
  }
});

module.exports = router;
