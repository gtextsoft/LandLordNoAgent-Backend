const express = require('express');
const Payment = require('../models/Payment');
const Application = require('../models/Application');
const { verifyToken, authorize } = require('../middleware/auth');

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
  if (daysHeld <= 10) return 0;
  // 2% interest per day after 10 days
  const daysOver = daysHeld - 10;
  return Math.round(amount * 0.02 * daysOver * 100) / 100;
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
      success_url: `${process.env.FRONTEND_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/payment/cancel`,
      metadata: {
        applicationId: applicationId,
        userId: req.user._id.toString(),
        type: paymentType
      },
      customer_email: application.client.email,
    });

    // Return session info with publishable key hint for debugging
    res.json({
      sessionId: session.id,
      url: session.url,
      // Include a hint about which publishable key to use (for debugging)
      publishableKeyHint: process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') 
        ? 'Use pk_test_... key' 
        : process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_')
        ? 'Use pk_live_... key'
        : 'Check Stripe dashboard for matching publishable key'
    });

  } catch (error) {
    console.error('Create checkout session error:', error);
    
    // Provide more detailed error information
    let errorMessage = 'Server error while creating checkout session';
    if (error.type === 'StripeAuthenticationError') {
      errorMessage = 'Stripe authentication failed. Please check your Stripe API key configuration.';
    } else if (error.type === 'StripeInvalidRequestError') {
      errorMessage = `Invalid payment request: ${error.message || 'Please check your payment details'}`;
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    res.status(500).json({ 
      message: errorMessage,
      error: error.type || 'Unknown error',
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

// Handle successful checkout session
const handleCheckoutSessionCompleted = async (session) => {
  try {
    const { applicationId, userId, type } = session.metadata;

    if (!applicationId) {
      console.error('No applicationId in session metadata');
      return;
    }

    // Get application to check if it's rent payment
    const application = await Application.findById(applicationId)
      .populate('property', 'rentalType');
    
    if (!application) {
      console.error('Application not found:', applicationId);
      return;
    }

    // Determine if this should be escrow (rent payments for approved applications are escrow)
    const isRentPayment = (type === 'rent' || application.status === 'approved' || application.status === 'accepted');
    const escrowExpiresAt = new Date();
    escrowExpiresAt.setDate(escrowExpiresAt.getDate() + 10); // 10 days from now

    // Update application payment status
    if (type === 'application_fee') {
      await Application.findByIdAndUpdate(applicationId, {
        'applicationFee.paid': true,
        'applicationFee.paymentId': session.payment_intent,
        'applicationFee.paidAt': new Date()
      });
    }

    // Create payment record with escrow
    const payment = new Payment({
      application: applicationId,
      user: userId,
      amount: session.amount_total / 100, // Convert from cents
      currency: session.currency,
      stripePaymentIntentId: session.payment_intent,
      stripeSessionId: session.id,
      status: 'completed',
      type: isRentPayment ? 'rent' : (type || 'application_fee'),
      isEscrow: isRentPayment, // Rent payments are held in escrow
      escrowStatus: isRentPayment ? 'held' : null,
      escrowHeldAt: isRentPayment ? new Date() : null,
      escrowExpiresAt: isRentPayment ? escrowExpiresAt : null,
      commission_rate: 0, // No commission
      commission_amount: 0 // No commission
    });

    await payment.save();
    console.log(`✅ Payment created: ${payment._id}, Escrow: ${isRentPayment ? 'Yes' : 'No'}`);

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

    // Fetch actual payment from database
    const payment = await Payment.findById(paymentId)
      .populate('application', 'property client landlord')
      .populate('user', 'firstName lastName email');

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    // Verify user has access to this payment
    if (payment.user._id.toString() !== clientId && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to view this receipt' });
    }

    // Get payment data from database
    const paymentData = {
      id: payment._id.toString(),
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      description: payment.description || 'Rental Payment',
      transaction_id: payment.stripeChargeId || payment.stripePaymentIntentId,
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
        property: payment.application.property ? {
          id: payment.application.property._id.toString(),
          title: payment.application.property.title,
          location: payment.application.property.address ? 
            `${payment.application.property.address.street}, ${payment.application.property.address.city}` : 
            payment.application.property.location,
          price: payment.application.property.price,
          duration: payment.application.property.leaseTerms?.minLease
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
        id: paymentData.application?.property?.id,
        title: paymentData.application?.property?.title,
        location: paymentData.application?.property?.location,
        price: paymentData.application?.property?.price,
        duration: paymentData.application?.property?.duration
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
    const payment = await Payment.findById(req.params.id)
      .populate('application', 'property client landlord');

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    if (!payment.isEscrow || payment.escrowStatus !== 'held') {
      return res.status(400).json({ message: 'Payment is not held in escrow' });
    }

    // Calculate interest if property not visited within 10 days
    const daysHeld = Math.floor((new Date() - payment.escrowHeldAt) / (1000 * 60 * 60 * 24));
    const interest = calculateEscrowInterest(payment.amount, daysHeld);
    
    // Update payment
    payment.escrowStatus = 'released';
    payment.escrowReleasedAt = new Date();
    payment.escrowInterest = interest;
    
    // If interest is charged, reduce the amount to landlord
    if (interest > 0) {
      payment.amount = payment.amount - interest;
    }

    await payment.save();

    // TODO: Transfer funds to landlord via Stripe
    // For now, just mark as released

    res.json({
      message: 'Escrow released successfully',
      payment: {
        ...payment.toObject(),
        interestCharged: interest,
        daysHeld: daysHeld
      }
    });

  } catch (error) {
    console.error('Release escrow error:', error);
    res.status(500).json({ message: 'Server error while releasing escrow' });
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
