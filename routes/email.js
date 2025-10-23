const express = require('express');
const router = express.Router();
const { Resend } = require('resend');

// Initialize Resend
const resendApiKey = process.env.RESEND_API_KEY;
const fromAddress = process.env.EMAIL_FROM || 'no-reply@landlordnoagent.app';

/**
 * POST /api/email/send
 * Send email using Resend service
 */
router.post('/send', async (req, res) => {
  try {
    const { type, to, data, options } = req.body;

    // Validate required fields
    if (!type || !to || !data) {
      return res.status(400).json({ error: 'Missing required fields (type, to, data)' });
    }

    // Compose email content
    const { subject, html, text } = composeEmail(type, data);

    // If no Resend key, log and mock (useful for dev)
    if (!resendApiKey) {
      console.warn('[Email] RESEND_API_KEY not set. Logging email instead of sending.', { type, to });
      console.info('[Email] Subject:', subject);
      console.info('[Email] Text:', text);
      return res.json({ success: true, mocked: true });
    }

    // Send email via Resend
    const resend = new Resend(resendApiKey);
    const result = await resend.emails.send({
      from: fromAddress,
      to,
      subject,
      text,
      html,
    });

    if (result.error) {
      console.error('[Email] Send error:', result.error);
      return res.status(500).json({ error: 'Failed to send email' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[Email] API error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function to compose emails from templates
function composeEmail(type, data) {
  const template = getServerTemplates()[type];
  
  if (!template) {
    return {
      subject: 'LandLordNoAgent Notification',
      html: `<p>Notification: ${type}</p>`,
      text: `Notification: ${type}`,
    };
  }

  const replaceAll = (content) =>
    Object.entries(data).reduce(
      (acc, [k, v]) => acc.replace(new RegExp(`{{${k}}}`, 'g'), String(v)),
      content
    );

  return {
    subject: replaceAll(template.subject),
    html: replaceAll(template.html),
    text: replaceAll(template.text),
  };
}

// Email templates
function getServerTemplates() {
  return {
    welcome: {
      subject: 'Welcome to LandLordNoAgent - Your Rental Platform',
      html: '<p>Welcome, {{name}}. Your role is {{role}}. Visit {{dashboardUrl}}</p>',
      text: 'Welcome, {{name}}. Your role is {{role}}. Visit {{dashboardUrl}}',
    },
    application_received: {
      subject: 'New Application Received - {{propertyTitle}}',
      html: '<p>You received a new application for {{propertyTitle}} from {{applicantName}}.</p>',
      text: 'You received a new application for {{propertyTitle}} from {{applicantName}}.',
    },
    application_accepted: {
      subject: 'Application Accepted - {{propertyTitle}}',
      html: '<p>Your application for {{propertyTitle}} was accepted.</p>',
      text: 'Your application for {{propertyTitle}} was accepted.',
    },
    application_rejected: {
      subject: 'Application Update - {{propertyTitle}}',
      html: '<p>Your application for {{propertyTitle}} was not selected.</p>',
      text: 'Your application for {{propertyTitle}} was not selected.',
    },
    property_verified: {
      subject: 'Property Verified - {{propertyTitle}}',
      html: '<p>Your property {{propertyTitle}} is now live.</p>',
      text: 'Your property {{propertyTitle}} is now live.',
    },
    property_rejected: {
      subject: 'Property Review Required - {{propertyTitle}}',
      html: '<p>Your property {{propertyTitle}} needs updates: {{rejectionReason}}</p>',
      text: 'Your property {{propertyTitle}} needs updates: {{rejectionReason}}',
    },
    password_reset: {
      subject: 'Reset Your Password - LandLordNoAgent',
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Password Reset</title></head><body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f8fafc;"><div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;"><div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 40px 20px; text-align: center;"><h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">LandLordNoAgent</h1><p style="color: #e0e7ff; margin: 8px 0 0 0; font-size: 16px;">The future of long-term rentals</p></div><div style="padding: 40px 30px;"><h2 style="color: #1f2937; margin: 0 0 10px 0;">Reset Your Password</h2><p style="color: #6b7280;">Click the button below to create a new password.</p><div style="text-align: center; margin: 30px 0;"><a href="{{resetUrl}}" style="display: inline-block; background-color: #3b82f6; color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: bold;">Reset My Password</a></div><p style="color: #6b7280; font-size: 14px;">This link expires in 1 hour. If you didn't request this, please ignore this email.</p></div></div></body></html>`,
      text: 'Reset Your Password - LandLordNoAgent\n\nClick the link below to create a new password:\n{{resetUrl}}\n\nThis link expires in 1 hour.',
    },
    verification_required: {
      subject: 'Verification Required - Complete Your Profile',
      html: '<p>Complete verification: {{profileUrl}}</p>',
      text: 'Complete verification: {{profileUrl}}',
    },
    payment_received: {
      subject: 'Payment Received - {{property_title}}',
      html: '<p>Hi {{landlord_name}}, you received a payment of {{currency}} {{amount}} from {{client_name}} for {{property_title}}.</p>',
      text: 'Hi {{landlord_name}}, you received a payment of {{currency}} {{amount}} from {{client_name}} for {{property_title}}.',
    },
  };
}

module.exports = router;

