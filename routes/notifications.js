const express = require('express');
const router = express.Router();
const { Resend } = require('resend');

const resendApiKey = process.env.RESEND_API_KEY;
const fromAddress = process.env.EMAIL_FROM || 'no-reply@landlordnoagent.app';

/**
 * POST /api/notifications/payment-received
 * Send payment received notification to landlord
 */
router.post('/payment-received', async (req, res) => {
  try {
    const { paymentId } = req.body;

    if (!paymentId) {
      return res.status(400).json({ error: 'Missing payment ID' });
    }

    // TODO: Replace with MongoDB payment lookup
    console.log('Processing payment notification for payment:', paymentId);

    // Simulate payment data (replace with MongoDB query)
    const payment = {
      id: paymentId,
      amount: 12000,
      currency: 'ngn',
      landlord_id: 'landlord_123',
      client_id: 'client_123',
      updated_at: new Date().toISOString(),
      commission_amount: 1200,
      landlord_amount: 10800,
      landlord: {
        email: 'landlord@example.com',
        full_name: 'Jane Smith',
      },
      application: {
        client: {
          full_name: 'John Doe',
        },
        property: {
          title: 'Beautiful Apartment',
          id: 'prop_123',
        },
      },
    };

    // Send email notification to landlord
    try {
      if (resendApiKey) {
        const resend = new Resend(resendApiKey);
        await resend.emails.send({
          from: fromAddress,
          to: payment.landlord?.email || '',
          subject: `Payment Received - ${payment.application?.property?.title}`,
          html: `
            <p>Hi ${payment.landlord?.full_name || 'Landlord'},</p>
            <p>You have received a payment of ${payment.currency.toUpperCase()} ${(payment.amount / 100).toFixed(2)} from ${payment.application?.client?.full_name || 'Client'} for ${payment.application?.property?.title}.</p>
            <p><strong>Receipt Number:</strong> RCT-${payment.id.substring(0, 8).toUpperCase()}</p>
            <p><strong>Payment Date:</strong> ${new Date(payment.updated_at).toLocaleDateString()}</p>
            <p><strong>Commission:</strong> ${payment.currency.toUpperCase()} ${((payment.commission_amount || 0) / 100).toFixed(2)}</p>
            <p><strong>Your Amount:</strong> ${payment.currency.toUpperCase()} ${((payment.landlord_amount || payment.amount) / 100).toFixed(2)}</p>
            <p>Thank you for using LandLordNoAgent!</p>
          `,
          text: `Payment received from ${payment.application?.client?.full_name} for ${payment.application?.property?.title}.`,
        });
        console.log('Payment notification sent to landlord:', payment.landlord?.email);
      } else {
        console.warn('RESEND_API_KEY not set, skipping email notification');
      }
    } catch (emailError) {
      console.error('Failed to send email notification:', emailError);
      // Don't fail the request if email fails
    }

    // TODO: Create in-app notification in MongoDB
    console.log('Creating in-app notification for landlord:', payment.landlord_id);

    res.json({
      success: true,
      message: 'Landlord notified successfully',
    });
  } catch (error) {
    console.error('Notification error:', error);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

module.exports = router;

