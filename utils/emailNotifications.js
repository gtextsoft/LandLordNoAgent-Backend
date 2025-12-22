const { Resend } = require('resend');
const User = require('../models/User');

const resendApiKey = process.env.RESEND_API_KEY;
const fromAddress = process.env.EMAIL_FROM || 'no-reply@landlordnoagent.app';
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

// Initialize Resend if API key is available
const resend = resendApiKey ? new Resend(resendApiKey) : null;

/**
 * Send email notification
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} htmlContent - HTML content
 * @param {string} textContent - Plain text content
 */
const sendEmail = async (to, subject, htmlContent, textContent) => {
  if (!resend) {
    console.warn('RESEND_API_KEY not set, skipping email:', { to, subject });
    return { success: false, error: 'Email service not configured' };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to,
      subject,
      html: htmlContent,
      text: textContent || htmlContent.replace(/<[^>]*>/g, ''), // Strip HTML for text version
    });

    if (error) {
      console.error('Email send error:', error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (error) {
    console.error('Email send exception:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Get user email by ID
 */
const getUserEmail = async (userId) => {
  try {
    const user = await User.findById(userId).select('email firstName lastName');
    return user?.email || null;
  } catch (error) {
    console.error('Error fetching user email:', error);
    return null;
  }
};

/**
 * Email template helpers
 */
const getEmailTemplate = (type, data) => {
  const templates = {
    applicationReceived: (data) => ({
      subject: `New Application for ${data.propertyTitle}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #10b981; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; padding: 12px 24px; background: #10b981; color: white; text-decoration: none; border-radius: 6px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>New Application Received</h1>
            </div>
            <div class="content">
              <p>Hi ${data.landlordName || 'Landlord'},</p>
              <p><strong>${data.clientName}</strong> has submitted an application for your property: <strong>${data.propertyTitle}</strong>.</p>
              <p>Please review the application in your dashboard.</p>
              <a href="${frontendUrl}/dashboard/landlord/applications/${data.applicationId}" class="button">View Application</a>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `Hi ${data.landlordName || 'Landlord'},\n\n${data.clientName} has submitted an application for your property: ${data.propertyTitle}.\n\nView it here: ${frontendUrl}/dashboard/landlord/applications/${data.applicationId}`
    }),

    applicationStatusChange: (data) => {
      const statusMessages = {
        approved: {
          subject: `Application Approved - ${data.propertyTitle}`,
          message: `Great news! Your application for ${data.propertyTitle} has been approved.`
        },
        rejected: {
          subject: `Application Update - ${data.propertyTitle}`,
          message: `Your application for ${data.propertyTitle} has been reviewed. Please check your dashboard for details.`
        },
        pending: {
          subject: `Application Received - ${data.propertyTitle}`,
          message: `Your application for ${data.propertyTitle} has been received and is under review.`
        }
      };

      const statusData = statusMessages[data.status] || statusMessages.pending;

      return {
        subject: statusData.subject,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: ${data.status === 'approved' ? '#10b981' : '#6366f1'}; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
              .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
              .button { display: inline-block; padding: 12px 24px; background: #10b981; color: white; text-decoration: none; border-radius: 6px; margin-top: 20px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>${statusData.subject}</h1>
              </div>
              <div class="content">
                <p>Hi ${data.clientName || 'Client'},</p>
                <p>${statusData.message}</p>
                <a href="${frontendUrl}/dashboard/client/applications/${data.applicationId}" class="button">View Application</a>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `Hi ${data.clientName || 'Client'},\n\n${statusData.message}\n\nView it here: ${frontendUrl}/dashboard/client/applications/${data.applicationId}`
      };
    },

    newMessage: (data) => ({
      subject: `New Message from ${data.senderName}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #8b5cf6; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; padding: 12px 24px; background: #8b5cf6; color: white; text-decoration: none; border-radius: 6px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>New Message</h1>
            </div>
            <div class="content">
              <p>Hi ${data.receiverName || 'User'},</p>
              <p>You have a new message from <strong>${data.senderName}</strong>.</p>
              <a href="${frontendUrl}/dashboard/messages?applicationId=${data.applicationId}" class="button">View Message</a>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `Hi ${data.receiverName || 'User'},\n\nYou have a new message from ${data.senderName}.\n\nView it here: ${frontendUrl}/dashboard/messages?applicationId=${data.applicationId}`
    }),

    viewingAppointment: (data) => {
      const typeMessages = {
        scheduled: {
          subject: `Viewing Appointment Scheduled - ${data.propertyTitle}`,
          message: `A viewing appointment has been scheduled for ${data.propertyTitle}.`
        },
        confirmed: {
          subject: `Viewing Appointment Confirmed - ${data.propertyTitle}`,
          message: `Your viewing appointment for ${data.propertyTitle} has been confirmed.`
        },
        cancelled: {
          subject: `Viewing Appointment Cancelled - ${data.propertyTitle}`,
          message: `The viewing appointment for ${data.propertyTitle} has been cancelled.`
        }
      };

      const typeData = typeMessages[data.type] || typeMessages.scheduled;

      return {
        subject: typeData.subject,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #f59e0b; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
              .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
              .button { display: inline-block; padding: 12px 24px; background: #f59e0b; color: white; text-decoration: none; border-radius: 6px; margin-top: 20px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>${typeData.subject}</h1>
              </div>
              <div class="content">
                <p>Hi ${data.userName || 'User'},</p>
                <p>${typeData.message}</p>
                ${data.scheduledDate ? `<p><strong>Date:</strong> ${new Date(data.scheduledDate).toLocaleDateString()}</p>` : ''}
                ${data.scheduledTime ? `<p><strong>Time:</strong> ${data.scheduledTime}</p>` : ''}
                <a href="${frontendUrl}/dashboard/appointments/${data.appointmentId}" class="button">View Appointment</a>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `Hi ${data.userName || 'User'},\n\n${typeData.message}\n\nView it here: ${frontendUrl}/dashboard/appointments/${data.appointmentId}`
      };
    },

    maintenanceRequest: (data) => {
      const typeMessages = {
        submitted: {
          subject: `Maintenance Request - ${data.propertyTitle}`,
          message: `A maintenance request has been submitted for ${data.propertyTitle}.`
        },
        completed: {
          subject: `Maintenance Completed - ${data.propertyTitle}`,
          message: `The maintenance request for ${data.propertyTitle} has been completed.`
        }
      };

      const typeData = typeMessages[data.type] || typeMessages.submitted;

      return {
        subject: typeData.subject,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #ef4444; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
              .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
              .button { display: inline-block; padding: 12px 24px; background: #ef4444; color: white; text-decoration: none; border-radius: 6px; margin-top: 20px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>${typeData.subject}</h1>
              </div>
              <div class="content">
                <p>Hi ${data.userName || 'User'},</p>
                <p>${typeData.message}</p>
                <a href="${frontendUrl}/dashboard/maintenance/${data.requestId}" class="button">View Request</a>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `Hi ${data.userName || 'User'},\n\n${typeData.message}\n\nView it here: ${frontendUrl}/dashboard/maintenance/${data.requestId}`
      };
    },

    propertyVerified: (data) => ({
      subject: data.isVerified ? `Property Verified - ${data.propertyTitle}` : `Property Verification Pending - ${data.propertyTitle}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: ${data.isVerified ? '#10b981' : '#f59e0b'}; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; padding: 12px 24px; background: ${data.isVerified ? '#10b981' : '#f59e0b'}; color: white; text-decoration: none; border-radius: 6px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${data.isVerified ? 'Property Verified' : 'Verification Pending'}</h1>
            </div>
            <div class="content">
              <p>Hi ${data.landlordName || 'Landlord'},</p>
              <p>${data.isVerified 
                ? `Your property "${data.propertyTitle}" has been verified and is now live on the platform.`
                : `Your property "${data.propertyTitle}" is pending verification.`}</p>
              <a href="${frontendUrl}/dashboard/landlord/properties/${data.propertyId}" class="button">View Property</a>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `Hi ${data.landlordName || 'Landlord'},\n\n${data.isVerified 
        ? `Your property "${data.propertyTitle}" has been verified and is now live.`
        : `Your property "${data.propertyTitle}" is pending verification.`}\n\nView it here: ${frontendUrl}/dashboard/landlord/properties/${data.propertyId}`
    }),

    kycStatus: (data) => ({
      subject: data.isApproved ? 'KYC Verification Approved' : 'KYC Verification Required',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: ${data.isApproved ? '#10b981' : '#ef4444'}; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; padding: 12px 24px; background: ${data.isApproved ? '#10b981' : '#ef4444'}; color: white; text-decoration: none; border-radius: 6px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${data.isApproved ? 'KYC Approved' : 'KYC Update Required'}</h1>
            </div>
            <div class="content">
              <p>Hi ${data.userName || 'User'},</p>
              <p>${data.isApproved
                ? 'Your KYC verification has been approved. You can now list properties and use all platform features.'
                : 'Your KYC verification needs attention. Please update your documents in your profile.'}</p>
              <a href="${frontendUrl}/dashboard/profile" class="button">View Profile</a>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `Hi ${data.userName || 'User'},\n\n${data.isApproved
        ? 'Your KYC verification has been approved. You can now list properties.'
        : 'Your KYC verification needs attention. Please update your documents.'}\n\nView profile: ${frontendUrl}/dashboard/profile`
    })
  };

  return templates[type] ? templates[type](data) : null;
};

/**
 * Send email notification based on notification type
 */
const sendEmailNotification = async (notificationType, data) => {
  const userEmail = await getUserEmail(data.userId);
  
  if (!userEmail) {
    console.warn('Cannot send email notification: user email not found', { userId: data.userId });
    return { success: false, error: 'User email not found' };
  }

  const template = getEmailTemplate(notificationType, data);
  
  if (!template) {
    console.warn('No email template found for type:', notificationType);
    return { success: false, error: 'Template not found' };
  }

  return sendEmail(userEmail, template.subject, template.html, template.text);
};

module.exports = {
  sendEmail,
  sendEmailNotification,
  getUserEmail,
  getEmailTemplate
};

