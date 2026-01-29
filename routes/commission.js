const express = require('express');
const router = express.Router();
const { verifyToken, authorize } = require('../middleware/auth');
const commissionService = require('../services/commissionService');
const PlatformSettings = require('../models/PlatformSettings');
const Payment = require('../models/Payment');
const LandlordAccount = require('../models/LandlordAccount');

// All routes require admin authentication
router.use(verifyToken, authorize('admin'));

// @route   GET /api/admin/commission/rate
// @desc    Get current commission rate
// @access  Private (Admin)
router.get('/rate', async (req, res) => {
  try {
    const settings = await PlatformSettings.getCurrent();
    res.json({
      commissionRate: settings.commissionRate,
      platformFee: settings.platformFee,
      effectiveFrom: settings.effectiveFrom,
      lastUpdatedAt: settings.lastUpdatedAt,
      lastUpdatedBy: settings.lastUpdatedBy
    });
  } catch (error) {
    console.error('Get commission rate error:', error);
    res.status(500).json({ message: 'Server error while fetching commission rate' });
  }
});

// @route   PUT /api/admin/commission/rate
// @desc    Update commission rate (requires reason)
// @access  Private (Admin)
router.put('/rate', async (req, res) => {
  try {
    const { rate, reason } = req.body;
    
    if (rate === undefined || rate === null) {
      return res.status(400).json({ message: 'Commission rate is required' });
    }
    
    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({ message: 'Reason is required for commission rate changes' });
    }
    
    if (rate < 0 || rate > 1) {
      return res.status(400).json({ message: 'Commission rate must be between 0 and 1' });
    }
    
    const updateResult = await commissionService.updateCommissionRate(
      rate,
      req.user._id,
      reason,
      req.ip,
      req.get('user-agent')
    );
    
    res.json({
      message: 'Commission rate updated successfully',
      oldRate: updateResult.oldRate,
      newRate: updateResult.newRate,
      effectiveFrom: updateResult.effectiveFrom,
      reason: updateResult.reason
    });
  } catch (error) {
    console.error('Update commission rate error:', error);
    res.status(500).json({ message: error.message || 'Server error while updating commission rate' });
  }
});

// @route   GET /api/admin/commission/history
// @desc    Get commission rate change history
// @access  Private (Admin)
router.get('/history', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    
    const history = await commissionService.getCommissionHistory(start, end);
    
    res.json({ history });
  } catch (error) {
    console.error('Get commission history error:', error);
    res.status(500).json({ message: 'Server error while fetching commission history' });
  }
});

// @route   GET /api/admin/commission/stats
// @desc    Get commission statistics
// @access  Private (Admin)
router.get('/stats', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    
    // Get total commission collected
    const totalCommission = await commissionService.getTotalCommissionCollected(start, end);
    
    // Get commission by landlord
    const query = {
      status: 'completed',
      commission_amount: { $gt: 0 }
    };
    
    if (start || end) {
      query.createdAt = {};
      if (start) query.createdAt.$gte = start;
      if (end) query.createdAt.$lte = end;
    }
    
    const commissionByLandlord = await Payment.aggregate([
      {
        $match: query
      },
      {
        $lookup: {
          from: 'applications',
          localField: 'application',
          foreignField: '_id',
          as: 'application'
        }
      },
      {
        $unwind: '$application'
      },
      {
        $group: {
          _id: '$application.landlord',
          totalCommission: { $sum: '$commission_amount' },
          totalGross: { $sum: '$amount' },
          paymentCount: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'landlord'
        }
      },
      {
        $unwind: '$landlord'
      },
      {
        $project: {
          landlordId: '$_id',
          landlordName: { $concat: ['$landlord.firstName', ' ', '$landlord.lastName'] },
          landlordEmail: '$landlord.email',
          totalCommission: 1,
          totalGross: 1,
          paymentCount: 1
        }
      },
      {
        $sort: { totalCommission: -1 }
      }
    ]);
    
    // Get monthly breakdown
    const monthlyBreakdown = await Payment.aggregate([
      {
        $match: query
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          totalCommission: { $sum: '$commission_amount' },
          totalGross: { $sum: '$amount' },
          paymentCount: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 }
      }
    ]);
    
    res.json({
      totalCommission,
      commissionByLandlord,
      monthlyBreakdown,
      period: {
        startDate: start,
        endDate: end
      }
    });
  } catch (error) {
    console.error('Get commission stats error:', error);
    res.status(500).json({ message: 'Server error while fetching commission statistics' });
  }
});

// @route   GET /api/admin/commission/report
// @desc    Get detailed commission report (exportable)
// @access  Private (Admin)
router.get('/report', async (req, res) => {
  try {
    const { startDate, endDate, format = 'json' } = req.query;
    
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    
    const query = {
      status: 'completed',
      commission_amount: { $gt: 0 }
    };
    
    if (start || end) {
      query.createdAt = {};
      if (start) query.createdAt.$gte = start;
      if (end) query.createdAt.$lte = end;
    }
    
    const payments = await Payment.find(query)
      .populate({
        path: 'application',
        populate: {
          path: 'landlord',
          select: 'firstName lastName email'
        }
      })
      .populate('user', 'firstName lastName email')
      .sort({ createdAt: -1 });
    
    const report = payments.map(payment => ({
      paymentId: payment._id,
      date: payment.createdAt,
      landlordId: payment.application?.landlord?._id,
      landlordName: payment.application?.landlord ? 
        `${payment.application.landlord.firstName} ${payment.application.landlord.lastName}` : 'N/A',
      landlordEmail: payment.application?.landlord?.email || 'N/A',
      clientId: payment.user?._id,
      clientName: payment.user ? 
        `${payment.user.firstName} ${payment.user.lastName}` : 'N/A',
      grossAmount: payment.amount,
      commissionRate: payment.commission_rate,
      commissionAmount: payment.commission_amount,
      netAmount: payment.landlordNetAmount || (payment.amount - payment.commission_amount),
      currency: payment.currency,
      status: payment.status
    }));
    
    if (format === 'csv') {
      // Helper function to escape CSV values
      const escapeCsvValue = (value) => {
        if (value === null || value === undefined) return '';
        const stringValue = String(value);
        // If value contains comma, quote, or newline, wrap in quotes and escape quotes
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      };
      
      // Convert to CSV format
      const csvHeader = 'Payment ID,Date,Landlord ID,Landlord Name,Landlord Email,Client ID,Client Name,Gross Amount,Commission Rate,Commission Amount,Net Amount,Currency,Status\n';
      const csvRows = report.map(row => 
        [
          escapeCsvValue(row.paymentId),
          escapeCsvValue(row.date ? row.date.toISOString() : ''),
          escapeCsvValue(row.landlordId),
          escapeCsvValue(row.landlordName),
          escapeCsvValue(row.landlordEmail),
          escapeCsvValue(row.clientId),
          escapeCsvValue(row.clientName),
          escapeCsvValue(row.grossAmount),
          escapeCsvValue(row.commissionRate),
          escapeCsvValue(row.commissionAmount),
          escapeCsvValue(row.netAmount),
          escapeCsvValue(row.currency || 'NGN'),
          escapeCsvValue(row.status)
        ].join(',')
      ).join('\n');
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=commission-report-${Date.now()}.csv`);
      return res.send(csvHeader + csvRows);
    }
    
    res.json({
      report,
      summary: {
        totalPayments: report.length,
        totalGross: report.reduce((sum, r) => sum + r.grossAmount, 0),
        totalCommission: report.reduce((sum, r) => sum + r.commissionAmount, 0),
        totalNet: report.reduce((sum, r) => sum + r.netAmount, 0)
      },
      period: {
        startDate: start,
        endDate: end
      }
    });
  } catch (error) {
    console.error('Get commission report error:', error);
    res.status(500).json({ message: 'Server error while generating commission report' });
  }
});

module.exports = router;

