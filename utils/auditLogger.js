const AuditLog = require('../models/AuditLog');

/**
 * Helper function to create audit logs
 * @param {Object} options - Audit log options
 * @param {String} options.action - Action name (e.g., 'user_registered', 'property_created')
 * @param {String} options.entityType - Entity type (e.g., 'User', 'Property', 'Application')
 * @param {mongoose.Types.ObjectId} options.entityId - Entity ID (optional)
 * @param {mongoose.Types.ObjectId} options.userId - User ID performing the action (required)
 * @param {Object} options.details - Additional details (optional)
 * @param {String} options.ipAddress - IP address (optional)
 * @param {String} options.userAgent - User agent (optional)
 * @returns {Promise} - Promise that resolves when audit log is created
 */
async function createAuditLog({
  action,
  entityType = 'System',
  entityId = null,
  userId,
  details = {},
  ipAddress = null,
  userAgent = null
}) {
  try {
    // Don't fail the request if audit logging fails
    await AuditLog.create({
      action,
      entityType,
      entityId,
      userId,
      details,
      ipAddress,
      userAgent
    });
  } catch (error) {
    // Log error but don't throw - audit logging should not break the main flow
    console.error('Audit log creation failed:', error);
  }
}

/**
 * Helper function to extract IP address and user agent from request
 * @param {Object} req - Express request object
 * @returns {Object} - Object with ipAddress and userAgent
 */
function getRequestMetadata(req) {
  return {
    ipAddress: req.ip || req.connection?.remoteAddress || req.headers['x-forwarded-for'] || null,
    userAgent: req.get('user-agent') || null
  };
}

module.exports = {
  createAuditLog,
  getRequestMetadata
};
