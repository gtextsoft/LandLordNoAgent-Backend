const express = require('express');
const User = require('../models/User');
const Property = require('../models/Property');
const Application = require('../models/Application');
const Payment = require('../models/Payment');
const MaintenanceRequest = require('../models/MaintenanceRequest');
const ViewingAppointment = require('../models/ViewingAppointment');
const Message = require('../models/Message');
const ModerationViolation = require('../models/ModerationViolation');
const Report = require('../models/Report');
const Dispute = require('../models/Dispute');
const Notification = require('../models/Notification');
const PlatformSettings = require('../models/PlatformSettings');
const AuditLog = require('../models/AuditLog');
const { verifyToken, authorize } = require('../middleware/auth');
const { notifyPropertyVerification } = require('../utils/notifications');

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

// @route   GET /api/admin/platform-settings
// @desc    Get current platform settings (singleton)
// @access  Private (Admin)
router.get('/platform-settings', async (req, res) => {
  try {
    const settings = await PlatformSettings.getCurrent();
    res.json({ settings });
  } catch (error) {
    console.error('Get platform settings error:', error);
    res.status(500).json({ message: 'Server error while fetching platform settings' });
  }
});

// @route   PUT /api/admin/platform-settings
// @desc    Update platform settings (excluding commission rate, which has its own audited endpoint)
// @access  Private (Admin)
router.put('/platform-settings', async (req, res) => {
  try {
    const settings = await PlatformSettings.getCurrent();

    const allowedFields = [
      'platformFee',
      'maxPropertiesPerLandlord',
      'maxApplicationsPerClient',
      'autoApproveProperties',
      'requireKyc',
      'emailNotifications',
      'maintenanceMode'
    ];

    const before = {};
    const changes = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        before[field] = settings[field];
        settings[field] = req.body[field];
        changes[field] = { from: before[field], to: settings[field] };
      }
    }

    settings.lastUpdatedBy = req.user._id;
    settings.lastUpdatedAt = new Date();

    await settings.save();

    // Audit log (best-effort)
    try {
      await AuditLog.create({
        action: 'platform_settings_updated',
        entityType: 'PlatformSettings',
        entityId: settings._id,
        userId: req.user._id,
        details: { changes },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
    } catch (auditError) {
      console.error('AuditLog platform_settings_updated error:', auditError);
    }

    res.json({
      message: 'Platform settings updated successfully',
      settings
    });
  } catch (error) {
    console.error('Update platform settings error:', error);
    res.status(500).json({ message: 'Server error while updating platform settings' });
  }
});

// ---------------------------------------------------------------------------
// Bulk operations + audit logs + admin notification center
// ---------------------------------------------------------------------------

async function deleteUserCascade(userId) {
  const user = await User.findById(userId);
  if (!user) return { ok: false, code: 404, message: 'User not found' };
  if (user.role === 'admin') return { ok: false, code: 403, message: 'Cannot delete admin users' };

  // Delete all related data using correct schema fields
  await Property.deleteMany({ landlord: userId });

  const applications = await Application.find({
    $or: [{ client: userId }, { landlord: userId }]
  }).select('_id');
  const applicationIds = applications.map(a => a._id);

  if (applicationIds.length) {
    await Payment.deleteMany({ application: { $in: applicationIds } });
    await Message.deleteMany({ application: { $in: applicationIds } });
  }

  await Application.deleteMany({ _id: { $in: applicationIds } });
  await MaintenanceRequest.deleteMany({ $or: [{ tenant: userId }, { landlord: userId }] });
  await ViewingAppointment.deleteMany({ $or: [{ client: userId }, { landlord: userId }] });

  // Notifications for the user
  await Notification.deleteMany({ user: userId });

  await User.findByIdAndDelete(userId);
  return { ok: true };
}

async function deletePropertyCascade(propertyId) {
  const property = await Property.findById(propertyId);
  if (!property) return { ok: false, code: 404, message: 'Property not found' };

  const applications = await Application.find({ property: propertyId }).select('_id');
  const applicationIds = applications.map(a => a._id);

  if (applicationIds.length) {
    await Payment.deleteMany({ application: { $in: applicationIds } });
    await Message.deleteMany({ application: { $in: applicationIds } });
  }

  await Application.deleteMany({ _id: { $in: applicationIds } });
  await MaintenanceRequest.deleteMany({ property: propertyId });
  await ViewingAppointment.deleteMany({ property: propertyId });

  await Property.findByIdAndDelete(propertyId);
  return { ok: true };
}

/**
 * @route   GET /api/admin/audit-logs
 * @desc    List audit logs with basic filtering (resource type, search, date ranges)
 * @access  Private (Admin)
 */
router.get('/audit-logs', async (req, res) => {
  try {
    const { resource_type, search, dateRange = 'all', page = 1, limit = 100 } = req.query;
    const filters = {};

    if (resource_type && resource_type !== 'all') {
      // stored as entityType (e.g. User/Property/Payment/System)
      const mapping = {
        user: 'User',
        property: 'Property',
        application: 'Application',
        payment: 'Payment',
        system: 'System'
      };
      filters.entityType = mapping[resource_type] || resource_type;
    }

    // Date range filter
    if (dateRange && dateRange !== 'all') {
      const now = new Date();
      let start = null;
      if (dateRange === 'today') {
        start = new Date(now);
        start.setHours(0, 0, 0, 0);
      } else if (dateRange === 'week') {
        start = new Date(now);
        start.setDate(now.getDate() - 7);
      } else if (dateRange === 'month') {
        start = new Date(now);
        start.setDate(now.getDate() - 30);
      }
      if (start) filters.createdAt = { $gte: start };
    }

    // Search (best-effort): action or details JSON string
    if (search) {
      const rx = new RegExp(search, 'i');
      filters.$or = [{ action: rx }];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [rows, total] = await Promise.all([
      AuditLog.find(filters)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('userId', 'email firstName lastName role'),
      AuditLog.countDocuments(filters)
    ]);

    const logs = rows.map(l => ({
      id: l._id,
      user_id: l.userId?._id || l.userId,
      action: l.action,
      resource_type: (l.entityType || 'System').toString().toLowerCase(),
      resource_id: l.entityId ? l.entityId.toString() : undefined,
      details: typeof l.details === 'string' ? l.details : JSON.stringify(l.details || {}),
      ip_address: l.ipAddress,
      user_agent: l.userAgent,
      created_at: l.createdAt,
      user: l.userId
        ? {
            id: l.userId._id,
            email: l.userId.email,
            role: l.userId.role,
            firstName: l.userId.firstName,
            lastName: l.userId.lastName,
            is_verified: l.userId.isVerified
          }
        : undefined
    }));

    res.json({
      logs,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ message: 'Server error while fetching audit logs' });
  }
});

/**
 * @route   POST /api/admin/bulk/users
 * @desc    Bulk operations on users (verify/unverify/suspend/activate/delete)
 * @access  Private (Admin)
 */
router.post('/bulk/users', async (req, res) => {
  try {
    const { userIds, action } = req.body || {};

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ message: 'userIds[] is required' });
    }
    if (!['verify', 'unverify', 'suspend', 'activate', 'delete'].includes(action)) {
      return res.status(400).json({ message: 'Invalid bulk user action' });
    }

    if (action === 'delete') {
      const results = { deleted: 0, failed: 0, failures: [] };
      for (const id of userIds) {
        const r = await deleteUserCascade(id);
        if (r.ok) results.deleted += 1;
        else {
          results.failed += 1;
          results.failures.push({ id, message: r.message });
        }
      }

      await AuditLog.create({
        action: 'admin_bulk_users_deleted',
        entityType: 'User',
        userId: req.user._id,
        details: results,
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }).catch(() => undefined);

      return res.json({ message: 'Bulk user delete completed', results });
    }

    const update = {};
    if (action === 'verify') update.isVerified = true;
    if (action === 'unverify') update.isVerified = false;
    if (action === 'suspend') update.isActive = false;
    if (action === 'activate') update.isActive = true;

    const result = await User.updateMany({ _id: { $in: userIds } }, { $set: update });

    await AuditLog.create({
      action: `admin_bulk_users_${action}`,
      entityType: 'User',
      userId: req.user._id,
      details: { userIds, update, matched: result.matchedCount, modified: result.modifiedCount },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    }).catch(() => undefined);

    res.json({
      message: `Bulk user ${action} completed`,
      matched: result.matchedCount,
      modified: result.modifiedCount
    });
  } catch (error) {
    console.error('Bulk users error:', error);
    res.status(500).json({ message: 'Server error while running bulk user operation' });
  }
});

/**
 * @route   POST /api/admin/bulk/properties
 * @desc    Bulk operations on properties (verify/unverify/feature/unfeature/delete)
 * @access  Private (Admin)
 */
router.post('/bulk/properties', async (req, res) => {
  try {
    const { propertyIds, action } = req.body || {};

    if (!Array.isArray(propertyIds) || propertyIds.length === 0) {
      return res.status(400).json({ message: 'propertyIds[] is required' });
    }
    if (!['verify', 'unverify', 'feature', 'unfeature', 'delete'].includes(action)) {
      return res.status(400).json({ message: 'Invalid bulk property action' });
    }

    if (action === 'delete') {
      const results = { deleted: 0, failed: 0, failures: [] };
      for (const id of propertyIds) {
        const r = await deletePropertyCascade(id);
        if (r.ok) results.deleted += 1;
        else {
          results.failed += 1;
          results.failures.push({ id, message: r.message });
        }
      }

      await AuditLog.create({
        action: 'admin_bulk_properties_deleted',
        entityType: 'Property',
        userId: req.user._id,
        details: results,
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }).catch(() => undefined);

      return res.json({ message: 'Bulk property delete completed', results });
    }

    const update = {};
    if (action === 'verify') {
      update.isVerified = true;
      update.verifiedAt = new Date();
      update.verifiedBy = req.user._id;
    }
    if (action === 'unverify') {
      update.isVerified = false;
      update.verifiedAt = null;
      update.verifiedBy = null;
    }
    if (action === 'feature') update.featured = true;
    if (action === 'unfeature') update.featured = false;

    const result = await Property.updateMany({ _id: { $in: propertyIds } }, { $set: update });

    await AuditLog.create({
      action: `admin_bulk_properties_${action}`,
      entityType: 'Property',
      userId: req.user._id,
      details: { propertyIds, update, matched: result.matchedCount, modified: result.modifiedCount },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    }).catch(() => undefined);

    res.json({
      message: `Bulk property ${action} completed`,
      matched: result.matchedCount,
      modified: result.modifiedCount
    });
  } catch (error) {
    console.error('Bulk properties error:', error);
    res.status(500).json({ message: 'Server error while running bulk property operation' });
  }
});

/**
 * @route   DELETE /api/admin/properties/:id
 * @desc    Delete a property and related data
 * @access  Private (Admin)
 */
router.delete('/properties/:id', async (req, res) => {
  try {
    const r = await deletePropertyCascade(req.params.id);
    if (!r.ok) return res.status(r.code).json({ message: r.message });

    await AuditLog.create({
      action: 'admin_property_deleted',
      entityType: 'Property',
      entityId: req.params.id,
      userId: req.user._id,
      details: { propertyId: req.params.id },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    }).catch(() => undefined);

    res.json({ message: 'Property deleted successfully' });
  } catch (error) {
    console.error('Delete property error:', error);
    res.status(500).json({ message: 'Server error while deleting property' });
  }
});

/**
 * @route   GET /api/admin/notifications
 * @desc    Get admin notifications for current admin user
 * @access  Private (Admin)
 */
router.get('/notifications', async (req, res) => {
  try {
    const { status = 'all', priority = 'all', page = 1, limit = 50 } = req.query;

    const query = { user: req.user._id };
    if (status === 'archived') query.isActive = false;
    else query.isActive = true;

    if (status === 'unread') query.isRead = false;
    if (status === 'read') query.isRead = true;

    if (priority !== 'all') query.priority = priority;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [rows, total] = await Promise.all([
      Notification.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      Notification.countDocuments(query)
    ]);

    const typeMap = (t) => {
      if (!t) return 'custom';
      if (t.startsWith('payment')) return 'payment';
      if (t.startsWith('kyc')) return 'user_verification';
      if (t.startsWith('property')) return 'property_review';
      if (t === 'system_announcement') return 'system';
      return 'custom';
    };

    const notifications = rows.map(n => ({
      id: n._id,
      admin_id: n.user,
      type: typeMap(n.type),
      title: n.title,
      message: n.message,
      priority: n.priority || 'medium',
      status: n.isActive ? (n.isRead ? 'read' : 'unread') : 'archived',
      action_required: !!(n.metadata && n.metadata.actionRequired),
      action_url: n.actionUrl,
      created_at: n.createdAt,
      read_at: n.readAt
    }));

    res.json({
      notifications,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get admin notifications error:', error);
    res.status(500).json({ message: 'Server error while fetching admin notifications' });
  }
});

const NOTIFICATION_TYPES = ['application_received', 'application_approved', 'application_rejected', 'payment_received', 'payment_failed', 'maintenance_request', 'maintenance_completed', 'viewing_scheduled', 'viewing_cancelled', 'message_received', 'property_verified', 'kyc_approved', 'kyc_rejected', 'system_announcement', 'other'];
const NOTIFICATION_PRIORITIES = ['low', 'medium', 'high', 'urgent'];

/**
 * @route   POST /api/admin/notifications
 * @desc    Create a notification for admins and/or all users (in-app notifications)
 * @access  Private (Admin)
 */
router.post('/notifications', async (req, res) => {
  try {
    const { type = 'other', title, message, priority = 'medium', action_required = false, action_url, broadcast = true, target = 'admins' } = req.body || {};

    if (!title || !message) {
      return res.status(400).json({ message: 'title and message are required' });
    }

    const resolvedType = type === 'custom' ? 'other' : type;
    if (!NOTIFICATION_TYPES.includes(resolvedType)) {
      return res.status(400).json({ message: `Invalid type. Allowed: ${NOTIFICATION_TYPES.join(', ')}` });
    }
    if (!NOTIFICATION_PRIORITIES.includes(priority)) {
      return res.status(400).json({ message: `Invalid priority. Allowed: ${NOTIFICATION_PRIORITIES.join(', ')}` });
    }

    let recipientIds = [];
    if (target === 'all_users') {
      const users = await User.find({}).select('_id');
      recipientIds = users.map(u => u._id);
    } else {
      recipientIds = broadcast
        ? (await User.find({ role: 'admin' }).select('_id')).map(u => u._id)
        : [req.user._id];
    }

    if (recipientIds.length === 0) {
      return res.status(201).json({ message: 'Notification created', count: 0 });
    }

    const payload = {
      type: resolvedType,
      title: String(title).trim(),
      message: String(message).trim(),
      priority,
      actionUrl: action_url ? String(action_url).trim() : undefined,
      metadata: { actionRequired: !!action_required, createdBy: req.user._id.toString() }
    };

    const created = await Notification.insertMany(
      recipientIds.map(userId => ({ user: userId, ...payload }))
    );

    await AuditLog.create({
      action: 'admin_notification_created',
      entityType: 'Notification',
      userId: req.user._id,
      details: { count: created.length, title, priority, broadcast, target },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    }).catch(() => undefined);

    res.status(201).json({ message: 'Notification created', count: created.length });
  } catch (error) {
    console.error('Create admin notification error:', error);
    res.status(500).json({ message: 'Server error while creating admin notification' });
  }
});

/**
 * @route   PATCH /api/admin/notifications/:id/read
 * @desc    Mark a single admin notification as read
 * @access  Private (Admin)
 */
router.patch('/notifications/:id/read', async (req, res) => {
  try {
    const notification = await Notification.findOne({ _id: req.params.id, user: req.user._id });
    if (!notification) return res.status(404).json({ message: 'Notification not found' });

    await notification.markAsRead();
    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    console.error('Mark admin notification read error:', error);
    res.status(500).json({ message: 'Server error while updating notification' });
  }
});

/**
 * @route   PATCH /api/admin/notifications/read-all
 * @desc    Mark all admin notifications as read
 * @access  Private (Admin)
 */
router.patch('/notifications/read-all', async (req, res) => {
  try {
    const result = await Notification.markAllAsRead(req.user._id);
    res.json({ message: 'All notifications marked as read', updatedCount: result.modifiedCount });
  } catch (error) {
    console.error('Mark all admin notifications read error:', error);
    res.status(500).json({ message: 'Server error while updating notifications' });
  }
});

/**
 * @route   PATCH /api/admin/notifications/:id/archive
 * @desc    Archive admin notification (soft delete)
 * @access  Private (Admin)
 */
router.patch('/notifications/:id/archive', async (req, res) => {
  try {
    const notification = await Notification.findOne({ _id: req.params.id, user: req.user._id });
    if (!notification) return res.status(404).json({ message: 'Notification not found' });

    notification.isActive = false;
    await notification.save();
    res.json({ message: 'Notification archived' });
  } catch (error) {
    console.error('Archive admin notification error:', error);
    res.status(500).json({ message: 'Server error while archiving notification' });
  }
});

// ---------------------------------------------------------------------------
// Moderation (violations/reports/disputes)
// ---------------------------------------------------------------------------

/**
 * @route   GET /api/admin/moderation-violations
 * @desc    List moderation violations logged by the frontend moderation layer
 * @access  Private (Admin)
 */
router.get('/moderation-violations', async (req, res) => {
  try {
    const { severity, type, page = 1, limit = 50 } = req.query;
    const filters = {};

    if (severity && ['high', 'medium', 'low'].includes(severity)) {
      filters.severity = severity;
    }
    if (type && ['blocked', 'warning', 'suspicious'].includes(type)) {
      filters.violationType = type;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [rows, total] = await Promise.all([
      ModerationViolation.find(filters)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('user', 'email firstName lastName role')
        .populate({
          path: 'application',
          select: 'property',
          populate: { path: 'property', select: 'title' }
        }),
      ModerationViolation.countDocuments(filters)
    ]);

    // Shape it to match the existing frontend component expectations
    const violations = rows.map(v => ({
      id: v._id,
      user_id: v.user?._id || v.user,
      application_id: v.application?._id || v.application,
      original_message: v.originalMessage,
      violation_type: v.violationType,
      violation_reason: v.violationReason,
      severity: v.severity,
      created_at: v.createdAt,
      user: v.user,
      application: v.application
        ? {
            id: v.application._id,
            property: v.application.property
          }
        : undefined
    }));

    res.json({
      violations,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get moderation violations error:', error);
    res.status(500).json({ message: 'Server error while fetching moderation violations' });
  }
});

/**
 * @route   GET /api/admin/reports
 * @desc    List user reports for admin review
 * @access  Private (Admin)
 */
router.get('/reports', async (req, res) => {
  try {
    const { status, contentType, page = 1, limit = 50 } = req.query;
    const filters = {};

    if (status && ['pending', 'under_review', 'resolved', 'dismissed'].includes(status)) {
      filters.status = status;
    }
    if (contentType && ['property', 'user', 'application', 'message', 'other'].includes(contentType)) {
      filters.contentType = contentType;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [rows, total] = await Promise.all([
      Report.find(filters)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('reporter', 'email firstName lastName role')
        .populate('reportedUser', 'email firstName lastName role'),
      Report.countDocuments(filters)
    ]);

    const reports = rows.map(r => ({
      id: r._id,
      reporter_id: r.reporter?._id || r.reporter,
      reported_user_id: r.reportedUser?._id || r.reportedUser,
      content_type: r.contentType,
      content_id: r.contentId,
      report_reason: r.reportReason,
      description: r.description,
      evidence: r.evidence,
      status: r.status,
      admin_notes: r.adminNotes,
      action_taken: r.actionTaken,
      created_at: r.createdAt,
      updated_at: r.updatedAt,
      reporter: r.reporter,
      reported_user: r.reportedUser
    }));

    res.json({
      reports,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({ message: 'Server error while fetching reports' });
  }
});

/**
 * @route   PUT /api/admin/reports/:id
 * @desc    Update a report (status/admin notes/action taken)
 * @access  Private (Admin)
 */
router.put('/reports/:id', async (req, res) => {
  try {
    const { status, admin_notes, action_taken } = req.body || {};

    const updates = {};
    if (status) updates.status = status;
    if (admin_notes !== undefined) updates.adminNotes = admin_notes;
    if (action_taken !== undefined) updates.actionTaken = action_taken;

    const report = await Report.findByIdAndUpdate(req.params.id, updates, { new: true })
      .populate('reporter', 'email firstName lastName role')
      .populate('reportedUser', 'email firstName lastName role');

    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    res.json({ message: 'Report updated', report });
  } catch (error) {
    console.error('Update report error:', error);
    res.status(500).json({ message: 'Server error while updating report' });
  }
});

/**
 * @route   GET /api/admin/disputes
 * @desc    List disputes for admin resolution
 * @access  Private (Admin)
 */
router.get('/disputes', async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const filters = {};

    if (status && ['open', 'under_review', 'resolved', 'closed'].includes(status)) {
      filters.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [rows, total] = await Promise.all([
      Dispute.find(filters)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('reporter', 'email firstName lastName role')
        .populate('reportedUser', 'email firstName lastName role'),
      Dispute.countDocuments(filters)
    ]);

    const disputes = rows.map(d => ({
      id: d._id,
      reporter_id: d.reporter?._id || d.reporter,
      reported_user_id: d.reportedUser?._id || d.reportedUser,
      dispute_type: d.disputeType,
      title: d.title,
      description: d.description,
      evidence: d.evidence,
      status: d.status,
      resolution: d.resolution,
      admin_notes: d.adminNotes,
      created_at: d.createdAt,
      updated_at: d.updatedAt,
      reporter: d.reporter,
      reported_user: d.reportedUser
    }));

    res.json({
      disputes,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get disputes error:', error);
    res.status(500).json({ message: 'Server error while fetching disputes' });
  }
});

/**
 * @route   PUT /api/admin/disputes/:id
 * @desc    Update dispute status/resolution/admin notes
 * @access  Private (Admin)
 */
router.put('/disputes/:id', async (req, res) => {
  try {
    const { status, resolution, admin_notes } = req.body || {};

    const updates = {};
    if (status) updates.status = status;
    if (resolution !== undefined) updates.resolution = resolution;
    if (admin_notes !== undefined) updates.adminNotes = admin_notes;

    const dispute = await Dispute.findByIdAndUpdate(req.params.id, updates, { new: true })
      .populate('reporter', 'email firstName lastName role')
      .populate('reportedUser', 'email firstName lastName role');

    if (!dispute) {
      return res.status(404).json({ message: 'Dispute not found' });
    }

    res.json({ message: 'Dispute updated', dispute });
  } catch (error) {
    console.error('Update dispute error:', error);
    res.status(500).json({ message: 'Server error while updating dispute' });
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

    // Notify landlord about property verification status
    try {
      await notifyPropertyVerification(property, isVerified, property.landlord._id.toString());
    } catch (notifError) {
      console.error('Error sending notification:', notifError);
      // Don't fail the request if notification fails
    }

    // If property is verified, send email notifications to clients about new property
    if (isVerified) {
      try {
        const { sendEmail, getEmailTemplate } = require('../utils/emailNotifications');
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        
        // Get all client users (you can optimize this later to only send to clients with saved searches)
        const clients = await User.find({ role: 'client', isEmailVerified: true })
          .select('email firstName lastName _id')
          .limit(1000); // Limit to prevent overwhelming the email service
        
        // Send email to each client (check preferences first)
        const propertyLocation = property.address 
          ? `${property.address.city || ''}${property.address.state ? `, ${property.address.state}` : ''}`.trim() || 'Location'
          : 'Location';
        
        const { checkNotificationPreference } = require('../utils/emailNotifications');
        
        const emailPromises = clients.map(async (client) => {
          try {
            // Check if client wants new property listing emails
            const canSend = await checkNotificationPreference(client._id, 'newPropertyListed');
            
            if (!canSend) {
              return { success: false, email: client.email, error: 'Notification disabled by user preference', skipped: true };
            }
            
            const template = getEmailTemplate('newPropertyListed', {
              clientName: client.firstName || client.email.split('@')[0],
              propertyTitle: property.title,
              propertyLocation: propertyLocation,
              propertyPrice: property.price,
              currency: property.currency || 'NGN',
              propertyType: property.propertyType,
              bedrooms: property.bedrooms,
              bathrooms: property.bathrooms,
              propertyId: property._id.toString(),
              propertyUrl: `${frontendUrl}/property/${property._id}`
            });
            
            if (template) {
              await sendEmail(client.email, template.subject, template.html, template.text);
              return { success: true, email: client.email };
            }
            return { success: false, email: client.email, error: 'No template' };
          } catch (emailError) {
            console.error(`Error sending new property email to ${client.email}:`, emailError);
            return { success: false, email: client.email, error: emailError.message };
          }
        });
        
        const results = await Promise.allSettled(emailPromises);
        const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
        const failed = results.length - successful;
        
        console.log(`✅ New property listing emails sent: ${successful} successful, ${failed} failed`);
      } catch (emailError) {
        console.error('Error sending new property listing emails:', emailError);
        // Don't fail the request if email fails
      }
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
    const r = await deleteUserCascade(userId);
    if (!r.ok) return res.status(r.code).json({ message: r.message });

    res.json({
      message: 'User and all related data deleted successfully'
    });

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Server error while deleting user' });
  }
});

module.exports = router;
