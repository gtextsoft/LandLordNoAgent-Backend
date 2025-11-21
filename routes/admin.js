const express = require('express');
const User = require('../models/User');
const Property = require('../models/Property');
const Application = require('../models/Application');
const Payment = require('../models/Payment');
const MaintenanceRequest = require('../models/MaintenanceRequest');
const ViewingAppointment = require('../models/ViewingAppointment');
const Message = require('../models/Message');
const { verifyToken, authorize } = require('../middleware/auth');

const router = express.Router();

// All admin routes require admin role
router.use(verifyToken, authorize('admin'));

// @route   GET /api/admin/dashboard
// @desc    Get admin dashboard statistics
// @access  Private (Admin)
router.get('/dashboard', async (req, res) => {
  try {
    const [
      totalUsers,
      totalProperties,
      totalApplications,
      totalPayments,
      totalMaintenanceRequests,
      totalAppointments,
      recentUsers,
      recentApplications,
      revenueStats
    ] = await Promise.all([
      User.countDocuments(),
      Property.countDocuments(),
      Application.countDocuments(),
      Payment.countDocuments(),
      MaintenanceRequest.countDocuments(),
      ViewingAppointment.countDocuments(),
      User.find().sort({ createdAt: -1 }).limit(5).select('firstName lastName email role createdAt'),
      Application.find().sort({ applicationDate: -1 }).limit(5).populate('client property', 'firstName lastName title'),
      Payment.aggregate([
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$amount' },
            avgPayment: { $avg: '$amount' },
            completedPayments: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
            }
          }
        }
      ])
    ]);

    // Get counts by role
    const usersByRole = await User.aggregate([
      { $group: { _id: '$role', count: { $sum: 1 } } }
    ]);

    // Get counts by status
    const propertiesByStatus = await Property.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    const applicationsByStatus = await Application.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    res.json({
      stats: {
        totalUsers,
        totalProperties,
        totalApplications,
        totalPayments,
        totalMaintenanceRequests,
        totalAppointments,
        usersByRole,
        propertiesByStatus,
        applicationsByStatus,
        revenue: revenueStats[0] || { totalRevenue: 0, avgPayment: 0, completedPayments: 0 }
      },
      recent: {
        users: recentUsers,
        applications: recentApplications
      }
    });

  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({ message: 'Server error while fetching dashboard data' });
  }
});

// @route   GET /api/admin/users
// @desc    Get all users with filters
// @access  Private (Admin)
router.get('/users', async (req, res) => {
  try {
    const { 
      role, 
      status, 
      search, 
      page = 1, 
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const filters = {};
    if (role) filters.role = role;
    if (status === 'active') filters.isActive = true;
    if (status === 'inactive') filters.isActive = false;

    if (search) {
      filters.$or = [
        { firstName: new RegExp(search, 'i') },
        { lastName: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') }
      ];
    }

    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const users = await User.find(filters)
      .select('-password')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await User.countDocuments(filters);

    res.json({
      users,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total,
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Get admin users error:', error);
    res.status(500).json({ message: 'Server error while fetching users' });
  }
});

// @route   PUT /api/admin/users/:id/status
// @desc    Update user status
// @access  Private (Admin)
router.put('/users/:id/status', async (req, res) => {
  try {
    const { isActive } = req.body;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
      user
    });

  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({ message: 'Server error while updating user status' });
  }
});

// @route   GET /api/admin/properties
// @desc    Get all properties with filters
// @access  Private (Admin)
router.get('/properties', async (req, res) => {
  try {
    const { 
      status, 
      isVerified, 
      landlord, 
      search, 
      page = 1, 
      limit = 20 
    } = req.query;

    const filters = {};
    if (status) filters.status = status;
    if (isVerified !== undefined) filters.isVerified = isVerified === 'true';
    if (landlord) filters.landlord = landlord;

    if (search) {
      filters.$or = [
        { title: new RegExp(search, 'i') },
        { 'address.city': new RegExp(search, 'i') },
        { 'address.state': new RegExp(search, 'i') }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const properties = await Property.find(filters)
      .populate('landlord', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Property.countDocuments(filters);

    res.json({
      properties,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total,
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Get admin properties error:', error);
    res.status(500).json({ message: 'Server error while fetching properties' });
  }
});

// @route   PUT /api/admin/properties/:id/verify
// @desc    Verify/unverify property
// @access  Private (Admin)
router.put('/properties/:id/verify', verifyToken, authorize('admin'), async (req, res) => {
  try {
    const { isVerified } = req.body;

    const property = await Property.findByIdAndUpdate(
      req.params.id,
      { 
        isVerified,
        verifiedAt: isVerified ? new Date() : null,
        verifiedBy: isVerified ? req.user._id : null
      },
      { new: true }
    ).populate('landlord', 'firstName lastName email');

    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }

    res.json({
      message: `Property ${isVerified ? 'verified' : 'unverified'} successfully`,
      property
    });

  } catch (error) {
    console.error('Update property verification error:', error);
    res.status(500).json({ message: 'Server error while updating property verification' });
  }
});

// @route   PUT /api/admin/properties/:id/availability
// @desc    Update property availability
// @access  Private (Admin)
router.put('/properties/:id/availability', async (req, res) => {
  try {
    const { isAvailable } = req.body;

    const property = await Property.findByIdAndUpdate(
      req.params.id,
      { isAvailable },
      { new: true }
    ).populate('landlord', 'firstName lastName email');

    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }

    res.json({
      message: `Property marked as ${isAvailable ? 'available' : 'unavailable'} successfully`,
      property
    });

  } catch (error) {
    console.error('Update property availability error:', error);
    res.status(500).json({ message: 'Server error while updating property availability' });
  }
});

// @route   GET /api/admin/applications
// @desc    Get all applications with filters
// @access  Private (Admin)
router.get('/applications', async (req, res) => {
  try {
    const { 
      status, 
      property, 
      client, 
      landlord, 
      page = 1, 
      limit = 20 
    } = req.query;

    const filters = {};
    if (status) filters.status = status;
    if (property) filters.property = property;
    if (client) filters.client = client;
    if (landlord) filters.landlord = landlord;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const applications = await Application.find(filters)
      .populate('property', 'title address price')
      .populate('client', 'firstName lastName email')
      .populate('landlord', 'firstName lastName email')
      .sort({ applicationDate: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Application.countDocuments(filters);

    res.json({
      applications,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total,
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Get admin applications error:', error);
    res.status(500).json({ message: 'Server error while fetching applications' });
  }
});

// @route   GET /api/admin/payments
// @desc    Get all payments with filters
// @access  Private (Admin)
router.get('/payments', async (req, res) => {
  try {
    const { 
      status, 
      type, 
      startDate, 
      endDate, 
      page = 1, 
      limit = 20 
    } = req.query;

    const filters = {};
    if (status) filters.status = status;
    if (type) filters.type = type;

    if (startDate || endDate) {
      filters.createdAt = {};
      if (startDate) filters.createdAt.$gte = new Date(startDate);
      if (endDate) filters.createdAt.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

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
    console.error('Get admin payments error:', error);
    res.status(500).json({ message: 'Server error while fetching payments' });
  }
});

// @route   GET /api/admin/analytics/revenue
// @desc    Get revenue analytics
// @access  Private (Admin)
router.get('/analytics/revenue', async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    
    let groupBy = {};
    let startDate = new Date();
    
    switch (period) {
      case 'day':
        groupBy = {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' }
        };
        startDate.setDate(startDate.getDate() - 30);
        break;
      case 'week':
        groupBy = {
          year: { $year: '$createdAt' },
          week: { $week: '$createdAt' }
        };
        startDate.setDate(startDate.getDate() - 90);
        break;
      case 'year':
        groupBy = {
          year: { $year: '$createdAt' }
        };
        startDate.setFullYear(startDate.getFullYear() - 2);
        break;
      default: // month
        groupBy = {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' }
        };
        startDate.setMonth(startDate.getMonth() - 12);
    }

    const revenueData = await Payment.aggregate([
      {
        $match: {
          status: 'completed',
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: groupBy,
          totalRevenue: { $sum: '$amount' },
          paymentCount: { $sum: 1 },
          avgPayment: { $avg: '$amount' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ]);

    res.json({ revenueData });

  } catch (error) {
    console.error('Get revenue analytics error:', error);
    res.status(500).json({ message: 'Server error while fetching revenue analytics' });
  }
});

// @route   GET /api/admin/reports/platform
// @desc    Generate platform report
// @access  Private (Admin)
router.get('/reports/platform', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const match = {};
    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) match.createdAt.$gte = new Date(startDate);
      if (endDate) match.createdAt.$lte = new Date(endDate);
    }

    const [
      userStats,
      propertyStats,
      applicationStats,
      paymentStats,
      maintenanceStats,
      appointmentStats
    ] = await Promise.all([
      User.aggregate([
        { $match: match },
        { $group: { _id: '$role', count: { $sum: 1 } } }
      ]),
      Property.aggregate([
        { $match: match },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      Application.aggregate([
        { $match: match },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      Payment.aggregate([
        { $match: { ...match, status: 'completed' } },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$amount' },
            paymentCount: { $sum: 1 }
          }
        }
      ]),
      MaintenanceRequest.aggregate([
        { $match: match },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      ViewingAppointment.aggregate([
        { $match: match },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ])
    ]);

    res.json({
      report: {
        userStats,
        propertyStats,
        applicationStats,
        paymentStats: paymentStats[0] || { totalRevenue: 0, paymentCount: 0 },
        maintenanceStats,
        appointmentStats
      },
      period: {
        startDate,
        endDate,
        generatedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Generate platform report error:', error);
    res.status(500).json({ message: 'Server error while generating platform report' });
  }
});

// @route   DELETE /api/admin/users/:id
// @desc    Delete a user and all related data
// @access  Private (Admin)
router.delete('/users/:id', async (req, res) => {
  try {
    const userId = req.params.id;

    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent deleting admin users (optional safety check)
    if (user.role === 'admin') {
      return res.status(403).json({ message: 'Cannot delete admin users' });
    }

    // Delete all related data
    await Property.deleteMany({ landlord_id: userId });
    await Application.deleteMany({ 
      $or: [
        { client_id: userId },
        { landlord_id: userId }
      ]
    });
    await Payment.deleteMany({ 
      $or: [
        { client_id: userId },
        { landlord_id: userId }
      ]
    });
    await MaintenanceRequest.deleteMany({ 
      $or: [
        { client_id: userId },
        { landlord_id: userId }
      ]
    });
    await ViewingAppointment.deleteMany({ 
      $or: [
        { client_id: userId },
        { landlord_id: userId }
      ]
    });
    await Message.deleteMany({ 
      $or: [
        { sender_id: userId },
        { receiver_id: userId }
      ]
    });

    // Delete the user
    await User.findByIdAndDelete(userId);

    res.json({
      message: 'User and all related data deleted successfully'
    });

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Server error while deleting user' });
  }
});

module.exports = router;
