const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

/**
 * Create Stripe Connect account for landlord
 * @param {string} landlordId - Landlord user ID
 * @param {object} accountData - Account information
 * @returns {Promise<object>} Connect account
 */
const createConnectAccount = async (landlordId, accountData = {}) => {
  try {
    const account = await stripe.accounts.create({
      type: 'express',
      country: accountData.country || 'NG',
      email: accountData.email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true }
      },
      metadata: {
        landlordId: landlordId.toString()
      }
    });
    
    return {
      success: true,
      accountId: account.id,
      account
    };
  } catch (error) {
    console.error('Error creating Connect account:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Get Stripe Connect account status
 * @param {string} connectAccountId - Stripe Connect account ID
 * @returns {Promise<object>} Account status
 */
const getConnectAccountStatus = async (connectAccountId) => {
  try {
    const account = await stripe.accounts.retrieve(connectAccountId);
    
    return {
      success: true,
      account,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted
    };
  } catch (error) {
    console.error('Error retrieving Connect account:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Create account link for onboarding
 * @param {string} connectAccountId - Stripe Connect account ID
 * @param {string} refreshUrl - URL to redirect to after refresh
 * @param {string} returnUrl - URL to redirect to after completion
 * @returns {Promise<object>} Account link
 */
const createAccountLink = async (connectAccountId, refreshUrl, returnUrl) => {
  try {
    const accountLink = await stripe.accountLinks.create({
      account: connectAccountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding'
    });
    
    return {
      success: true,
      url: accountLink.url
    };
  } catch (error) {
    console.error('Error creating account link:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Initiate transfer to Stripe Connect account
 * @param {string} connectAccountId - Stripe Connect account ID
 * @param {number} amount - Amount to transfer (in currency units, not cents)
 * @param {string} currency - Currency code (default: 'ngn')
 * @returns {Promise<object>} Transfer result
 */
const initiateTransfer = async (connectAccountId, amount, currency = 'ngn') => {
  try {
    // Note: For Stripe Connect, we use transfers to move funds from platform to connected account
    // The amount should be in the smallest currency unit (cents for NGN)
    const transfer = await stripe.transfers.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: currency.toLowerCase(),
      destination: connectAccountId,
      metadata: {
        type: 'landlord_payout'
      }
    });
    
    return {
      success: true,
      transfer: transfer,
      id: transfer.id
    };
  } catch (error) {
    console.error('Error initiating transfer:', error);
    throw new Error(`Transfer failed: ${error.message}`);
  }
};

/**
 * Get transfer status
 * @param {string} transferId - Transfer ID
 * @returns {Promise<object>} Transfer status
 */
const getTransferStatus = async (transferId) => {
  try {
    const transfer = await stripe.transfers.retrieve(transferId);
    
    return {
      success: true,
      transfer,
      status: transfer.reversed ? 'reversed' : transfer.status || 'pending'
    };
  } catch (error) {
    console.error('Error retrieving transfer:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Create login link for connected account
 * @param {string} connectAccountId - Stripe Connect account ID
 * @returns {Promise<object>} Login link
 */
const createLoginLink = async (connectAccountId) => {
  try {
    const loginLink = await stripe.accounts.createLoginLink(connectAccountId);
    
    return {
      success: true,
      url: loginLink.url
    };
  } catch (error) {
    console.error('Error creating login link:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

module.exports = {
  createConnectAccount,
  getConnectAccountStatus,
  createAccountLink,
  initiateTransfer,
  getTransferStatus,
  createLoginLink
};

