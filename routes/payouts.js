const express = require('express');
const router = express.Router();
const { verifyToken, authorize } = require('../middleware/auth');
const payoutService = require('../services/payoutService');
const PayoutRequest = require('../models/PayoutRequest');

// @route   POST /api/payouts/request
// @desc    Create payout request (landlord only)
// @access  Private (Landlord)
router.post('/request', verifyToken, authorize('landlord'), async (req, res) => {
  try {
    const { amount, paymentMethod, bankDetails, stripeAccountId } = req.body;
    
    if (!amount || !paymentMethod) {
      return res.status(400).json({ message: 'Amount and payment method are required' });
    }
    
    if (paymentMethod === 'bank_transfer' && !bankDetails) {
      return res.status(400).json({ message: 'Bank details are required for bank transfer' });
    }
    
    if (paymentMethod === 'stripe_connect' && !stripeAccountId) {
      return res.status(400).json({ message: 'Stripe account ID is required for Stripe Connect' });
    }
    
    const payoutRequest = await payoutService.createPayoutRequest(
      req.user._id,
      amount,
      paymentMethod,
      bankDetails,
      stripeAccountId
    );
    
    const populatedRequest = await PayoutRequest.findById(payoutRequest._id)
      .populate('landlord', 'firstName lastName email')
      .populate('landlordAccount')
      .populate('relatedPayments');
    
    res.status(201).json({
      message: 'Payout request created successfully',
      payoutRequest: populatedRequest
    });
  } catch (error) {
    console.error('Create payout request error:', error);
    res.status(400).json({ message: error.message || 'Server error while creating payout request' });
  }
});

// @route   GET /api/payouts/requests
// @desc    Get landlord's payout requests
// @access  Private (Landlord)
router.get('/requests', verifyToken, authorize('landlord'), async (req, res) => {
  try {
    const { status } = req.query;
    
    const query = { landlord: req.user._id };
    if (status) {
      query.status = status;
    }
    
    const payoutRequests = await PayoutRequest.find(query)
      .populate('landlordAccount')
      .populate('relatedPayments')
      .populate('reviewedBy', 'firstName lastName')
      .sort({ requestedAt: -1 });
    
    res.json({ payoutRequests });
  } catch (error) {
    console.error('Get payout requests error:', error);
    res.status(500).json({ message: 'Server error while fetching payout requests' });
  }
});

// @route   GET /api/payouts/requests/:id
// @desc    Get specific payout details
// @access  Private (Landlord or Admin)
router.get('/requests/:id', verifyToken, async (req, res) => {
  try {
    const payoutRequest = await PayoutRequest.findById(req.params.id)
      .populate('landlord', 'firstName lastName email')
      .populate('landlordAccount')
      .populate('relatedPayments')
      .populate('reviewedBy', 'firstName lastName');
    
    if (!payoutRequest) {
      return res.status(404).json({ message: 'Payout request not found' });
    }
    
    // Check authorization
    if (req.user.role !== 'admin' && payoutRequest.landlord._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to view this payout request' });
    }
    
    res.json({ payoutRequest });
  } catch (error) {
    console.error('Get payout request error:', error);
    res.status(500).json({ message: 'Server error while fetching payout request' });
  }
});

// @route   POST /api/payouts/requests/:id/cancel
// @desc    Cancel pending payout request
// @access  Private (Landlord)
router.post('/requests/:id/cancel', verifyToken, authorize('landlord'), async (req, res) => {
  try {
    const payoutRequest = await PayoutRequest.findById(req.params.id);
    
    if (!payoutRequest) {
      return res.status(404).json({ message: 'Payout request not found' });
    }
    
    if (payoutRequest.landlord.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to cancel this payout request' });
    }
    
    if (payoutRequest.status !== 'pending') {
      return res.status(400).json({ message: 'Only pending payout requests can be cancelled' });
    }
    
    // Deallocate payments
    const Payment = require('../models/Payment');
    await Payment.updateMany(
      { payoutRequest: payoutRequest._id },
      {
        $set: {
          allocatedToPayout: false,
          payoutRequest: null,
          payoutAllocatedAt: null
        }
      }
    );
    
    // Delete or mark as cancelled
    payoutRequest.status = 'rejected';
    payoutRequest.rejectionReason = 'Cancelled by landlord';
    await payoutRequest.save();
    
    res.json({ message: 'Payout request cancelled successfully' });
  } catch (error) {
    console.error('Cancel payout request error:', error);
    res.status(500).json({ message: 'Server error while cancelling payout request' });
  }
});

// Admin routes
router.use('/admin', verifyToken, authorize('admin'));

// @route   GET /api/payouts/admin/pending
// @desc    Get all pending payouts (admin)
// @access  Private (Admin)
router.get('/admin/pending', async (req, res) => {
  try {
    const pendingPayouts = await payoutService.getPendingPayouts();
    res.json({ payoutRequests: pendingPayouts });
  } catch (error) {
    console.error('Get pending payouts error:', error);
    res.status(500).json({ message: 'Server error while fetching pending payouts' });
  }
});

// @route   PUT /api/payouts/admin/:id/approve
// @desc    Approve payout request (admin)
// @access  Private (Admin)
router.put('/admin/:id/approve', async (req, res) => {
  try {
    const { notes } = req.body;
    
    const payoutRequest = await payoutService.updatePayoutStatus(
      req.params.id,
      'approved',
      req.user._id,
      notes || ''
    );
    
    const populatedRequest = await PayoutRequest.findById(payoutRequest._id)
      .populate('landlord', 'firstName lastName email')
      .populate('landlordAccount')
      .populate('relatedPayments');
    
    res.json({
      message: 'Payout request approved successfully',
      payoutRequest: populatedRequest
    });
  } catch (error) {
    console.error('Approve payout error:', error);
    res.status(400).json({ message: error.message || 'Server error while approving payout' });
  }
});

// @route   PUT /api/payouts/admin/:id/reject
// @desc    Reject payout request (admin)
// @access  Private (Admin)
router.put('/admin/:id/reject', async (req, res) => {
  try {
    const { reason, notes } = req.body;
    
    if (!reason) {
      return res.status(400).json({ message: 'Reason is required for rejection' });
    }
    
    const payoutRequest = await payoutService.updatePayoutStatus(
      req.params.id,
      'rejected',
      req.user._id,
      notes || '',
      reason
    );
    
    res.json({
      message: 'Payout request rejected successfully',
      payoutRequest
    });
  } catch (error) {
    console.error('Reject payout error:', error);
    res.status(400).json({ message: error.message || 'Server error while rejecting payout' });
  }
});

// @route   PUT /api/payouts/admin/:id/process
// @desc    Process approved payout (admin)
// @access  Private (Admin)
router.put('/admin/:id/process', async (req, res) => {
  try {
    const { transferId } = req.body;
    const payoutRequest = await PayoutRequest.findById(req.params.id);
    
    if (!payoutRequest) {
      return res.status(404).json({ message: 'Payout request not found' });
    }
    
    let result;
    
    if (payoutRequest.paymentMethod === 'stripe_connect') {
      result = await payoutService.processStripePayout(req.params.id);
    } else if (payoutRequest.paymentMethod === 'bank_transfer') {
      result = await payoutService.processBankTransfer(req.params.id, transferId);
    } else {
      return res.status(400).json({ message: 'Invalid payment method' });
    }
    
    const populatedRequest = await PayoutRequest.findById(result.payoutRequest._id)
      .populate('landlord', 'firstName lastName email')
      .populate('landlordAccount')
      .populate('relatedPayments');
    
    res.json({
      message: result.message || 'Payout processed successfully',
      payoutRequest: populatedRequest,
      transferId: result.transferId
    });
  } catch (error) {
    console.error('Process payout error:', error);
    res.status(400).json({ message: error.message || 'Server error while processing payout' });
  }
});

// @route   GET /api/payouts/admin/history
// @desc    Get payout history with filters (admin)
// @access  Private (Admin)
router.get('/admin/history', async (req, res) => {
  try {
    const { status, landlordId, startDate, endDate, limit = 50, page = 1 } = req.query;
    
    const query = {};
    if (status) query.status = status;
    if (landlordId) query.landlord = landlordId;
    
    if (startDate || endDate) {
      query.requestedAt = {};
      if (startDate) query.requestedAt.$gte = new Date(startDate);
      if (endDate) query.requestedAt.$lte = new Date(endDate);
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const payoutRequests = await PayoutRequest.find(query)
      .populate('landlord', 'firstName lastName email')
      .populate('landlordAccount')
      .populate('reviewedBy', 'firstName lastName')
      .sort({ requestedAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);
    
    const total = await PayoutRequest.countDocuments(query);
    
    res.json({
      payoutRequests,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get payout history error:', error);
    res.status(500).json({ message: 'Server error while fetching payout history' });
  }
});

module.exports = router;

