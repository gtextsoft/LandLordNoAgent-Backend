const PlatformSettings = require('../models/PlatformSettings');
const AuditLog = require('../models/AuditLog');

/**
 * Get the current active commission rate
 */
const getCurrentCommissionRate = async () => {
  const settings = await PlatformSettings.getCurrent();
  return settings.commissionRate;
};

/**
 * Calculate commission amount from gross amount
 * @param {number} grossAmount - The gross amount before commission
 * @param {number} commissionRate - The commission rate (e.g., 0.10 for 10%)
 * @returns {number} The commission amount rounded to 2 decimal places
 */
const calculateCommission = (grossAmount, commissionRate) => {
  if (grossAmount < 0 || commissionRate < 0 || commissionRate > 1) {
    throw new Error('Invalid gross amount or commission rate');
  }
  return Math.round(grossAmount * commissionRate * 100) / 100;
};

/**
 * Calculate net amount after commission and escrow interest
 * @param {number} grossAmount - The gross amount
 * @param {number} commissionRate - The commission rate
 * @param {number} escrowInterest - Escrow interest (default 0)
 * @returns {number} The net amount after deductions
 */
const calculateNetAmount = (grossAmount, commissionRate, escrowInterest = 0) => {
  const commissionAmount = calculateCommission(grossAmount, commissionRate);
  const netAmount = grossAmount - commissionAmount - (escrowInterest || 0);
  return Math.max(0, Math.round(netAmount * 100) / 100); // Ensure non-negative, rounded to 2 decimals
};

/**
 * Update commission rate (admin only)
 * @param {number} newRate - New commission rate (0-1)
 * @param {string} adminId - Admin user ID
 * @param {string} reason - Reason for change (required for audit)
 * @param {string} ipAddress - IP address for audit
 * @param {string} userAgent - User agent for audit
 * @returns {object} Updated rate information
 */
const updateCommissionRate = async (newRate, adminId, reason, ipAddress = '', userAgent = '') => {
  if (!reason || reason.trim().length === 0) {
    throw new Error('Reason is required for commission rate changes');
  }
  
  if (newRate < 0 || newRate > 1) {
    throw new Error('Commission rate must be between 0 and 1');
  }
  
  const updateResult = await PlatformSettings.updateCommissionRate(newRate, adminId, reason);
  
  // Log to audit log
  await AuditLog.logCommissionRateChange(
    adminId,
    updateResult.oldRate,
    updateResult.newRate,
    updateResult.effectiveFrom,
    updateResult.reason,
    ipAddress,
    userAgent
  );
  
  return updateResult;
};

/**
 * Get commission rate change history
 * @param {Date} startDate - Start date for history
 * @param {Date} endDate - End date for history
 * @returns {Array} Array of commission rate changes
 */
const getCommissionHistory = async (startDate, endDate) => {
  const query = {
    action: 'commission_rate_changed',
    createdAt: {}
  };
  
  if (startDate) {
    query.createdAt.$gte = startDate;
  }
  if (endDate) {
    query.createdAt.$lte = endDate;
  }
  
  if (Object.keys(query.createdAt).length === 0) {
    delete query.createdAt;
  }
  
  const logs = await AuditLog.find(query)
    .populate('userId', 'firstName lastName email')
    .sort({ createdAt: -1 });
  
  return logs;
};

/**
 * Get total commission collected in a period
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {number} Total commission collected
 */
const getTotalCommissionCollected = async (startDate, endDate) => {
  const Payment = require('../models/Payment');
  
  const query = {
    status: 'completed',
    commission_amount: { $gt: 0 }
  };
  
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = startDate;
    if (endDate) query.createdAt.$lte = endDate;
  }
  
  const result = await Payment.aggregate([
    { $match: query },
    {
      $group: {
        _id: null,
        totalCommission: { $sum: '$commission_amount' }
      }
    }
  ]);
  
  return result.length > 0 ? result[0].totalCommission : 0;
};

module.exports = {
  getCurrentCommissionRate,
  calculateCommission,
  calculateNetAmount,
  updateCommissionRate,
  getCommissionHistory,
  getTotalCommissionCollected
};

