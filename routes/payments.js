const express = require('express');
const Payment = require('../models/Payment');
const Application = require('../models/Application');
const Property = require('../models/Property');
const { verifyToken, authorize } = require('../middleware/auth');
const {
  handleCheckoutSessionCompleted,
  handlePaymentIntentSucceeded,
  handlePaymentIntentFailed
} = require('../services/stripeWebhookHandlers');
const { createAuditLog, getRequestMetadata } = require('../utils/auditLogger');

const router = express.Router();
const Stripe = require('stripe'); 

// Initialize Stripe only if API key is provided
let stripe = null;
try {
  if (process.env.STRIPE_SECRET_KEY) {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  } else {
    console.warn('⚠️  STRIPE_SECRET_KEY not found in environment variables. Stripe payments will be disabled.');
  }
} catch (error) {
  console.error('Error initializing Stripe:', error);
}

// Calculate escrow interest (charged if property not visited within 10 days)
const calculateEscrowInterest = (amount, daysHeld) => {
  if (daysHeld <= 10 || amount <= 0) return 0;
  // 2% interest per day after 10 days
  const daysOver = daysHeld - 10;
  const interest = amount * 0.02 * daysOver;
  // Round to 2 decimal places and ensure non-negative
  return Math.max(0, Math.round(interest * 100) / 100);
};

// @route   POST /api/payments/create-checkout
// @desc    Create Stripe checkout session
// @access  Private
router.post('/create-checkout', verifyToken, async (req, res) => {
  try {
    // Check if Stripe is configured
    if (!stripe) {
      return res.status(503).json({ 
        message: 'Payment processing is currently unavailable. Please contact support.',
        error: 'Stripe API key not configured'
      });
    }

    const { applicationId, amount, currency = 'ngn' } = req.body;

    // Validate required fields
    if (!applicationId) {
      return res.status(400).json({ 
        message: 'Application ID is required',
        error: 'MISSING_APPLICATION_ID'
      });
    }

    if (!amount) {
      return res.status(400).json({ 
        message: 'Payment amount is required',
        error: 'MISSING_AMOUNT'
      });
    }

    // Validate amount is a valid number
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return res.status(400).json({ 
        message: 'Payment amount must be a valid number greater than zero',
        error: 'INVALID_AMOUNT'
      });
    }

    // Minimum amount validation (e.g., 100 NGN or equivalent)
    const MIN_AMOUNT = 100;
    if (amountNum < MIN_AMOUNT) {
      return res.status(400).json({ 
        message: `Payment amount must be at least ${MIN_AMOUNT} ${currency.toUpperCase()}`,
        error: 'AMOUNT_TOO_LOW',
        minimumAmount: MIN_AMOUNT
      });
    }

    // Validate currency
    const validCurrencies = ['ngn', 'usd', 'gbp', 'eur'];
    if (!validCurrencies.includes(currency.toLowerCase())) {
      return res.status(400).json({ 
        message: `Invalid currency. Supported currencies: ${validCurrencies.join(', ').toUpperCase()}`,
        error: 'INVALID_CURRENCY',
        supportedCurrencies: validCurrencies
      });
    }

    // Verify application exists and user has access
    const application = await Application.findById(applicationId)
      .populate('property', 'title price')
      .populate('client', 'firstName lastName email');

    if (!application) {
      return res.status(404).json({ 
        message: 'Application not found',
        error: 'APPLICATION_NOT_FOUND'
      });
    }

    // Check if application belongs to the authenticated user
    if (application.client._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ 
        message: 'Not authorized to make payment for this application',
        error: 'UNAUTHORIZED_APPLICATION'
      });
    }

    // Check if application is in a valid state for payment
    const validStatusesForPayment = ['approved', 'accepted', 'pending'];
    if (!validStatusesForPayment.includes(application.status)) {
      return res.status(400).json({ 
        message: `Cannot make payment for application with status: ${application.status}. Application must be approved or accepted.`,
        error: 'INVALID_APPLICATION_STATUS',
        currentStatus: application.status
      });
    }

    // Check if property exists and is available
    if (!application.property) {
      return res.status(400).json({ 
        message: 'Property information not found for this application',
        error: 'PROPERTY_NOT_FOUND'
      });
    }

    if (application.property.isAvailable === false) {
      return res.status(400).json({ 
        message: 'This property is no longer available for payment',
        error: 'PROPERTY_UNAVAILABLE'
      });
    }

    // Determine payment type - rent payments for approved applications are escrow
    const isRentPayment = application.status === 'approved' || application.status === 'accepted';
    const paymentType = isRentPayment ? 'rent' : 'application_fee';
    const productName = isRentPayment 
      ? `Rent Payment - ${application.property.title} (Escrow)`
      : `Application Fee - ${application.property.title}`;
    const description = isRentPayment
      ? `Rent payment for property: ${application.property.title}. Payment will be held in escrow until property visit and document handover.`
      : `Application fee for property: ${application.property.title}`;

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: productName,
              description: description,
            },
            unit_amount: Math.round(amount * 100), // Convert to cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/cancel`,
      // Ensure we always get a URL back
      payment_method_types: ['card'],
      metadata: {
        applicationId: applicationId,
        userId: req.user._id.toString(),
        type: paymentType
      },
      customer_email: application.client.email,
    });

    // Return session info - ALWAYS include URL for direct redirect
    if (!session.url) {
      console.error('⚠️ Stripe session created but no URL returned!', session);
      return res.status(500).json({ 
        message: 'Payment session created but checkout URL is missing. Please try again.',
        error: 'Missing checkout URL'
      });
    }

    res.json({
      sessionId: session.id,
      url: session.url, // This is the most important - use this for direct redirect
      // Include a hint about which publishable key to use (for debugging)
      publishableKeyHint: process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') 
        ? 'Use pk_test_... key' 
        : process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_')
        ? 'Use pk_live_... key'
        : 'Check Stripe dashboard for matching publishable key'
    });

  } catch (error) {
    console.error('Create checkout session error:', error);
    
    // Categorize and provide detailed error information
    let statusCode = 500;
    let errorMessage = 'Server error while creating checkout session';
    let errorCode = 'UNKNOWN_ERROR';
    
    // Stripe-specific errors
    if (error.type) {
      switch (error.type) {
        case 'StripeAuthenticationError':
          errorMessage = 'Payment service authentication failed. Please contact support.';
          errorCode = 'STRIPE_AUTH_ERROR';
          statusCode = 503; // Service unavailable
          break;
        case 'StripeInvalidRequestError':
          errorMessage = `Invalid payment request: ${error.message || 'Please check your payment details'}`;
          errorCode = 'STRIPE_INVALID_REQUEST';
          statusCode = 400;
          break;
        case 'StripeAPIError':
          errorMessage = 'Payment service error. Please try again later or contact support.';
          errorCode = 'STRIPE_API_ERROR';
          statusCode = 503;
          break;
        case 'StripeConnectionError':
          errorMessage = 'Unable to connect to payment service. Please try again.';
          errorCode = 'STRIPE_CONNECTION_ERROR';
          statusCode = 503;
          break;
        case 'StripeRateLimitError':
          errorMessage = 'Too many requests. Please wait a moment and try again.';
          errorCode = 'STRIPE_RATE_LIMIT';
          statusCode = 429;
          break;
        default:
          errorMessage = error.message || errorMessage;
          errorCode = `STRIPE_${error.type}`;
      }
    } else if (error.message) {
      // Database or other errors
      if (error.message.includes('Cast to ObjectId failed')) {
        errorMessage = 'Invalid application ID format';
        errorCode = 'INVALID_ID_FORMAT';
        statusCode = 400;
      } else if (error.message.includes('network') || error.message.includes('ECONNREFUSED')) {
        errorMessage = 'Database connection error. Please try again later.';
        errorCode = 'DATABASE_ERROR';
        statusCode = 503;
      } else {
        errorMessage = error.message;
      }
    }
    
    // Log full error details for debugging (server-side only)
    console.error('Payment error details:', {
      type: error.type,
      code: errorCode,
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
    
    res.status(statusCode).json({ 
      message: errorMessage,
      error: errorCode,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/payments/webhook
// @desc    Handle Stripe webhook
// @access  Public
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  // Check if Stripe is configured
  if (!stripe) {
    console.error('Stripe webhook received but Stripe is not configured');
    return res.status(503).send('Payment processing is currently unavailable');
  }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      console.error('STRIPE_WEBHOOK_SECRET not configured');
      return res.status(500).send('Webhook secret not configured');
    }
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

// @route   GET /api/payments/confirm/:sessionId
// @desc    Confirm payment session (called after Stripe redirect)
// @access  Private
router.get('/confirm/:sessionId', verifyToken, async (req, res) => {
  try {
    // Check if Stripe is configured
    if (!stripe) {
      return res.status(503).json({ 
        message: 'Payment processing is currently unavailable. Please contact support.',
        error: 'Stripe API key not configured'
      });
    }

    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({ message: 'Session ID is required' });
    }

    // Retrieve the Stripe checkout session
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (!session) {
      return res.status(404).json({ message: 'Payment session not found' });
    }

    // Check if payment was successful
    if (session.payment_status !== 'paid') {
      return res.status(400).json({ 
        message: 'Payment not completed',
        payment_status: session.payment_status
      });
    }

    // Check if payment already exists
    let payment = await Payment.findOne({ stripeSessionId: sessionId });

    if (!payment) {
      // If webhook hasn't fired yet, process the session locally using the same idempotent handler.
      const created = await handleCheckoutSessionCompleted(session);
      if (!created) {
        return res.status(400).json({ message: 'Application ID not found in session metadata' });
      }
      payment = created;
    }

    // Return payment confirmation
    res.json({
      success: true,
      message: 'Payment confirmed successfully',
      payment: {
        id: payment._id,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        isEscrow: payment.isEscrow,
        escrowStatus: payment.escrowStatus,
        escrowExpiresAt: payment.escrowExpiresAt
      }
    });

  } catch (error) {
    console.error('Confirm payment error:', error);
    res.status(500).json({ 
      message: 'Server error while confirming payment',
      error: error.message 
    });
  }
});

// @route   GET /api/payments/history
// @desc    Get user payment history
// @access  Private
router.get('/history', verifyToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, applicationId } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build filter based on user role
    let filters = {};
    
    // If applicationId is provided, filter by it directly (and verify user has access)
    if (applicationId) {
      // Verify the user has access to this application
      const application = await Application.findById(applicationId);
      if (!application) {
        return res.status(404).json({ message: 'Application not found' });
      }

      // Check if user has access to this application
      if (req.user.role === 'client') {
        // Client can only see payments for their own applications
        if (application.client.toString() !== req.user._id.toString()) {
          return res.status(403).json({ message: 'Not authorized to view payments for this application' });
        }
      } else if (req.user.role === 'landlord') {
        // Landlord can only see payments for their own properties
        if (application.landlord.toString() !== req.user._id.toString()) {
          return res.status(403).json({ message: 'Not authorized to view payments for this application' });
        }
      }
      // Admin can see all applications

      // Filter by applicationId
      filters.application = applicationId;
    } else {
      // No specific applicationId - use role-based filtering
      if (req.user.role === 'client') {
        // Clients see their own payments
        filters.user = req.user._id;
      } else if (req.user.role === 'landlord') {
        // Landlords see payments for their properties
        // Get all applications for this landlord's properties
        const landlordApplications = await Application.find({ landlord: req.user._id }).select('_id');
        const applicationIds = landlordApplications.map(app => app._id);
        if (applicationIds.length > 0) {
          filters.application = { $in: applicationIds };
        } else {
          // No applications found - return empty result
          filters.application = { $in: [] };
        }
      } else if (req.user.role === 'admin') {
        // Admin sees all payments
        // No filter needed
      } else {
        filters.user = req.user._id; // Default to own payments
      }
    }

    const payments = await Payment.find(filters)
      .populate({
        path: 'application',
        populate: [
          { path: 'property', select: 'title price address images rentalType' },
          { path: 'client', select: 'firstName lastName email' },
          { path: 'landlord', select: 'firstName lastName email' }
        ]
      })
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
    console.error('Get payment history error:', error);
    res.status(500).json({ message: 'Server error while fetching payment history' });
  }
});

// @route   GET /api/payments/receipt/:paymentId
// @desc    Generate payment receipt (path param)
// @access  Private
router.get('/receipt/:paymentId', verifyToken, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.paymentId)
      .populate({
        path: 'application',
        populate: [
          { path: 'property', select: 'title price address location leaseTerms rentalType' },
          { path: 'client', select: 'firstName lastName email' },
          { path: 'landlord', select: 'firstName lastName email' }
        ]
      })
      .populate('user', 'firstName lastName email');

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    // Check if user has access to this receipt
    const isClient = payment.user._id.toString() === req.user._id.toString();
    const isLandlord = payment.application?.landlord?._id?.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isClient && !isLandlord && !isAdmin) {
      return res.status(403).json({ message: 'Not authorized to view this receipt' });
    }

    // Generate description if not set
    const paymentDescription = payment.description || 
      (payment.type === 'rent' 
        ? `Rent payment for property: ${payment.application?.property?.title || 'Property'}`
        : `Application fee for property: ${payment.application?.property?.title || 'Property'}`);

    // Get transaction ID - prefer charge ID, then payment intent ID, then session ID
    const transactionId = payment.stripeChargeId || 
                          payment.stripePaymentIntentId || 
                          payment.stripeSessionId || 
                          null;

    // Generate receipt data (same format as query param endpoint)
    const paymentData = {
      id: payment._id.toString(),
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      description: paymentDescription,
      transaction_id: transactionId,
      stripe_payment_intent_id: payment.stripePaymentIntentId,
      created_at: payment.createdAt,
      updated_at: payment.updatedAt,
      commission_rate: payment.commission_rate || 0,
      commission_amount: payment.commission_amount || 0,
      landlord_amount: payment.amount - (payment.commission_amount || 0),
      isEscrow: payment.isEscrow,
      escrowStatus: payment.escrowStatus,
      application: payment.application ? {
        id: payment.application._id.toString(),
        lease_duration: payment.application.preferences?.leaseLength || payment.application.preferences?.leaseDuration,
        monthly_income: payment.application.employment?.monthlyIncome || payment.application.financialInfo?.monthlyIncome,
        employment_status: payment.application.employment?.employmentType,
        move_in_date: payment.application.preferences?.moveInDate,
        created_at: payment.application.applicationDate || payment.application.createdAt,
        client: payment.application.client ? {
          id: payment.application.client._id.toString(),
          email: payment.application.client.email,
          firstName: payment.application.client.firstName,
          lastName: payment.application.client.lastName
        } : null,
        property: payment.application?.property ? {
          id: payment.application.property._id?.toString() || payment.application.property.id,
          title: payment.application.property.title || 'N/A',
          location: payment.application.property.address && typeof payment.application.property.address === 'object'
            ? `${payment.application.property.address.street || ''}, ${payment.application.property.address.city || ''}`.replace(/^,\s*|,\s*$/g, '').trim() || payment.application.property.address.city || payment.application.property.address.street || 'N/A'
            : payment.application.property.location || 'N/A',
          price: payment.application.property.price || 0,
          duration: payment.application.property.leaseTerms?.minLease || payment.application.property.duration || 0
        } : null,
        landlord: payment.application.landlord ? {
          id: payment.application.landlord._id.toString(),
          email: payment.application.landlord.email,
          firstName: payment.application.landlord.firstName,
          lastName: payment.application.landlord.lastName
        } : null
      } : null
    };

    const receiptData = {
      receiptNumber: `RCT-${payment._id.toString().substring(0, 8).toUpperCase()}`,
      issueDate: new Date().toISOString(),
      payment: {
        id: paymentData.id,
        amount: paymentData.amount,
        currency: paymentData.currency,
        status: paymentData.status,
        description: paymentData.description,
        transactionId: paymentData.transaction_id || 'N/A',
        stripePaymentIntentId: paymentData.stripe_payment_intent_id,
        createdAt: paymentData.created_at,
        updatedAt: paymentData.updated_at
      },
      client: {
        id: paymentData.application?.client?.id,
        email: paymentData.application?.client?.email,
        name: paymentData.application?.client?.firstName && paymentData.application?.client?.lastName
          ? `${paymentData.application.client.firstName} ${paymentData.application.client.lastName}`
          : paymentData.application?.client?.email?.split('@')[0] || 'Client'
      },
      landlord: {
        id: paymentData.application?.landlord?.id,
        email: paymentData.application?.landlord?.email,
        name: paymentData.application?.landlord?.firstName && paymentData.application?.landlord?.lastName
          ? `${paymentData.application.landlord.firstName} ${paymentData.application.landlord.lastName}`
          : paymentData.application?.landlord?.email?.split('@')[0] || 'Landlord'
      },
      property: paymentData.application?.property ? {
        id: paymentData.application.property.id || null,
        title: paymentData.application.property.title || 'N/A',
        location: paymentData.application.property.location || 'N/A',
        price: paymentData.application.property.price || 0,
        duration: paymentData.application.property.duration || 0
      } : {
        id: null,
        title: 'N/A',
        location: 'N/A',
        price: 0,
        duration: 0
      },
      application: {
        id: paymentData.application?.id,
        leaseDuration: paymentData.application?.lease_duration,
        monthlyIncome: paymentData.application?.monthly_income,
        employmentStatus: paymentData.application?.employment_status,
        moveInDate: paymentData.application?.move_in_date,
        createdAt: paymentData.application?.created_at
      },
      platform: {
        name: 'LandLordNoAgent',
        website: process.env.FRONTEND_URL || 'http://localhost:3000',
        supportEmail: 'support@landlordnoagent.com',
        commissionRate: paymentData.commission_rate || 0,
        commissionAmount: paymentData.commission_amount || 0,
        landlordAmount: paymentData.landlord_amount || paymentData.amount
      },
      escrow: paymentData.isEscrow ? {
        status: paymentData.escrowStatus,
        heldAt: payment.escrowHeldAt,
        expiresAt: payment.escrowExpiresAt,
        releasedAt: payment.escrowReleasedAt
      } : null
    };

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



// @route   GET /api/payments/receipt
// @desc    Generate payment receipt (query params)
// @access  Private
router.get('/receipt', verifyToken, async (req, res) => {
  try {
    const { id: paymentId, client_id: clientId } = req.query;

    if (!paymentId) {
      return res.status(400).json({ 
        error: 'Missing payment ID',
        details: 'The id parameter is required'
      });
    }

    // Fetch actual payment from database
    const payment = await Payment.findById(paymentId)
      .populate({
        path: 'application',
        populate: [
          { path: 'property', select: 'title price address location leaseTerms rentalType' },
          { path: 'client', select: 'firstName lastName email' },
          { path: 'landlord', select: 'firstName lastName email' }
        ]
      })
      .populate('user', 'firstName lastName email');

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    // Verify user has access to this payment
    // Allow access if:
    // 1. User is the client who made the payment
    // 2. User is the landlord of the property
    // 3. User is an admin
    const isClient = payment.user._id.toString() === req.user._id.toString();
    const isLandlord = payment.application?.landlord?._id?.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    
    // If client_id is provided, validate it matches (for backward compatibility)
    if (clientId && payment.user._id.toString() !== clientId && !isAdmin && !isLandlord) {
      return res.status(403).json({ message: 'Not authorized to view this receipt' });
    }

    // Check authorization
    if (!isClient && !isLandlord && !isAdmin) {
      return res.status(403).json({ message: 'Not authorized to view this receipt' });
    }

    // Generate description if not set
    const paymentDescription = payment.description || 
      (payment.type === 'rent' 
        ? `Rent payment for property: ${payment.application?.property?.title || 'Property'}`
        : `Application fee for property: ${payment.application?.property?.title || 'Property'}`);

    // Get transaction ID - prefer charge ID, then payment intent ID, then session ID
    const transactionId = payment.stripeChargeId || 
                          payment.stripePaymentIntentId || 
                          payment.stripeSessionId || 
                          null;

    // Get payment data from database
    const paymentData = {
      id: payment._id.toString(),
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      description: paymentDescription,
      transaction_id: transactionId,
      stripe_payment_intent_id: payment.stripePaymentIntentId,
      created_at: payment.createdAt,
      updated_at: payment.updatedAt,
      commission_rate: payment.commission_rate || 0,
      commission_amount: payment.commission_amount || 0,
      landlord_amount: payment.amount - (payment.commission_amount || 0),
      isEscrow: payment.isEscrow,
      escrowStatus: payment.escrowStatus,
      application: payment.application ? {
        id: payment.application._id.toString(),
        lease_duration: payment.application.preferences?.leaseLength || payment.application.preferences?.leaseDuration,
        monthly_income: payment.application.employment?.monthlyIncome || payment.application.financialInfo?.monthlyIncome,
        employment_status: payment.application.employment?.employmentType,
        move_in_date: payment.application.preferences?.moveInDate,
        created_at: payment.application.applicationDate || payment.application.createdAt,
        client: payment.application.client ? {
          id: payment.application.client._id.toString(),
          email: payment.application.client.email,
          firstName: payment.application.client.firstName,
          lastName: payment.application.client.lastName
        } : null,
        property: payment.application?.property ? {
          id: payment.application.property._id?.toString() || payment.application.property.id,
          title: payment.application.property.title || 'N/A',
          location: payment.application.property.address && typeof payment.application.property.address === 'object'
            ? `${payment.application.property.address.street || ''}, ${payment.application.property.address.city || ''}`.replace(/^,\s*|,\s*$/g, '').trim() || payment.application.property.address.city || payment.application.property.address.street || 'N/A'
            : payment.application.property.location || 'N/A',
          price: payment.application.property.price || 0,
          duration: payment.application.property.leaseTerms?.minLease || payment.application.property.duration || 0
        } : null,
        landlord: payment.application.landlord ? {
          id: payment.application.landlord._id.toString(),
          email: payment.application.landlord.email,
          firstName: payment.application.landlord.firstName,
          lastName: payment.application.landlord.lastName
        } : null
      } : null
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
        description: paymentData.description,
        transactionId: paymentData.transaction_id || 'N/A',
        stripePaymentIntentId: payment.stripe_payment_intent_id,
        createdAt: payment.created_at,
        updatedAt: payment.updated_at
      },
      client: {
        id: payment.application?.client?.id,
        email: payment.application?.client?.email,
        name: payment.application?.client?.firstName && payment.application?.client?.lastName
          ? `${payment.application.client.firstName} ${payment.application.client.lastName}`
          : payment.application?.client?.kyc_data?.firstName || 
            payment.application?.client?.email?.split('@')[0] || 
            'Client'
      },
      landlord: {
        id: paymentData.application?.landlord?.id,
        email: paymentData.application?.landlord?.email,
        name: paymentData.application?.landlord?.firstName && paymentData.application?.landlord?.lastName
          ? `${paymentData.application.landlord.firstName} ${paymentData.application.landlord.lastName}`
          : paymentData.application?.landlord?.email?.split('@')[0] || 'Landlord'
      },
      property: paymentData.application?.property ? {
        id: paymentData.application.property.id || null,
        title: paymentData.application.property.title || 'N/A',
        location: paymentData.application.property.location || 'N/A',
        price: paymentData.application.property.price || 0,
        duration: paymentData.application.property.duration || 0
      } : {
        id: null,
        title: 'N/A',
        location: 'N/A',
        price: 0,
        duration: 0
      },
      application: {
        id: paymentData.application?.id,
        leaseDuration: paymentData.application?.lease_duration,
        monthlyIncome: paymentData.application?.monthly_income,
        employmentStatus: paymentData.application?.employment_status,
        moveInDate: paymentData.application?.move_in_date,
        createdAt: paymentData.application?.created_at
      },
      platform: {
        name: 'LandLordNoAgent',
        website: process.env.FRONTEND_URL || 'http://localhost:3000',
        supportEmail: 'support@landlordnoagent.com',
        commissionRate: paymentData.commission_rate || 0,
        commissionAmount: paymentData.commission_amount || 0,
        landlordAmount: paymentData.landlord_amount || paymentData.amount
      },
      escrow: paymentData.isEscrow ? {
        status: paymentData.escrowStatus,
        heldAt: payment.escrowHeldAt,
        expiresAt: payment.escrowExpiresAt,
        releasedAt: payment.escrowReleasedAt
      } : null
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

// @route   PUT /api/payments/:id/escrow/release
// @desc    Release escrow payment to landlord (Admin only)
// @access  Private (Admin)
router.put('/:id/escrow/release', verifyToken, authorize('admin'), async (req, res) => {
  try {
    const commissionService = require('../services/commissionService');
    const landlordAccountService = require('../services/landlordAccountService');
    const AuditLog = require('../models/AuditLog');
    
    const payment = await Payment.findById(req.params.id)
      .populate('application', 'property client landlord');

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    if (!payment.isEscrow) {
      return res.status(400).json({ message: 'Payment is not an escrow payment' });
    }

    if (payment.escrowStatus !== 'held') {
      if (payment.escrowStatus === 'released') {
        // Already released - return the existing payment data
        return res.status(200).json({
          message: 'Escrow already released',
          payment: {
            ...payment.toObject(),
            grossAmount: payment.amount,
            commissionRate: payment.commission_rate,
            commissionAmount: payment.commission_amount,
            landlordNetAmount: payment.landlordNetAmount
          }
        });
      }
      return res.status(400).json({ 
        message: `Payment escrow status is '${payment.escrowStatus}', cannot release` 
      });
    }

    // Validate escrow was actually held (escrowHeldAt should exist)
    if (!payment.escrowHeldAt) {
      console.error(`Payment ${payment._id} marked as escrow but escrowHeldAt is missing`);
      // Set it to now as fallback, but log the issue
      payment.escrowHeldAt = new Date();
    }

    // Calculate interest if property not visited within 10 days
    const daysHeld = Math.max(0, Math.floor((new Date() - payment.escrowHeldAt) / (1000 * 60 * 60 * 24)));
    const interest = calculateEscrowInterest(payment.amount, daysHeld);
    payment.escrowInterest = interest;
    
    // Get current commission rate from PlatformSettings
    const commissionRate = await commissionService.getCurrentCommissionRate();
    
    // Store original gross amount (before any deductions)
    const grossAmount = payment.amount;
    
    // Validate amounts before calculation
    if (grossAmount <= 0) {
      return res.status(400).json({ message: 'Invalid payment amount' });
    }
    if (commissionRate < 0 || commissionRate > 1) {
      return res.status(500).json({ message: 'Invalid commission rate configuration' });
    }

    // Calculate commission using the service
    const commissionAmount = commissionService.calculateCommission(grossAmount, commissionRate);
    
    // Calculate net landlord amount (after commission and interest)
    const landlordNetAmount = commissionService.calculateNetAmount(grossAmount, commissionRate, interest);
    
    // Validate calculations
    if (commissionAmount < 0 || landlordNetAmount < 0) {
      console.error(`Invalid commission calculation for payment ${payment._id}:`, {
        grossAmount,
        commissionRate,
        commissionAmount,
        interest,
        landlordNetAmount
      });
      return res.status(500).json({ message: 'Commission calculation error' });
    }
    
    // Store commission details in payment
    payment.commission_rate = commissionRate;
    payment.commission_amount = commissionAmount;
    payment.landlordNetAmount = landlordNetAmount;
    
    // Update payment status
    payment.escrowStatus = 'released';
    payment.escrowReleasedAt = new Date();
    
    // Get landlord ID from application
    const landlordId = payment.application.landlord._id || payment.application.landlord;
    
    if (!landlordId) {
      return res.status(400).json({ message: 'Landlord information not found in application' });
    }

    // Verify landlord exists and is actually a landlord
    const User = require('../models/User');
    const landlord = await User.findById(landlordId);
    if (!landlord) {
      return res.status(404).json({ message: 'Landlord not found' });
    }
    if (landlord.role !== 'landlord') {
      return res.status(400).json({ message: 'User is not a landlord' });
    }
    
    // Get or create landlord account
    const landlordAccount = await landlordAccountService.createOrGetAccount(landlordId);
    
    // Link payment to landlord account
    payment.landlordAccount = landlordAccount._id;
    
    // Update landlord account balances
    await landlordAccountService.updateBalance(
      landlordId,
      grossAmount,
      commissionAmount,
      landlordNetAmount,
      'available'
    );
    
    // Log commission calculation in AuditLog
    await AuditLog.logCommissionCalculation(
      req.user._id,
      payment._id,
      grossAmount,
      commissionRate,
      commissionAmount,
      landlordNetAmount,
      landlordId,
      req.ip,
      req.get('user-agent')
    );

    // Audit log: Escrow released
    const { ipAddress, userAgent } = getRequestMetadata(req);
    await createAuditLog({
      action: 'escrow_released',
      entityType: 'Payment',
      entityId: payment._id,
      userId: req.user._id,
      details: {
        paymentId: payment._id.toString(),
        applicationId: payment.application._id.toString(),
        grossAmount,
        commissionRate,
        commissionAmount,
        landlordNetAmount,
        escrowInterest: interest,
        daysHeld
      },
      ipAddress,
      userAgent
    });
    
    await payment.save();
    
    console.log(`✅ Escrow released: Payment ${payment._id}, Gross: ₦${grossAmount}, Commission: ₦${commissionAmount} (${(commissionRate * 100)}%), Net: ₦${landlordNetAmount}`);

    // Send escrow released email notification to landlord
    try {
      const { sendEmail, getEmailTemplate } = require('../utils/emailNotifications');
      const landlordEmail = payment.application.landlord?.email;
      
      if (landlordEmail) {
        // Reload payment with populated data for email
        const paymentWithDetails = await Payment.findById(payment._id)
          .populate('application', 'property landlord');
        
        const template = getEmailTemplate('escrowReleased', {
          landlordName: payment.application.landlord?.firstName || 'Landlord',
          propertyTitle: payment.application.property?.title || 'Property',
          grossAmount: grossAmount,
          commissionRate: commissionRate,
          commissionAmount: commissionAmount,
          landlordNetAmount: landlordNetAmount,
          interestCharged: interest,
          currency: payment.currency || 'NGN',
          paymentId: payment._id.toString()
        });
        
        if (template) {
          await sendEmail(landlordEmail, template.subject, template.html, template.text);
          console.log(`Escrow released email sent to ${landlordEmail} for payment ${payment._id}`);
        }
      }
    } catch (emailError) {
      // Don't fail the release if email fails
      console.error('Error sending escrow released email:', emailError);
    }

    res.json({
      message: 'Escrow released successfully',
      payment: {
        ...payment.toObject(),
        grossAmount,
        commissionRate,
        commissionAmount,
        landlordNetAmount,
        interestCharged: interest,
        daysHeld: daysHeld
      }
    });

  } catch (error) {
    console.error('Release escrow error:', error);
    res.status(500).json({ message: 'Server error while releasing escrow', error: error.message });
  }
});

// @route   PUT /api/payments/:id/escrow/visit
// @desc    Mark property as visited (Client)
// @access  Private
router.put('/:id/escrow/visit', verifyToken, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate('application', 'client');

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    // Verify user is the client
    if (payment.application.client._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    payment.propertyVisited = true;
    await payment.save();

    res.json({
      message: 'Property visit marked',
      payment
    });

  } catch (error) {
    console.error('Mark visit error:', error);
    res.status(500).json({ message: 'Server error while marking visit' });
  }
});

// @route   PUT /api/payments/:id/escrow/documents
// @desc    Mark documents as received (Client)
// @access  Private
router.put('/:id/escrow/documents', verifyToken, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate('application', 'client');

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    // Verify user is the client
    if (payment.application.client._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    payment.documentsReceived = true;
    await payment.save();

    // Audit log: Documents received marked
    const { ipAddress, userAgent } = getRequestMetadata(req);
    await createAuditLog({
      action: 'documents_received_marked',
      entityType: 'Payment',
      entityId: payment._id,
      userId: req.user._id,
      details: { paymentId: payment._id.toString() },
      ipAddress,
      userAgent
    });

    res.json({
      message: 'Documents received marked',
      payment
    });

  } catch (error) {
    console.error('Mark documents error:', error);
    res.status(500).json({ message: 'Server error while marking documents' });
  }
});

// @route   GET /api/payments/escrow
// @desc    Get all escrow payments (Admin)
// @access  Private (Admin)
router.get('/escrow', verifyToken, authorize('admin'), async (req, res) => {
  try {
    const payments = await Payment.find({ isEscrow: true, escrowStatus: 'held' })
      .populate('application', 'property client landlord')
      .populate('user', 'firstName lastName email')
      .sort({ escrowHeldAt: -1 });

    res.json({ payments });

  } catch (error) {
    console.error('Get escrow payments error:', error);
    res.status(500).json({ message: 'Server error while fetching escrow payments' });
  }
});

module.exports = router;
