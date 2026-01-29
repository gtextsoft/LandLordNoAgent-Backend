const { Resend } = require('resend');
const User = require('../models/User');

const resendApiKey = process.env.RESEND_API_KEY;
const fromAddress = process.env.EMAIL_FROM || 'no-reply@landlordnoagent.app';
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

/**
 * Get logo URL for email templates
 * Uses the frontend URL to serve the logo
 */
const getLogoUrl = () => {
  const baseUrl = frontendUrl.replace(/\/$/, '');
  return `${baseUrl}/logo.png`;
};

/**
 * Get email header HTML with logo
 */
const getEmailHeader = (title = 'LandLordNoAgent') => {
  const logoUrl = getLogoUrl();
  return `
    <div style="background: linear-gradient(135deg, #249479 0%, #1d4ed8 100%); padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0;">
      <img src="${logoUrl}" alt="LandLordNoAgent Logo" style="max-width: 200px; height: auto; margin-bottom: 15px;" />
      <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">${title}</h1>
      <p style="color: #e0e7ff; margin: 8px 0 0 0; font-size: 16px;">The future of long-term rentals</p>
    </div>
  `;
};

/**
 * Get email footer HTML
 */
const getEmailFooter = () => {
  return `
    <div style="background-color: #f8fafc; padding: 30px 20px; text-align: center; border-radius: 0 0 8px 8px; border-top: 1px solid #e5e7eb; margin-top: 30px;">
      <p style="color: #6b7280; font-size: 14px; margin: 0 0 10px 0;">
        © ${new Date().getFullYear()} LandLordNoAgent. All rights reserved.
      </p>
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
        This email was sent to you because you have an account with LandLordNoAgent.<br/>
        If you have any questions, please contact our support team.
      </p>
    </div>
  `;
};

/**
 * Wrap email content with header and footer
 */
const wrapEmailTemplate = (content, title) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
        ${getEmailHeader(title)}
        <div style="padding: 40px 30px;">
          ${content}
        </div>
        ${getEmailFooter()}
      </div>
    </body>
    </html>
  `;
};

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
    welcome: (data) => {
      const content = `
        <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 24px;">Welcome to LandLordNoAgent!</h2>
        <p style="color: #6b7280; line-height: 1.6; margin-bottom: 15px;">
          Hi ${data.name || 'there'},
        </p>
        <p style="color: #6b7280; line-height: 1.6; margin-bottom: 15px;">
          We're thrilled to have you join our platform! You've successfully registered as a <strong>${data.role || 'user'}</strong>.
        </p>
        <div style="background-color: #f0fdf4; border-left: 4px solid #249479; padding: 20px; margin: 20px 0; border-radius: 6px;">
          <p style="color: #166534; margin: 0; font-weight: 600; margin-bottom: 10px;">What's Next?</p>
          <ul style="color: #166534; margin: 0; padding-left: 20px;">
            ${data.role === 'landlord' 
              ? '<li>Complete your KYC verification to start listing properties</li><li>Add your first property listing</li><li>Connect with potential tenants</li>'
              : '<li>Browse available properties</li><li>Save your favorite listings</li><li>Apply for properties that match your needs</li>'}
          </ul>
        </div>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${data.dashboardUrl || `${frontendUrl}/dashboard/${data.role || 'client'}`}" style="display: inline-block; background-color: #249479; color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: bold; font-size: 16px;">Go to Dashboard</a>
        </div>
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          If you have any questions or need assistance, don't hesitate to reach out to our support team.
        </p>
      `;
      return {
        subject: 'Welcome to LandLordNoAgent - Your Rental Platform',
        html: wrapEmailTemplate(content, 'Welcome to LandLordNoAgent'),
        text: `Welcome to LandLordNoAgent!\n\nHi ${data.name || 'there'},\n\nWe're thrilled to have you join our platform! You've successfully registered as a ${data.role || 'user'}.\n\n${data.role === 'landlord' ? 'Complete your KYC verification to start listing properties and connect with potential tenants.' : 'Browse available properties, save your favorite listings, and apply for properties that match your needs.'}\n\nVisit your dashboard: ${data.dashboardUrl || `${frontendUrl}/dashboard/${data.role || 'client'}`}\n\nIf you have any questions, don't hesitate to reach out to our support team.\n\nBest regards,\nThe LandLordNoAgent Team`
      };
    },

    newPropertyListed: (data) => {
      const content = `
        <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 24px;">New Property Available!</h2>
        <p style="color: #6b7280; line-height: 1.6; margin-bottom: 15px;">
          Hi ${data.clientName || 'there'},
        </p>
        <p style="color: #6b7280; line-height: 1.6; margin-bottom: 20px;">
          Great news! A new property has just been listed that might interest you:
        </p>
        <div style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <h3 style="color: #1f2937; margin: 0 0 10px 0; font-size: 20px;">${data.propertyTitle || 'New Property'}</h3>
          <p style="color: #6b7280; margin: 5px 0;"><strong>Location:</strong> ${data.propertyLocation || 'N/A'}</p>
          <p style="color: #6b7280; margin: 5px 0;"><strong>Price:</strong> ${data.currency || 'NGN'} ${data.propertyPrice ? parseFloat(data.propertyPrice).toLocaleString() : 'N/A'}</p>
          <p style="color: #6b7280; margin: 5px 0;"><strong>Type:</strong> ${data.propertyType || 'N/A'}</p>
          ${data.bedrooms ? `<p style="color: #6b7280; margin: 5px 0;"><strong>Bedrooms:</strong> ${data.bedrooms}</p>` : ''}
          ${data.bathrooms ? `<p style="color: #6b7280; margin: 5px 0;"><strong>Bathrooms:</strong> ${data.bathrooms}</p>` : ''}
        </div>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${data.propertyUrl || `${frontendUrl}/property/${data.propertyId}`}" style="display: inline-block; background-color: #249479; color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: bold; font-size: 16px;">View Property</a>
        </div>
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          Don't miss out on this opportunity! View the property details and apply if it matches your needs.
        </p>
      `;
      return {
        subject: `New Property Available: ${data.propertyTitle || 'Check it out!'}`,
        html: wrapEmailTemplate(content, 'New Property Available'),
        text: `New Property Available!\n\nHi ${data.clientName || 'there'},\n\nGreat news! A new property has just been listed:\n\n${data.propertyTitle || 'New Property'}\nLocation: ${data.propertyLocation || 'N/A'}\nPrice: ${data.currency || 'NGN'} ${data.propertyPrice ? parseFloat(data.propertyPrice).toLocaleString() : 'N/A'}\n\nView property: ${data.propertyUrl || `${frontendUrl}/property/${data.propertyId}`}\n\nDon't miss out on this opportunity!`
      };
    },

    applicationReceived: (data) => {
      const content = `
        <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 24px;">New Application Received</h2>
        <p style="color: #6b7280; line-height: 1.6; margin-bottom: 15px;">
          Hi ${data.landlordName || 'Landlord'},
        </p>
        <p style="color: #6b7280; line-height: 1.6; margin-bottom: 20px;">
          <strong>${data.clientName}</strong> has submitted an application for your property: <strong>${data.propertyTitle}</strong>.
        </p>
        <p style="color: #6b7280; line-height: 1.6; margin-bottom: 20px;">
          Please review the application in your dashboard and respond accordingly.
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${frontendUrl}/dashboard/landlord/applications/${data.applicationId}" style="display: inline-block; background-color: #249479; color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: bold; font-size: 16px;">View Application</a>
        </div>
      `;
      return {
        subject: `New Application for ${data.propertyTitle}`,
        html: wrapEmailTemplate(content, 'New Application Received'),
        text: `Hi ${data.landlordName || 'Landlord'},\n\n${data.clientName} has submitted an application for your property: ${data.propertyTitle}.\n\nView it here: ${frontendUrl}/dashboard/landlord/applications/${data.applicationId}`
      };
    },

    applicationStatusChange: (data) => {
      const statusMessages = {
        approved: {
          subject: `Application Approved - ${data.propertyTitle}`,
          message: `Great news! Your application for ${data.propertyTitle} has been approved.`,
          color: '#249479'
        },
        rejected: {
          subject: `Application Update - ${data.propertyTitle}`,
          message: `Your application for ${data.propertyTitle} has been reviewed. Please check your dashboard for details.`,
          color: '#6366f1'
        },
        pending: {
          subject: `Application Received - ${data.propertyTitle}`,
          message: `Your application for ${data.propertyTitle} has been received and is under review.`,
          color: '#6366f1'
        }
      };

      const statusData = statusMessages[data.status] || statusMessages.pending;
      const content = `
        <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 24px;">${statusData.subject}</h2>
        <p style="color: #6b7280; line-height: 1.6; margin-bottom: 15px;">
          Hi ${data.clientName || 'Client'},
        </p>
        <p style="color: #6b7280; line-height: 1.6; margin-bottom: 20px;">
          ${statusData.message}
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${frontendUrl}/dashboard/client/applications/${data.applicationId}" style="display: inline-block; background-color: ${statusData.color}; color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: bold; font-size: 16px;">View Application</a>
        </div>
      `;
      return {
        subject: statusData.subject,
        html: wrapEmailTemplate(content, statusData.subject),
        text: `Hi ${data.clientName || 'Client'},\n\n${statusData.message}\n\nView it here: ${frontendUrl}/dashboard/client/applications/${data.applicationId}`
      };
    },

    newMessage: (data) => {
      const content = `
        <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 24px;">New Message</h2>
        <p style="color: #6b7280; line-height: 1.6; margin-bottom: 15px;">
          Hi ${data.receiverName || 'User'},
        </p>
        <p style="color: #6b7280; line-height: 1.6; margin-bottom: 20px;">
          You have a new message from <strong>${data.senderName}</strong>.
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${frontendUrl}/dashboard/messages?applicationId=${data.applicationId}" style="display: inline-block; background-color: #8b5cf6; color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: bold; font-size: 16px;">View Message</a>
        </div>
      `;
      return {
        subject: `New Message from ${data.senderName}`,
        html: wrapEmailTemplate(content, 'New Message'),
        text: `Hi ${data.receiverName || 'User'},\n\nYou have a new message from ${data.senderName}.\n\nView it here: ${frontendUrl}/dashboard/messages?applicationId=${data.applicationId}`
      };
    },

    viewingAppointment: (data) => {
      const typeMessages = {
        scheduled: {
          subject: `Viewing Appointment Scheduled - ${data.propertyTitle}`,
          message: `A viewing appointment has been scheduled for ${data.propertyTitle}.`,
          color: '#f59e0b'
        },
        confirmed: {
          subject: `Viewing Appointment Confirmed - ${data.propertyTitle}`,
          message: `Your viewing appointment for ${data.propertyTitle} has been confirmed.`,
          color: '#249479'
        },
        cancelled: {
          subject: `Viewing Appointment Cancelled - ${data.propertyTitle}`,
          message: `The viewing appointment for ${data.propertyTitle} has been cancelled.`,
          color: '#ef4444'
        }
      };

      const typeData = typeMessages[data.type] || typeMessages.scheduled;
      const content = `
        <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 24px;">${typeData.subject}</h2>
        <p style="color: #6b7280; line-height: 1.6; margin-bottom: 15px;">
          Hi ${data.userName || 'User'},
        </p>
        <p style="color: #6b7280; line-height: 1.6; margin-bottom: 20px;">
          ${typeData.message}
        </p>
        ${data.scheduledDate || data.scheduledTime ? `
          <div style="background-color: #f9fafb; border-left: 4px solid ${typeData.color}; padding: 15px; margin: 20px 0; border-radius: 6px;">
            ${data.scheduledDate ? `<p style="color: #1f2937; margin: 5px 0;"><strong>Date:</strong> ${new Date(data.scheduledDate).toLocaleDateString()}</p>` : ''}
            ${data.scheduledTime ? `<p style="color: #1f2937; margin: 5px 0;"><strong>Time:</strong> ${data.scheduledTime}</p>` : ''}
          </div>
        ` : ''}
        <div style="text-align: center; margin: 30px 0;">
          <a href="${frontendUrl}/dashboard/appointments/${data.appointmentId}" style="display: inline-block; background-color: ${typeData.color}; color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: bold; font-size: 16px;">View Appointment</a>
        </div>
      `;
      return {
        subject: typeData.subject,
        html: wrapEmailTemplate(content, typeData.subject),
        text: `Hi ${data.userName || 'User'},\n\n${typeData.message}\n\n${data.scheduledDate ? `Date: ${new Date(data.scheduledDate).toLocaleDateString()}\n` : ''}${data.scheduledTime ? `Time: ${data.scheduledTime}\n` : ''}\nView it here: ${frontendUrl}/dashboard/appointments/${data.appointmentId}`
      };
    },

    maintenanceRequest: (data) => {
      const typeMessages = {
        submitted: {
          subject: `Maintenance Request - ${data.propertyTitle}`,
          message: `A maintenance request has been submitted for ${data.propertyTitle}.`,
          color: '#ef4444'
        },
        completed: {
          subject: `Maintenance Completed - ${data.propertyTitle}`,
          message: `The maintenance request for ${data.propertyTitle} has been completed.`,
          color: '#249479'
        }
      };

      const typeData = typeMessages[data.type] || typeMessages.submitted;
      const content = `
        <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 24px;">${typeData.subject}</h2>
        <p style="color: #6b7280; line-height: 1.6; margin-bottom: 15px;">
          Hi ${data.userName || 'User'},
        </p>
        <p style="color: #6b7280; line-height: 1.6; margin-bottom: 20px;">
          ${typeData.message}
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${frontendUrl}/dashboard/maintenance/${data.requestId}" style="display: inline-block; background-color: ${typeData.color}; color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: bold; font-size: 16px;">View Request</a>
        </div>
      `;
      return {
        subject: typeData.subject,
        html: wrapEmailTemplate(content, typeData.subject),
        text: `Hi ${data.userName || 'User'},\n\n${typeData.message}\n\nView it here: ${frontendUrl}/dashboard/maintenance/${data.requestId}`
      };
    },

    propertyVerified: (data) => {
      const isVerified = data.isVerified;
      const content = `
        <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 24px;">${isVerified ? 'Property Verified!' : 'Property Verification Update'}</h2>
        <p style="color: #6b7280; line-height: 1.6; margin-bottom: 15px;">
          Hi ${data.landlordName || 'Landlord'},
        </p>
        ${isVerified 
          ? `
            <div style="background-color: #f0fdf4; border-left: 4px solid #249479; padding: 20px; margin: 20px 0; border-radius: 6px;">
              <p style="color: #166534; margin: 0; font-weight: 600;">Great news!</p>
              <p style="color: #166534; margin: 10px 0 0 0;">
                Your property "<strong>${data.propertyTitle}</strong>" has been verified and is now live on the platform. 
                Potential tenants can now view and apply for your property.
              </p>
            </div>
          `
          : `
            <p style="color: #6b7280; line-height: 1.6; margin-bottom: 20px;">
              Your property "<strong>${data.propertyTitle}</strong>" is currently pending verification. 
              Our team is reviewing it and will notify you once it's approved.
            </p>
          `}
        <div style="text-align: center; margin: 30px 0;">
          <a href="${frontendUrl}/dashboard/landlord/properties/${data.propertyId}" style="display: inline-block; background-color: ${isVerified ? '#249479' : '#f59e0b'}; color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: bold; font-size: 16px;">View Property</a>
        </div>
      `;
      return {
        subject: isVerified ? `Property Verified - ${data.propertyTitle}` : `Property Verification Pending - ${data.propertyTitle}`,
        html: wrapEmailTemplate(content, isVerified ? 'Property Verified' : 'Verification Pending'),
        text: `Hi ${data.landlordName || 'Landlord'},\n\n${isVerified 
          ? `Your property "${data.propertyTitle}" has been verified and is now live on the platform.`
          : `Your property "${data.propertyTitle}" is pending verification.`}\n\nView it here: ${frontendUrl}/dashboard/landlord/properties/${data.propertyId}`
      };
    },

    kycStatus: (data) => {
      const isApproved = data.isApproved;
      const content = `
        <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 24px;">${isApproved ? 'KYC Verification Approved!' : 'KYC Verification Update Required'}</h2>
        <p style="color: #6b7280; line-height: 1.6; margin-bottom: 15px;">
          Hi ${data.userName || 'User'},
        </p>
        ${isApproved
          ? `
            <div style="background-color: #f0fdf4; border-left: 4px solid #249479; padding: 20px; margin: 20px 0; border-radius: 6px;">
              <p style="color: #166534; margin: 0; font-weight: 600;">Congratulations!</p>
              <p style="color: #166534; margin: 10px 0 0 0;">
                Your KYC verification has been approved. You can now list properties and use all platform features.
              </p>
            </div>
          `
          : `
            <p style="color: #6b7280; line-height: 1.6; margin-bottom: 20px;">
              Your KYC verification needs attention. Please update your documents in your profile to continue using platform features.
            </p>
          `}
        <div style="text-align: center; margin: 30px 0;">
          <a href="${frontendUrl}/dashboard/profile" style="display: inline-block; background-color: ${isApproved ? '#249479' : '#ef4444'}; color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: bold; font-size: 16px;">View Profile</a>
        </div>
      `;
      return {
        subject: isApproved ? 'KYC Verification Approved' : 'KYC Verification Required',
        html: wrapEmailTemplate(content, isApproved ? 'KYC Approved' : 'KYC Update Required'),
        text: `Hi ${data.userName || 'User'},\n\n${isApproved
          ? 'Your KYC verification has been approved. You can now list properties and use all platform features.'
          : 'Your KYC verification needs attention. Please update your documents in your profile.'}\n\nView profile: ${frontendUrl}/dashboard/profile`
      };
    },

    paymentSuccess: (data) => {
      const content = `
        <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 24px;">Payment Successful!</h2>
        <p style="color: #6b7280; line-height: 1.6; margin-bottom: 15px;">
          Hi ${data.clientName || 'Client'},
        </p>
        <p style="color: #6b7280; line-height: 1.6; margin-bottom: 20px;">
          Your payment has been successfully processed!
        </p>
        <div style="background-color: #f0fdf4; border-left: 4px solid #249479; padding: 20px; margin: 20px 0; border-radius: 6px;">
          <p style="color: #166534; margin: 5px 0; font-weight: 600;">Transaction Details:</p>
          <p style="color: #166534; margin: 5px 0;"><strong>Property:</strong> ${data.propertyTitle || 'N/A'}</p>
          <p style="color: #166534; margin: 5px 0;"><strong>Amount:</strong> ${data.currency || 'NGN'} ${data.amount ? parseFloat(data.amount).toLocaleString() : '0'}</p>
          <p style="color: #166534; margin: 5px 0;"><strong>Payment Type:</strong> ${data.paymentType === 'rent' ? 'Rent Payment (Escrow)' : 'Application Fee'}</p>
          ${data.isEscrow ? `<p style="color: #166534; margin: 5px 0;"><strong>Escrow Status:</strong> Payment held in escrow until property visit and document handover</p>` : ''}
          ${data.escrowExpiresAt ? `<p style="color: #166534; margin: 5px 0;"><strong>Escrow Expires:</strong> ${new Date(data.escrowExpiresAt).toLocaleDateString()}</p>` : ''}
          <p style="color: #166534; margin: 5px 0;"><strong>Transaction ID:</strong> ${data.paymentId?.substring(0, 8) || 'N/A'}</p>
        </div>
        ${data.isEscrow ? '<p style="color: #6b7280; line-height: 1.6; margin-bottom: 20px;">Your payment is being held in escrow. Once you visit the property and receive the documents, the payment will be released to the landlord.</p>' : ''}
        <div style="text-align: center; margin: 30px 0;">
          <a href="${frontendUrl}/payment/receipt?id=${data.paymentId}" style="display: inline-block; background-color: #249479; color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: bold; font-size: 16px;">View Receipt</a>
        </div>
      `;
      return {
        subject: `Payment Successful - ${data.propertyTitle || 'Transaction'}`,
        html: wrapEmailTemplate(content, 'Payment Successful'),
        text: `Hi ${data.clientName || 'Client'},\n\nYour payment has been successfully processed!\n\nProperty: ${data.propertyTitle || 'N/A'}\nAmount: ${data.currency || 'NGN'} ${data.amount ? parseFloat(data.amount).toLocaleString() : '0'}\nPayment Type: ${data.paymentType === 'rent' ? 'Rent Payment (Escrow)' : 'Application Fee'}\n${data.isEscrow ? 'Escrow Status: Payment held in escrow\n' : ''}Transaction ID: ${data.paymentId?.substring(0, 8) || 'N/A'}\n\nView receipt: ${frontendUrl}/payment/receipt?id=${data.paymentId}`
      };
    },

    paymentFailed: (data) => {
      const content = `
        <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 24px;">Payment Failed</h2>
        <p style="color: #6b7280; line-height: 1.6; margin-bottom: 15px;">
          Hi ${data.clientName || 'Client'},
        </p>
        <p style="color: #6b7280; line-height: 1.6; margin-bottom: 20px;">
          Unfortunately, your payment could not be processed.
        </p>
        <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 20px; margin: 20px 0; border-radius: 6px;">
          <p style="color: #991b1b; margin: 5px 0; font-weight: 600;">Transaction Details:</p>
          <p style="color: #991b1b; margin: 5px 0;"><strong>Property:</strong> ${data.propertyTitle || 'N/A'}</p>
          <p style="color: #991b1b; margin: 5px 0;"><strong>Amount:</strong> ${data.currency || 'NGN'} ${data.amount ? parseFloat(data.amount).toLocaleString() : '0'}</p>
          ${data.failureReason ? `<p style="color: #991b1b; margin: 5px 0;"><strong>Reason:</strong> ${data.failureReason}</p>` : ''}
        </div>
        <p style="color: #6b7280; line-height: 1.6; margin-bottom: 20px;">
          Please try again or contact support if the issue persists.
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${frontendUrl}/dashboard/client/applications/${data.applicationId}" style="display: inline-block; background-color: #ef4444; color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: bold; font-size: 16px;">Try Again</a>
        </div>
      `;
      return {
        subject: `Payment Failed - ${data.propertyTitle || 'Transaction'}`,
        html: wrapEmailTemplate(content, 'Payment Failed'),
        text: `Hi ${data.clientName || 'Client'},\n\nUnfortunately, your payment could not be processed.\n\nProperty: ${data.propertyTitle || 'N/A'}\nAmount: ${data.currency || 'NGN'} ${data.amount ? parseFloat(data.amount).toLocaleString() : '0'}\n${data.failureReason ? `Reason: ${data.failureReason}\n` : ''}\nPlease try again: ${frontendUrl}/dashboard/client/applications/${data.applicationId}`
      };
    },

    escrowReleased: (data) => {
      const content = `
        <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 24px;">Escrow Released!</h2>
        <p style="color: #6b7280; line-height: 1.6; margin-bottom: 15px;">
          Hi ${data.landlordName || 'Landlord'},
        </p>
        <p style="color: #6b7280; line-height: 1.6; margin-bottom: 20px;">
          Great news! The escrow payment for your property has been released to your account.
        </p>
        <div style="background-color: #f0fdf4; border-left: 4px solid #249479; padding: 20px; margin: 20px 0; border-radius: 6px;">
          <p style="color: #166534; margin: 5px 0; font-weight: 600;">Payment Details:</p>
          <p style="color: #166534; margin: 5px 0;"><strong>Property:</strong> ${data.propertyTitle || 'N/A'}</p>
          <p style="color: #166534; margin: 5px 0;"><strong>Gross Amount:</strong> ${data.currency || 'NGN'} ${data.grossAmount ? parseFloat(data.grossAmount).toLocaleString() : '0'}</p>
          <p style="color: #166534; margin: 5px 0;"><strong>Commission (${((data.commissionRate || 0) * 100).toFixed(1)}%):</strong> ${data.currency || 'NGN'} ${data.commissionAmount ? parseFloat(data.commissionAmount).toLocaleString() : '0'}</p>
          ${data.interestCharged ? `<p style="color: #166534; margin: 5px 0;"><strong>Interest Charged:</strong> ${data.currency || 'NGN'} ${parseFloat(data.interestCharged).toLocaleString()}</p>` : ''}
          <p style="color: #166534; margin: 5px 0;"><strong>Net Amount:</strong> ${data.currency || 'NGN'} ${data.landlordNetAmount ? parseFloat(data.landlordNetAmount).toLocaleString() : '0'}</p>
          <p style="color: #166534; margin: 5px 0;"><strong>Payment ID:</strong> ${data.paymentId?.substring(0, 8) || 'N/A'}</p>
        </div>
        <p style="color: #6b7280; line-height: 1.6; margin-bottom: 20px;">
          The funds are now available in your landlord account. You can request a payout at any time.
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${frontendUrl}/dashboard/landlord/earnings" style="display: inline-block; background-color: #249479; color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: bold; font-size: 16px;">View Earnings</a>
        </div>
      `;
      return {
        subject: `Escrow Released - ${data.propertyTitle || 'Payment'}`,
        html: wrapEmailTemplate(content, 'Escrow Released'),
        text: `Hi ${data.landlordName || 'Landlord'},\n\nGreat news! The escrow payment for your property has been released to your account.\n\nProperty: ${data.propertyTitle || 'N/A'}\nGross Amount: ${data.currency || 'NGN'} ${data.grossAmount ? parseFloat(data.grossAmount).toLocaleString() : '0'}\nCommission (${((data.commissionRate || 0) * 100).toFixed(1)}%): ${data.currency || 'NGN'} ${data.commissionAmount ? parseFloat(data.commissionAmount).toLocaleString() : '0'}\n${data.interestCharged ? `Interest Charged: ${data.currency || 'NGN'} ${parseFloat(data.interestCharged).toLocaleString()}\n` : ''}Net Amount: ${data.currency || 'NGN'} ${data.landlordNetAmount ? parseFloat(data.landlordNetAmount).toLocaleString() : '0'}\n\nView earnings: ${frontendUrl}/dashboard/landlord/earnings`
      };
    },

    paymentReceivedLandlord: (data) => {
      const content = `
        <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 24px;">Payment Received!</h2>
        <p style="color: #6b7280; line-height: 1.6; margin-bottom: 15px;">
          Hi ${data.landlordName || 'Landlord'},
        </p>
        <p style="color: #6b7280; line-height: 1.6; margin-bottom: 20px;">
          Great news! ${data.clientName || 'A client'} has made a payment for your property.
        </p>
        <div style="background-color: #f0fdf4; border-left: 4px solid #249479; padding: 20px; margin: 20px 0; border-radius: 6px;">
          <p style="color: #166534; margin: 5px 0; font-weight: 600;">Payment Details:</p>
          <p style="color: #166534; margin: 5px 0;"><strong>Property:</strong> ${data.propertyTitle || 'N/A'}</p>
          <p style="color: #166534; margin: 5px 0;"><strong>Client:</strong> ${data.clientName || 'N/A'}</p>
          <p style="color: #166534; margin: 5px 0;"><strong>Amount:</strong> ${data.currency || 'NGN'} ${data.amount ? parseFloat(data.amount).toLocaleString() : '0'}</p>
          <p style="color: #166534; margin: 5px 0;"><strong>Payment Type:</strong> ${data.paymentType === 'rent' ? 'Rent Payment' : 'Application Fee'}</p>
          ${data.isEscrow ? `<p style="color: #166534; margin: 5px 0;"><strong>Escrow Status:</strong> Payment held in escrow until property visit and document handover</p>` : ''}
          ${data.escrowExpiresAt ? `<p style="color: #166534; margin: 5px 0;"><strong>Escrow Expires:</strong> ${new Date(data.escrowExpiresAt).toLocaleDateString()}</p>` : ''}
          <p style="color: #166534; margin: 5px 0;"><strong>Payment ID:</strong> ${data.paymentId?.substring(0, 8) || 'N/A'}</p>
        </div>
        ${data.isEscrow ? '<p style="color: #6b7280; line-height: 1.6; margin-bottom: 20px;">The payment is being held in escrow. Once the client visits the property and receives the documents, the payment will be released to your account (minus platform commission).</p>' : ''}
        <div style="text-align: center; margin: 30px 0;">
          <a href="${frontendUrl}/dashboard/landlord/payments" style="display: inline-block; background-color: #249479; color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: bold; font-size: 16px;">View Payment Details</a>
        </div>
      `;
      return {
        subject: `Payment Received - ${data.propertyTitle || 'Property'}`,
        html: wrapEmailTemplate(content, 'Payment Received'),
        text: `Hi ${data.landlordName || 'Landlord'},\n\nGreat news! ${data.clientName || 'A client'} has made a payment for your property.\n\nProperty: ${data.propertyTitle || 'N/A'}\nClient: ${data.clientName || 'N/A'}\nAmount: ${data.currency || 'NGN'} ${data.amount ? parseFloat(data.amount).toLocaleString() : '0'}\nPayment Type: ${data.paymentType === 'rent' ? 'Rent Payment' : 'Application Fee'}\n${data.isEscrow ? 'Escrow Status: Payment held in escrow\n' : ''}${data.escrowExpiresAt ? `Escrow Expires: ${new Date(data.escrowExpiresAt).toLocaleDateString()}\n` : ''}Payment ID: ${data.paymentId?.substring(0, 8) || 'N/A'}\n\nView payment details: ${frontendUrl}/dashboard/landlord/payments`
      };
    },

    paymentReceivedAdmin: (data) => {
      const content = `
        <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 24px;">New Payment Received</h2>
        <p style="color: #6b7280; line-height: 1.6; margin-bottom: 15px;">
          Hi ${data.adminName || 'Admin'},
        </p>
        <p style="color: #6b7280; line-height: 1.6; margin-bottom: 20px;">
          A new payment has been processed on the platform.
        </p>
        <div style="background-color: #eff6ff; border-left: 4px solid #2563eb; padding: 20px; margin: 20px 0; border-radius: 6px;">
          <p style="color: #1e40af; margin: 5px 0; font-weight: 600;">Payment Details:</p>
          <p style="color: #1e40af; margin: 5px 0;"><strong>Property:</strong> ${data.propertyTitle || 'N/A'}</p>
          <p style="color: #1e40af; margin: 5px 0;"><strong>Client:</strong> ${data.clientName || 'N/A'}</p>
          <p style="color: #1e40af; margin: 5px 0;"><strong>Landlord:</strong> ${data.landlordName || 'N/A'}</p>
          <p style="color: #1e40af; margin: 5px 0;"><strong>Amount:</strong> ${data.currency || 'NGN'} ${data.amount ? parseFloat(data.amount).toLocaleString() : '0'}</p>
          <p style="color: #1e40af; margin: 5px 0;"><strong>Payment Type:</strong> ${data.paymentType === 'rent' ? 'Rent Payment' : 'Application Fee'}</p>
          ${data.isEscrow ? `<p style="color: #1e40af; margin: 5px 0;"><strong>Escrow Status:</strong> Payment held in escrow</p>` : ''}
          ${data.escrowExpiresAt ? `<p style="color: #1e40af; margin: 5px 0;"><strong>Escrow Expires:</strong> ${new Date(data.escrowExpiresAt).toLocaleDateString()}</p>` : ''}
          <p style="color: #1e40af; margin: 5px 0;"><strong>Payment ID:</strong> ${data.paymentId?.substring(0, 8) || 'N/A'}</p>
          <p style="color: #1e40af; margin: 5px 0;"><strong>Application ID:</strong> ${data.applicationId?.substring(0, 8) || 'N/A'}</p>
        </div>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${frontendUrl}/dashboard/admin/transactions" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: bold; font-size: 16px;">View Transaction</a>
        </div>
      `;
      return {
        subject: `New Payment Received - ${data.propertyTitle || 'Transaction'}`,
        html: wrapEmailTemplate(content, 'New Payment Received'),
        text: `Hi ${data.adminName || 'Admin'},\n\nA new payment has been processed on the platform.\n\nProperty: ${data.propertyTitle || 'N/A'}\nClient: ${data.clientName || 'N/A'}\nLandlord: ${data.landlordName || 'N/A'}\nAmount: ${data.currency || 'NGN'} ${data.amount ? parseFloat(data.amount).toLocaleString() : '0'}\nPayment Type: ${data.paymentType === 'rent' ? 'Rent Payment' : 'Application Fee'}\n${data.isEscrow ? 'Escrow Status: Payment held in escrow\n' : ''}${data.escrowExpiresAt ? `Escrow Expires: ${new Date(data.escrowExpiresAt).toLocaleDateString()}\n` : ''}Payment ID: ${data.paymentId?.substring(0, 8) || 'N/A'}\nApplication ID: ${data.applicationId?.substring(0, 8) || 'N/A'}\n\nView transaction: ${frontendUrl}/dashboard/admin/transactions`
      };
    }
  };

  return templates[type] ? templates[type](data) : null;
};

/**
 * Check if user has enabled a specific notification type
 */
const checkNotificationPreference = async (userId, notificationType) => {
  try {
    const user = await User.findById(userId).select('preferences');
    
    if (!user) {
      return false; // If user not found, don't send email
    }

    // Check global email notifications setting first
    if (user.preferences?.emailNotifications === false) {
      return false;
    }

    // Map notification types to preference keys
    const preferenceKeyMap = {
      'welcome': 'welcome',
      'newPropertyListed': 'newPropertyListed',
      'applicationReceived': 'applicationReceived',
      'applicationStatusChange': 'applicationStatusChange',
      'newMessage': 'newMessage',
      'viewingAppointment': 'viewingAppointment',
      'maintenanceRequest': 'maintenanceRequest',
      'propertyVerified': 'propertyVerified',
      'kycStatus': 'kycStatus',
      'paymentSuccess': 'paymentSuccess',
      'paymentFailed': 'paymentFailed',
      'escrowReleased': 'escrowReleased'
    };

    const preferenceKey = preferenceKeyMap[notificationType];
    
    if (!preferenceKey) {
      // If notification type not mapped, default to allowing it (for backward compatibility)
      return true;
    }

    // Check specific notification preference (defaults to true if not set)
    const preference = user.preferences?.notificationPreferences?.[preferenceKey];
    return preference !== false; // Default to true if not explicitly set to false
  } catch (error) {
    console.error('Error checking notification preference:', error);
    // On error, default to allowing notification (fail open)
    return true;
  }
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

  // Check user notification preferences
  const canSend = await checkNotificationPreference(data.userId, notificationType);
  
  if (!canSend) {
    console.log(`Email notification skipped: user ${data.userId} has disabled ${notificationType} notifications`);
    return { success: false, error: 'Notification disabled by user preference', skipped: true };
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
  getEmailTemplate,
  checkNotificationPreference
};

