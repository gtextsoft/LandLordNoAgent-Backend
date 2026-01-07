const PayoutRequest = require('../models/PayoutRequest');
const LandlordAccount = require('../models/LandlordAccount');
const Payment = require('../models/Payment');
const Application = require('../models/Application');
const landlordAccountService = require('./landlordAccountService');

/**
 * Create a payout request
 * @param {string} landlordId - Landlord user ID
 * @param {number} amount - Net payout amount (after commission)
 * @param {string} paymentMethod - Payment method ('stripe_connect' or 'bank_transfer')
 * @param {object} bankDetails - Bank details (if bank_transfer)
 * @param {string} stripeAccountId - Stripe Connect account ID (if stripe_connect)
 * @returns {Promise<PayoutRequest>} Created payout request
 */
const createPayoutRequest = async (landlordId, amount, paymentMethod, bankDetails = null, stripeAccountId = null) => {
  // Validate payout eligibility
  const validation = await landlordAccountService.canRequestPayout(landlordId, amount);
  if (!validation.canRequest) {
    throw new Error(validation.reasons.join(', '));
  }
  
  // Get landlord account
  const account = await landlordAccountService.createOrGetAccount(landlordId);
  
  // Find available payments that haven't been allocated
  const applications = await Application.find({ landlord: landlordId }).select('_id');
  const applicationIds = applications.map(app => app._id);
  
  const availablePayments = await Payment.find({
    application: { $in: applicationIds },
    landlordAccount: account._id,
    status: 'completed',
    allocatedToPayout: false,
    landlordNetAmount: { $exists: true, $gt: 0 }
  }).sort({ createdAt: 1 }); // Oldest first
  
  // Calculate total available from payments
  let totalAvailable = 0;
  const paymentsToAllocate = [];
  
  for (const payment of availablePayments) {
    if (totalAvailable >= amount) break;
    paymentsToAllocate.push(payment);
    totalAvailable += (payment.landlordNetAmount || 0);
  }
  
  if (totalAvailable < amount) {
    throw new Error(`Insufficient funds. Available: ₦${totalAvailable.toLocaleString()}, Requested: ₦${amount.toLocaleString()}`);
  }
  
  // Create payout request
  const payoutRequest = new PayoutRequest({
    landlord: landlordId,
    landlordAccount: account._id,
    amount,
    paymentMethod,
    bankDetails: paymentMethod === 'bank_transfer' ? bankDetails : null,
    stripeAccountId: paymentMethod === 'stripe_connect' ? stripeAccountId : null,
    relatedPayments: paymentsToAllocate.map(p => p._id),
    status: 'pending'
  });
  
  await payoutRequest.save();
  
  // Allocate payments to this payout request
  for (const payment of paymentsToAllocate) {
    await landlordAccountService.allocatePaymentToPayout(payment._id, payoutRequest._id);
  }
  
  return payoutRequest;
};

/**
 * Validate payout request
 * @param {string} landlordId - Landlord user ID
 * @param {number} amount - Requested amount
 * @returns {Promise<object>} Validation result
 */
const validatePayoutRequest = async (landlordId, amount) => {
  return await landlordAccountService.canRequestPayout(landlordId, amount);
};

/**
 * Process Stripe Connect payout
 * @param {string} payoutRequestId - Payout request ID
 * @returns {Promise<object>} Processing result
 */
const processStripePayout = async (payoutRequestId) => {
  const stripeService = require('./stripeService');
  
  const payoutRequest = await PayoutRequest.findById(payoutRequestId)
    .populate('landlord', 'firstName lastName email')
    .populate('landlordAccount');
  
  if (!payoutRequest) {
    throw new Error('Payout request not found');
  }
  
  if (payoutRequest.status !== 'approved') {
    throw new Error('Payout request must be approved before processing');
  }
  
  if (payoutRequest.paymentMethod !== 'stripe_connect') {
    throw new Error('Payout request is not for Stripe Connect');
  }
  
  if (!payoutRequest.stripeAccountId) {
    throw new Error('Stripe Connect account ID is missing');
  }
  
  // Update status to processing
  payoutRequest.status = 'processing';
  payoutRequest.processedAt = new Date();
  await payoutRequest.save();
  
  try {
    // Initiate transfer via Stripe
    const transfer = await stripeService.initiateTransfer(
      payoutRequest.stripeAccountId,
      payoutRequest.amount,
      payoutRequest.currency || 'NGN'
    );
    
    // Update payout request with transfer ID
    payoutRequest.transferId = transfer.id;
    payoutRequest.status = 'completed';
    payoutRequest.completedAt = new Date();
    
    // Update landlord account
    const account = payoutRequest.landlordAccount;
    account.totalPayouts += payoutRequest.amount;
    account.availableBalance -= payoutRequest.amount;
    account.lastPayoutAt = new Date();
    await account.save();
    
    await payoutRequest.save();
    
    return {
      success: true,
      transferId: transfer.id,
      payoutRequest
    };
  } catch (error) {
    // Mark as failed
    payoutRequest.status = 'failed';
    payoutRequest.failureReason = error.message;
    await payoutRequest.save();
    
    throw error;
  }
};

/**
 * Process bank transfer payout (marks for manual processing)
 * @param {string} payoutRequestId - Payout request ID
 * @param {string} transferId - Bank transfer reference ID
 * @returns {Promise<object>} Processing result
 */
const processBankTransfer = async (payoutRequestId, transferId = null) => {
  const payoutRequest = await PayoutRequest.findById(payoutRequestId)
    .populate('landlordAccount');
  
  if (!payoutRequest) {
    throw new Error('Payout request not found');
  }
  
  if (payoutRequest.status !== 'approved') {
    throw new Error('Payout request must be approved before processing');
  }
  
  if (payoutRequest.paymentMethod !== 'bank_transfer') {
    throw new Error('Payout request is not for bank transfer');
  }
  
  // Update status to processing
  payoutRequest.status = 'processing';
  payoutRequest.processedAt = new Date();
  if (transferId) {
    payoutRequest.transferId = transferId;
  }
  await payoutRequest.save();
  
  // Note: For bank transfers, the admin needs to manually complete the transfer
  // This function just marks it as processing
  // The admin should call updatePayoutStatus to mark it as completed after manual transfer
  
  return {
    success: true,
    payoutRequest,
    message: 'Payout marked as processing. Please complete manual bank transfer and update status.'
  };
};

/**
 * Update payout status
 * @param {string} payoutRequestId - Payout request ID
 * @param {string} status - New status
 * @param {string} adminId - Admin user ID
 * @param {string} notes - Admin notes
 * @param {string} reason - Rejection/failure reason
 * @returns {Promise<PayoutRequest>} Updated payout request
 */
const updatePayoutStatus = async (payoutRequestId, status, adminId, notes = '', reason = '') => {
  const payoutRequest = await PayoutRequest.findById(payoutRequestId)
    .populate('landlordAccount');
  
  if (!payoutRequest) {
    throw new Error('Payout request not found');
  }
  
  const oldStatus = payoutRequest.status;
  payoutRequest.status = status;
  payoutRequest.reviewedBy = adminId;
  payoutRequest.reviewedAt = new Date();
  payoutRequest.adminNotes = notes;
  
  if (status === 'approved') {
    payoutRequest.approvedAt = new Date();
  } else if (status === 'rejected') {
    payoutRequest.rejectionReason = reason;
    
    // Deallocate payments if rejected
    if (oldStatus === 'pending') {
      const Payment = require('../models/Payment');
      await Payment.updateMany(
        { payoutRequest: payoutRequestId },
        {
          $set: {
            allocatedToPayout: false,
            payoutRequest: null,
            payoutAllocatedAt: null
          }
        }
      );
    }
  } else if (status === 'completed') {
    payoutRequest.completedAt = new Date();
    
    // Update landlord account if not already updated
    if (oldStatus !== 'completed') {
      const account = payoutRequest.landlordAccount;
      account.totalPayouts += payoutRequest.amount;
      account.availableBalance -= payoutRequest.amount;
      account.lastPayoutAt = new Date();
      await account.save();
    }
  } else if (status === 'failed') {
    payoutRequest.failureReason = reason;
    
    // Deallocate payments on failure
    const Payment = require('../models/Payment');
    await Payment.updateMany(
      { payoutRequest: payoutRequestId },
      {
        $set: {
          allocatedToPayout: false,
          payoutRequest: null,
          payoutAllocatedAt: null
        }
      }
    );
  }
  
  await payoutRequest.save();
  
  return payoutRequest;
};

/**
 * Get all pending payouts for admin
 * @returns {Promise<Array>} Array of pending payout requests
 */
const getPendingPayouts = async () => {
  return await PayoutRequest.find({ status: 'pending' })
    .populate('landlord', 'firstName lastName email')
    .populate('landlordAccount')
    .populate('reviewedBy', 'firstName lastName')
    .sort({ requestedAt: -1 });
};

/**
 * Calculate available balance from payments
 * @param {string} landlordId - Landlord user ID
 * @returns {Promise<number>} Available balance
 */
const calculateAvailableBalance = async (landlordId) => {
  const account = await landlordAccountService.createOrGetAccount(landlordId);
  return account.availableBalance;
};

module.exports = {
  createPayoutRequest,
  validatePayoutRequest,
  processStripePayout,
  processBankTransfer,
  updatePayoutStatus,
  getPendingPayouts,
  calculateAvailableBalance
};

