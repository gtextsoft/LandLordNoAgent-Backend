const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Create payment intent
const createPaymentIntent = async (amount, currency = 'usd', metadata = {}) => {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: currency.toLowerCase(),
      metadata: metadata,
      automatic_payment_methods: {
        enabled: true,
      },
    });

    return {
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    };
  } catch (error) {
    console.error('Error creating payment intent:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Confirm payment intent
const confirmPaymentIntent = async (paymentIntentId) => {
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    if (paymentIntent.status === 'succeeded') {
      return {
        success: true,
        paymentIntent: paymentIntent,
        charge: paymentIntent.charges.data[0] || null
      };
    } else {
      return {
        success: false,
        status: paymentIntent.status,
        error: 'Payment not completed'
      };
    }
  } catch (error) {
    console.error('Error confirming payment intent:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Create refund
const createRefund = async (chargeId, amount = null, reason = 'requested_by_customer') => {
  try {
    const refundData = {
      charge: chargeId,
      reason: reason
    };

    if (amount) {
      refundData.amount = Math.round(amount * 100); // Convert to cents
    }

    const refund = await stripe.refunds.create(refundData);

    return {
      success: true,
      refund: refund
    };
  } catch (error) {
    console.error('Error creating refund:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Get payment intent details
const getPaymentIntent = async (paymentIntentId) => {
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    return {
      success: true,
      paymentIntent: paymentIntent
    };
  } catch (error) {
    console.error('Error retrieving payment intent:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Create customer
const createCustomer = async (email, name, metadata = {}) => {
  try {
    const customer = await stripe.customers.create({
      email: email,
      name: name,
      metadata: metadata
    });

    return {
      success: true,
      customer: customer
    };
  } catch (error) {
    console.error('Error creating customer:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Update customer
const updateCustomer = async (customerId, updates) => {
  try {
    const customer = await stripe.customers.update(customerId, updates);
    return {
      success: true,
      customer: customer
    };
  } catch (error) {
    console.error('Error updating customer:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Get customer
const getCustomer = async (customerId) => {
  try {
    const customer = await stripe.customers.retrieve(customerId);
    return {
      success: true,
      customer: customer
    };
  } catch (error) {
    console.error('Error retrieving customer:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Create setup intent for saving payment methods
const createSetupIntent = async (customerId, metadata = {}) => {
  try {
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
      metadata: metadata,
    });

    return {
      success: true,
      clientSecret: setupIntent.client_secret,
      setupIntentId: setupIntent.id
    };
  } catch (error) {
    console.error('Error creating setup intent:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Get customer's payment methods
const getPaymentMethods = async (customerId) => {
  try {
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
    });

    return {
      success: true,
      paymentMethods: paymentMethods.data
    };
  } catch (error) {
    console.error('Error retrieving payment methods:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Delete payment method
const deletePaymentMethod = async (paymentMethodId) => {
  try {
    await stripe.paymentMethods.detach(paymentMethodId);
    return {
      success: true
    };
  } catch (error) {
    console.error('Error deleting payment method:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Handle webhook event
const handleWebhookEvent = (event) => {
  switch (event.type) {
    case 'payment_intent.succeeded':
      return handlePaymentSucceeded(event.data.object);
    case 'payment_intent.payment_failed':
      return handlePaymentFailed(event.data.object);
    case 'charge.dispute.created':
      return handleDisputeCreated(event.data.object);
    default:
      console.log(`Unhandled event type ${event.type}`);
  }
};

// Handle successful payment
const handlePaymentSucceeded = (paymentIntent) => {
  console.log('Payment succeeded:', paymentIntent.id);
  // Add your business logic here
  return {
    success: true,
    message: 'Payment processed successfully'
  };
};

// Handle failed payment
const handlePaymentFailed = (paymentIntent) => {
  console.log('Payment failed:', paymentIntent.id);
  // Add your business logic here
  return {
    success: false,
    message: 'Payment failed'
  };
};

// Handle dispute
const handleDisputeCreated = (dispute) => {
  console.log('Dispute created:', dispute.id);
  // Add your business logic here
  return {
    success: true,
    message: 'Dispute handling initiated'
  };
};

// Calculate application fee
const calculateApplicationFee = (amount, feePercentage = 0.03) => {
  return Math.round(amount * feePercentage * 100) / 100;
};

// Calculate platform commission
const calculateCommission = (amount, commissionRate = 0.05) => {
  return Math.round(amount * commissionRate * 100) / 100;
};

module.exports = {
  createPaymentIntent,
  confirmPaymentIntent,
  createRefund,
  getPaymentIntent,
  createCustomer,
  updateCustomer,
  getCustomer,
  createSetupIntent,
  getPaymentMethods,
  deletePaymentMethod,
  handleWebhookEvent,
  calculateApplicationFee,
  calculateCommission
};
