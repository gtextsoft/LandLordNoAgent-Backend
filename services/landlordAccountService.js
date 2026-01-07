const LandlordAccount = require('../models/LandlordAccount');
const User = require('../models/User');

/**
 * Create or get landlord account
 * @param {string} landlordId - Landlord user ID
 * @returns {Promise<LandlordAccount>} Landlord account
 */
const createOrGetAccount = async (landlordId) => {
  let account = await LandlordAccount.findOne({ landlord: landlordId });
  
  if (!account) {
    // Check if user is a landlord
    const user = await User.findById(landlordId);
    if (!user || user.role !== 'landlord') {
      throw new Error('User is not a landlord');
    }
    
    // Sync KYC status
    const kycVerified = user.kyc?.status === 'verified';
    
    account = new LandlordAccount({
      landlord: landlordId,
      kycVerified,
      kycVerifiedAt: kycVerified ? (user.kyc?.verifiedAt || new Date()) : null
    });
    
    await account.save();
  }
  
  return account;
};

/**
 * Update landlord account balance
 * @param {string} landlordId - Landlord user ID
 * @param {number} grossAmount - Gross amount (before commission)
 * @param {number} commissionAmount - Commission amount deducted
 * @param {number} netAmount - Net amount (after commission)
 * @param {string} type - Balance type: 'available' or 'pending'
 * @returns {Promise<LandlordAccount>} Updated account
 */
const updateBalance = async (landlordId, grossAmount, commissionAmount, netAmount, type = 'available') => {
  const account = await createOrGetAccount(landlordId);
  
  account.totalGrossEarnings += grossAmount;
  account.totalCommissionPaid += commissionAmount;
  account.totalNetEarnings += netAmount;
  
  if (type === 'available') {
    account.availableBalance += netAmount;
  } else if (type === 'pending') {
    account.pendingBalance += netAmount;
  }
  
  await account.save();
  
  return account;
};

/**
 * Get landlord account balance with commission breakdown
 * @param {string} landlordId - Landlord user ID
 * @returns {Promise<object>} Account balance information
 */
const getAccountBalance = async (landlordId) => {
  const account = await createOrGetAccount(landlordId);
  
  // Sync KYC status from user
  const user = await User.findById(landlordId);
  if (user && user.kyc?.status === 'verified' && !account.kycVerified) {
    account.kycVerified = true;
    account.kycVerifiedAt = user.kyc?.verifiedAt || new Date();
    await account.save();
  }
  
  return {
    availableBalance: account.availableBalance,
    pendingBalance: account.pendingBalance,
    totalGrossEarnings: account.totalGrossEarnings,
    totalCommissionPaid: account.totalCommissionPaid,
    totalNetEarnings: account.totalNetEarnings,
    totalPayouts: account.totalPayouts,
    kycVerified: account.kycVerified,
    accountStatus: account.accountStatus
  };
};

/**
 * Check if landlord can request payout
 * @param {string} landlordId - Landlord user ID
 * @param {number} amount - Requested payout amount
 * @returns {Promise<object>} Validation result
 */
const canRequestPayout = async (landlordId, amount) => {
  const account = await createOrGetAccount(landlordId);
  const MIN_PAYOUT_AMOUNT = 50000;
  
  const checks = {
    canRequest: true,
    reasons: []
  };
  
  // Check KYC
  if (!account.kycVerified) {
    checks.canRequest = false;
    checks.reasons.push('KYC verification required');
  }
  
  // Check minimum amount
  if (amount < MIN_PAYOUT_AMOUNT) {
    checks.canRequest = false;
    checks.reasons.push(`Minimum payout amount is ₦${MIN_PAYOUT_AMOUNT.toLocaleString()}`);
  }
  
  // Check available balance
  if (amount > account.availableBalance) {
    checks.canRequest = false;
    checks.reasons.push('Insufficient available balance');
  }
  
  // Check account status
  if (account.accountStatus !== 'active') {
    checks.canRequest = false;
    checks.reasons.push(`Account is ${account.accountStatus}`);
  }
  
  return checks;
};

/**
 * Allocate payment to payout request
 * @param {string} paymentId - Payment ID
 * @param {string} payoutRequestId - Payout request ID
 * @returns {Promise<Payment>} Updated payment
 */
const allocatePaymentToPayout = async (paymentId, payoutRequestId) => {
  const Payment = require('../models/Payment');
  
  const payment = await Payment.findById(paymentId);
  if (!payment) {
    throw new Error('Payment not found');
  }
  
  if (payment.allocatedToPayout) {
    throw new Error('Payment already allocated to a payout');
  }
  
  payment.allocatedToPayout = true;
  payment.payoutRequest = payoutRequestId;
  payment.payoutAllocatedAt = new Date();
  
  await payment.save();
  
  return payment;
};

/**
 * Get earnings breakdown for a period
 * @param {string} landlordId - Landlord user ID
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<object>} Earnings breakdown
 */
const getEarningsBreakdown = async (landlordId, startDate, endDate) => {
  const Payment = require('../models/Payment');
  const Application = require('../models/Application');
  
  // Get all payments for landlord's properties through applications
  const applications = await Application.find({ landlord: landlordId }).select('_id');
  const applicationIds = applications.map(app => app._id);
  
  const query = {
    application: { $in: applicationIds },
    status: 'completed',
    landlordAccount: await createOrGetAccount(landlordId).then(acc => acc._id)
  };
  
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = startDate;
    if (endDate) query.createdAt.$lte = endDate;
  }
  
  const payments = await Payment.find(query);
  
  const breakdown = {
    totalGrossEarnings: 0,
    totalCommissionPaid: 0,
    totalNetEarnings: 0,
    paymentCount: payments.length,
    payments: payments.map(p => ({
      id: p._id,
      amount: p.amount,
      commissionAmount: p.commission_amount || 0,
      commissionRate: p.commission_rate || 0,
      netAmount: p.landlordNetAmount || (p.amount - (p.commission_amount || 0)),
      date: p.createdAt
    }))
  };
  
  payments.forEach(payment => {
    breakdown.totalGrossEarnings += payment.amount;
    breakdown.totalCommissionPaid += (payment.commission_amount || 0);
    breakdown.totalNetEarnings += (payment.landlordNetAmount || (payment.amount - (payment.commission_amount || 0)));
  });
  
  return breakdown;
};

module.exports = {
  createOrGetAccount,
  updateBalance,
  getAccountBalance,
  canRequestPayout,
  allocatePaymentToPayout,
  getEarningsBreakdown
};

