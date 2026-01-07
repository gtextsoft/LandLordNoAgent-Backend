const express = require('express');
const router = express.Router();
const { verifyToken, authorize } = require('../middleware/auth');
const landlordAccountService = require('../services/landlordAccountService');
const Payment = require('../models/Payment');
const Application = require('../models/Application');

// All routes require authentication
router.use(verifyToken);

// @route   GET /api/landlord-accounts/balance
// @desc    Get current balance with commission breakdown (landlord only)
// @access  Private (Landlord)
router.get('/balance', authorize('landlord'), async (req, res) => {
  try {
    const balance = await landlordAccountService.getAccountBalance(req.user._id);
    res.json(balance);
  } catch (error) {
    console.error('Get balance error:', error);
    res.status(500).json({ message: 'Server error while fetching balance' });
  }
});

// @route   GET /api/landlord-accounts/earnings
// @desc    Get earnings history with filters (includes commission breakdown per payment)
// @access  Private (Landlord)
router.get('/earnings', authorize('landlord'), async (req, res) => {
  try {
    const { startDate, endDate, limit = 50, page = 1 } = req.query;
    
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    
    // Get breakdown
    const breakdown = await landlordAccountService.getEarningsBreakdown(
      req.user._id,
      start,
      end
    );
    
    // Get paginated payments
    const applications = await Application.find({ landlord: req.user._id }).select('_id');
    const applicationIds = applications.map(app => app._id);
    
    const account = await landlordAccountService.createOrGetAccount(req.user._id);
    
    const query = {
      application: { $in: applicationIds },
      status: 'completed',
      landlordAccount: account._id
    };
    
    if (start || end) {
      query.createdAt = {};
      if (start) query.createdAt.$gte = start;
      if (end) query.createdAt.$lte = end;
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const payments = await Payment.find(query)
      .populate('application', 'property')
      .populate({
        path: 'application',
        populate: {
          path: 'property',
          select: 'title address'
        }
      })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);
    
    const total = await Payment.countDocuments(query);
    
    const earnings = payments.map(payment => ({
      id: payment._id,
      date: payment.createdAt,
      property: payment.application?.property?.title || 'N/A',
      propertyAddress: payment.application?.property?.address?.street || 'N/A',
      grossAmount: payment.amount,
      commissionRate: payment.commission_rate || 0,
      commissionAmount: payment.commission_amount || 0,
      netAmount: payment.landlordNetAmount || (payment.amount - (payment.commission_amount || 0)),
      currency: payment.currency,
      status: payment.status,
      type: payment.type
    }));
    
    res.json({
      breakdown: {
        totalGrossEarnings: breakdown.totalGrossEarnings,
        totalCommissionPaid: breakdown.totalCommissionPaid,
        totalNetEarnings: breakdown.totalNetEarnings,
        paymentCount: breakdown.paymentCount
      },
      earnings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get earnings error:', error);
    res.status(500).json({ message: 'Server error while fetching earnings' });
  }
});

// @route   GET /api/landlord-accounts/statement
// @desc    Get account statement (transactions with gross, commission, net amounts)
// @access  Private (Landlord)
router.get('/statement', authorize('landlord'), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    
    const breakdown = await landlordAccountService.getEarningsBreakdown(
      req.user._id,
      start,
      end
    );
    
    res.json({
      period: {
        startDate: start,
        endDate: end
      },
      summary: {
        totalGrossEarnings: breakdown.totalGrossEarnings,
        totalCommissionPaid: breakdown.totalCommissionPaid,
        totalNetEarnings: breakdown.totalNetEarnings,
        paymentCount: breakdown.paymentCount
      },
      transactions: breakdown.payments
    });
  } catch (error) {
    console.error('Get statement error:', error);
    res.status(500).json({ message: 'Server error while fetching statement' });
  }
});

module.exports = router;

