const Notification = require('../models/Notification');
const { sendEmailNotification } = require('./emailNotifications');

/**
 * Notification Service
 * Helper functions to create notifications throughout the application
 * Also sends email notifications when configured
 */

/**
 * Create a notification for a user
 * @param {Object} data - Notification data
 * @param {string} data.userId - User ID to notify
 * @param {string} data.type - Notification type (from enum in model)
 * @param {string} data.title - Notification title
 * @param {string} data.message - Notification message
 * @param {string} [data.priority='medium'] - Priority level
 * @param {Object} [data.relatedEntity] - Related entity (type and id)
 * @param {string} [data.actionUrl] - URL for action button
 * @param {Object} [data.metadata] - Additional metadata
 * @param {boolean} [data.sendEmail=false] - Whether to send email notification
 * @param {string} [data.emailTemplate] - Email template name to use
 * @param {Object} [data.emailData] - Data to pass to email template
 * @returns {Promise<Notification>}
 */
const createNotification = async (data) => {
  try {
    const notification = await Notification.createNotification({
      userId: data.userId,
      type: data.type,
      title: data.title,
      message: data.message,
      priority: data.priority || 'medium',
      relatedEntity: data.relatedEntity,
      actionUrl: data.actionUrl,
      metadata: data.metadata,
      expiresAt: data.expiresAt
    });
    
    // Send email notification if requested
    if (data.sendEmail && data.emailTemplate) {
      try {
        await sendEmailNotification(data.emailTemplate, {
          userId: data.userId,
          ...data.emailData
        });
        console.log(`✅ Email notification sent for ${data.type} to user ${data.userId}`);
      } catch (emailError) {
        console.error('Error sending email notification:', emailError);
        // Don't throw - email failures should not break notification creation
      }
    }
    
    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
    // Don't throw - notifications should not break main flow
    return null;
  }
};

/**
 * Notify user about application status change
 */
const notifyApplicationStatusChange = async (application, status, userId) => {
  const statusMessages = {
    'pending': {
      title: 'Application Received',
      message: `Your application for ${application.property?.title || 'the property'} has been received and is under review.`
    },
    'approved': {
      title: 'Application Approved!',
      message: `Great news! Your application for ${application.property?.title || 'the property'} has been approved.`
    },
    'rejected': {
      title: 'Application Update',
      message: `Your application for ${application.property?.title || 'the property'} has been reviewed.`
    }
  };

  const message = statusMessages[status] || statusMessages.pending;
  const clientName = application.client?.firstName 
    ? `${application.client.firstName} ${application.client.lastName || ''}`.trim()
    : 'Client';
  
  return createNotification({
    userId,
    type: status === 'approved' ? 'application_approved' : 
          status === 'rejected' ? 'application_rejected' : 
          'application_received',
    title: message.title,
    message: message.message,
    priority: status === 'approved' ? 'high' : 'medium',
    relatedEntity: {
      type: 'application',
      id: application._id
    },
    actionUrl: `/dashboard/client/applications/${application._id}`,
    sendEmail: true,
    emailTemplate: 'applicationStatusChange',
    emailData: {
      status,
      clientName,
      propertyTitle: application.property?.title || 'the property',
      applicationId: application._id.toString()
    }
  });
};

/**
 * Notify landlord about new application
 */
const notifyNewApplication = async (application, landlordId) => {
  const clientName = application.client?.firstName 
    ? `${application.client.firstName} ${application.client.lastName || ''}`.trim()
    : 'A client';
  const landlordName = application.landlord?.firstName
    ? `${application.landlord.firstName} ${application.landlord.lastName || ''}`.trim()
    : 'Landlord';
    
  return createNotification({
    userId: landlordId,
    type: 'application_received',
    title: 'New Application Received',
    message: `${clientName} has submitted an application for ${application.property?.title || 'your property'}.`,
    priority: 'high',
    relatedEntity: {
      type: 'application',
      id: application._id
    },
    actionUrl: `/dashboard/landlord/applications/${application._id}`,
    sendEmail: true,
    emailTemplate: 'applicationReceived',
    emailData: {
      landlordName,
      clientName,
      propertyTitle: application.property?.title || 'your property',
      applicationId: application._id.toString()
    }
  });
};

/**
 * Notify user about new message
 */
const notifyNewMessage = async (message, receiverId, senderName) => {
  // Get receiver name for email
  const User = require('../models/User');
  let receiverName = 'User';
  try {
    const receiver = await User.findById(receiverId).select('firstName lastName');
    receiverName = receiver?.firstName 
      ? `${receiver.firstName} ${receiver.lastName || ''}`.trim()
      : 'User';
  } catch (err) {
    // Use default if can't fetch
  }

  return createNotification({
    userId: receiverId,
    type: 'message_received',
    title: 'New Message',
    message: `You have a new message from ${senderName}.`,
    priority: 'medium',
    relatedEntity: {
      type: 'message',
      id: message._id
    },
    actionUrl: `/dashboard/messages?applicationId=${message.application}`,
    sendEmail: true,
    emailTemplate: 'newMessage',
    emailData: {
      receiverName,
      senderName,
      applicationId: message.application?.toString() || message.application
    }
  });
};

/**
 * Notify about viewing appointment
 */
const notifyViewingAppointment = async (appointment, type, userId) => {
  const messages = {
    'scheduled': {
      title: 'Viewing Appointment Scheduled',
      message: `A viewing appointment has been scheduled for ${appointment.property?.title || 'the property'}.`
    },
    'confirmed': {
      title: 'Viewing Appointment Confirmed',
      message: `Your viewing appointment for ${appointment.property?.title || 'the property'} has been confirmed.`
    },
    'cancelled': {
      title: 'Viewing Appointment Cancelled',
      message: `The viewing appointment for ${appointment.property?.title || 'the property'} has been cancelled.`
    }
  };

  const message = messages[type] || messages.scheduled;
  
  // Get user name for email
  const User = require('../models/User');
  let userName = 'User';
  try {
    const user = await User.findById(userId).select('firstName lastName');
    userName = user?.firstName 
      ? `${user.firstName} ${user.lastName || ''}`.trim()
      : 'User';
  } catch (err) {
    // Use default if can't fetch
  }
  
  return createNotification({
    userId,
    type: type === 'scheduled' ? 'viewing_scheduled' : 
          type === 'cancelled' ? 'viewing_cancelled' : 
          'viewing_scheduled',
    title: message.title,
    message: message.message,
    priority: type === 'cancelled' ? 'low' : 'medium',
    relatedEntity: {
      type: 'property',
      id: appointment.property?._id || appointment.property
    },
    actionUrl: `/dashboard/appointments/${appointment._id}`,
    sendEmail: true,
    emailTemplate: 'viewingAppointment',
    emailData: {
      type,
      userName,
      propertyTitle: appointment.property?.title || 'the property',
      appointmentId: appointment._id.toString(),
      scheduledDate: appointment.scheduledDate,
      scheduledTime: appointment.scheduledTime
    }
  });
};

/**
 * Notify about maintenance request
 */
const notifyMaintenanceRequest = async (request, type, userId) => {
  const messages = {
    'submitted': {
      title: 'Maintenance Request Submitted',
      message: `A maintenance request has been submitted for ${request.property?.title || 'the property'}.`
    },
    'completed': {
      title: 'Maintenance Request Completed',
      message: `The maintenance request for ${request.property?.title || 'the property'} has been completed.`
    }
  };

  const message = messages[type] || messages.submitted;
  
  // Get user name for email
  const User = require('../models/User');
  let userName = 'User';
  try {
    const user = await User.findById(userId).select('firstName lastName');
    userName = user?.firstName 
      ? `${user.firstName} ${user.lastName || ''}`.trim()
      : 'User';
  } catch (err) {
    // Use default if can't fetch
  }
  
  return createNotification({
    userId,
    type: type === 'completed' ? 'maintenance_completed' : 'maintenance_request',
    title: message.title,
    message: message.message,
    priority: type === 'completed' ? 'low' : 'medium',
    relatedEntity: {
      type: 'maintenance',
      id: request._id
    },
    actionUrl: `/dashboard/maintenance/${request._id}`,
    sendEmail: true,
    emailTemplate: 'maintenanceRequest',
    emailData: {
      type,
      userName,
      propertyTitle: request.property?.title || 'the property',
      requestId: request._id.toString()
    }
  });
};

/**
 * Notify about property verification
 */
const notifyPropertyVerification = async (property, isVerified, landlordId) => {
  // Get landlord name for email
  const User = require('../models/User');
  let landlordName = 'Landlord';
  try {
    const landlord = await User.findById(landlordId).select('firstName lastName');
    landlordName = landlord?.firstName 
      ? `${landlord.firstName} ${landlord.lastName || ''}`.trim()
      : 'Landlord';
  } catch (err) {
    // Use default if can't fetch
  }

  return createNotification({
    userId: landlordId,
    type: 'property_verified',
    title: isVerified ? 'Property Verified' : 'Property Verification Pending',
    message: isVerified 
      ? `Your property "${property.title}" has been verified and is now live.`
      : `Your property "${property.title}" is pending verification.`,
    priority: isVerified ? 'high' : 'medium',
    relatedEntity: {
      type: 'property',
      id: property._id
    },
    actionUrl: `/dashboard/landlord/properties/${property._id}`,
    sendEmail: true,
    emailTemplate: 'propertyVerified',
    emailData: {
      isVerified,
      landlordName,
      propertyTitle: property.title,
      propertyId: property._id.toString()
    }
  });
};

/**
 * Notify about KYC status
 */
const notifyKYCStatus = async (user, isApproved) => {
  const userName = user.firstName 
    ? `${user.firstName} ${user.lastName || ''}`.trim()
    : 'User';

  return createNotification({
    userId: user._id,
    type: isApproved ? 'kyc_approved' : 'kyc_rejected',
    title: isApproved ? 'KYC Verification Approved' : 'KYC Verification Required',
    message: isApproved
      ? 'Your KYC verification has been approved. You can now list properties.'
      : 'Your KYC verification needs attention. Please update your documents.',
    priority: isApproved ? 'high' : 'medium',
    relatedEntity: {
      type: 'user',
      id: user._id
    },
    actionUrl: '/dashboard/profile',
    sendEmail: true,
    emailTemplate: 'kycStatus',
    emailData: {
      isApproved,
      userName
    }
  });
};

/**
 * Notify all admins about an event
 */
const notifyAdmins = async (title, message, priority = 'medium', actionUrl = null, metadata = {}) => {
  try {
    const User = require('../models/User');
    const admins = await User.find({ role: 'admin' }).select('_id');
    
    const notifications = await Promise.all(
      admins.map(admin => 
        createNotification({
          userId: admin._id,
          type: 'system_announcement',
          title,
          message,
          priority,
          actionUrl,
          metadata: {
            ...metadata,
            actionRequired: priority === 'high' || priority === 'urgent'
          }
        })
      )
    );
    
    return notifications.filter(n => n !== null);
  } catch (error) {
    console.error('Error notifying admins:', error);
    return [];
  }
};

module.exports = {
  createNotification,
  notifyApplicationStatusChange,
  notifyNewApplication,
  notifyNewMessage,
  notifyViewingAppointment,
  notifyMaintenanceRequest,
  notifyPropertyVerification,
  notifyKYCStatus,
  notifyAdmins
};

