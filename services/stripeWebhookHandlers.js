const Payment = require('../models/Payment');
const Application = require('../models/Application');
const Property = require('../models/Property');
const { sendEmail, getUserEmail, getEmailTemplate } = require('../utils/emailNotifications');
const { createAuditLog } = require('../utils/auditLogger');

/**
 * Shared Stripe webhook handlers.
 *
 * Why this exists:
 * - We currently have Stripe logic duplicated across `routes/payments.js` and `routes/stripe.js`.
 * - Webhooks can be delivered more than once, and "confirm" endpoints can race with webhooks.
 * - These handlers are written to be idempotent (safe to run multiple times).
 */

// 10 days escrow hold window (used across flows)
const ESCROW_HOLD_DAYS = 10;

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const addMonths = (date, months) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
};

/**
 * Compute rent period (start, end) for a rent payment.
 * Uses application preferences and last completed rent payment for the application.
 */
async function computeRentPeriod(applicationId, application) {
  const leaseMonths = application.preferences?.leaseLength
    ?? application.preferences?.leaseDuration
    ?? application.property?.leaseTerms?.minLease
    ?? application.property?.leaseTerms?.maxLease
    ?? 12;
  const moveIn = application.preferences?.moveInDate
    ? new Date(application.preferences.moveInDate)
    : application.reviewedAt
      ? new Date(application.reviewedAt)
      : new Date();

  const lastRent = await Payment.findOne({
    application: applicationId,
    type: 'rent',
    status: 'completed',
    rentPeriodEnd: { $exists: true, $ne: null }
  })
    .sort({ rentPeriodEnd: -1 })
    .select('rentPeriodEnd')
    .lean();

  let periodStart;
  if (lastRent && lastRent.rentPeriodEnd) {
    periodStart = new Date(lastRent.rentPeriodEnd);
    // Start next period the day after previous end
    periodStart.setDate(periodStart.getDate() + 1);
  } else {
    periodStart = new Date(moveIn);
    periodStart.setHours(0, 0, 0, 0);
  }

  const periodEnd = addMonths(periodStart, leaseMonths);
  periodEnd.setDate(periodEnd.getDate() - 1); // Last day of period (inclusive end of month)
  return { periodStart, periodEnd };
}

const normalizeCurrency = (currency) => {
  if (!currency) return 'NGN';
  return String(currency).toUpperCase();
};

/**
 * Process a completed Stripe Checkout Session.
 * Creates the Payment record exactly once and updates related Application/Property state.
 *
 * @param {object} session Stripe checkout.session object
 * @returns {Promise<import('mongoose').Document|null>}
 */
async function handleCheckoutSessionCompleted(session) {
  try {
    const sessionId = session?.id;
    const paymentIntentId = session?.payment_intent;
    const metadata = session?.metadata || {};

    const applicationId = metadata.applicationId;
    const userIdFromMetadata = metadata.userId;
    const type = metadata.type; // 'rent' | 'application_fee' | etc

    if (!sessionId) {
      console.error('handleCheckoutSessionCompleted: missing session.id');
      return null;
    }

    if (!applicationId) {
      console.error('handleCheckoutSessionCompleted: missing metadata.applicationId', {
        sessionId,
        metadataKeys: Object.keys(metadata || {})
      });
      return null;
    }

    // Idempotency guard: if we already have a Payment for this session or intent, do nothing.
    const existing = await Payment.findOne({
      $or: [
        { stripeSessionId: sessionId },
        ...(paymentIntentId ? [{ stripePaymentIntentId: paymentIntentId }] : [])
      ]
    });
    if (existing) return existing;

    // Load application (needed to determine escrow, rent period, and to infer userId if metadata is missing).
    const application = await Application.findById(applicationId)
      .populate('property', 'title rentalType')
      .populate('client', '_id email firstName lastName')
      .populate('landlord', '_id email firstName lastName')

    if (!application) {
      console.error('handleCheckoutSessionCompleted: application not found', { applicationId, sessionId });
      return null;
    }

    const userId = userIdFromMetadata || application.client?._id;
    if (!userId) {
      console.error('handleCheckoutSessionCompleted: cannot determine userId', { applicationId, sessionId });
      return null;
    }

    const isRentPayment =
      type === 'rent' ||
      application.status === 'approved' ||
      application.status === 'accepted';

    const escrowExpiresAt = addDays(new Date(), ESCROW_HOLD_DAYS);

    // Compute rent period for rent payments (used for expiration tracking)
    let rentPeriodStart = null;
    let rentPeriodEnd = null;
    if (isRentPayment) {
      try {
        const period = await computeRentPeriod(applicationId, application);
        rentPeriodStart = period.periodStart;
        rentPeriodEnd = period.periodEnd;
      } catch (err) {
        console.error('computeRentPeriod error (using fallback):', err);
        rentPeriodStart = new Date();
        rentPeriodEnd = addMonths(new Date(), 1);
      }
    }

    // Generate payment description
    const paymentDescription = isRentPayment
      ? `Rent payment for property: ${application.property?.title || 'Property'}. Payment will be held in escrow until property visit and document handover.`
      : `Application fee for property: ${application.property?.title || 'Property'}`;

    const paymentDoc = {
      application: applicationId,
      user: userId,
      amount: (session.amount_total || 0) / 100, // Stripe uses cents
      currency: normalizeCurrency(session.currency),
      stripePaymentIntentId: paymentIntentId,
      stripeSessionId: sessionId,
      stripeChargeId: session.payment_intent ? null : null, // Will be populated from payment intent if available
      status: 'completed',
      type: isRentPayment ? 'rent' : (type || 'application_fee'),
      description: paymentDescription,
      isEscrow: isRentPayment,
      escrowStatus: isRentPayment ? 'held' : null,
      escrowHeldAt: isRentPayment ? new Date() : null,
      escrowExpiresAt: isRentPayment ? escrowExpiresAt : null,
      rentPeriodStart: isRentPayment ? rentPeriodStart : undefined,
      rentPeriodEnd: isRentPayment ? rentPeriodEnd : undefined,
      // Commission is applied when escrow is released (uses PlatformSettings at that time).
      commission_rate: 0,
      commission_amount: 0
    };

    // Create the Payment record with an upsert to minimize race conditions.
    // If another request creates it first, this will simply return the existing one.
    const payment = await Payment.findOneAndUpdate(
      { stripeSessionId: sessionId },
      { $setOnInsert: paymentDoc },
      { upsert: true, new: true }
    );

    // Update application payment status for application fees.
    if (type === 'application_fee') {
      await Application.findByIdAndUpdate(applicationId, {
        'applicationFee.paid': true,
        'applicationFee.paymentId': paymentIntentId,
        'applicationFee.paidAt': new Date()
      });
    }

    // Mark property unavailable after completed rent payment.
    if (isRentPayment && application.property) {
      await Property.findByIdAndUpdate(application.property._id || application.property, {
        isAvailable: false
      });
    }

    // Send payment success email notification to client
    try {
      const clientEmail = application.client?.email;
      if (clientEmail) {
        const template = getEmailTemplate('paymentSuccess', {
          clientName: application.client?.firstName || 'Client',
          propertyTitle: application.property?.title || 'Property',
          amount: payment.amount,
          currency: payment.currency,
          paymentType: payment.type,
          isEscrow: payment.isEscrow,
          escrowExpiresAt: payment.escrowExpiresAt,
          paymentId: payment._id.toString()
        });
        
        if (template) {
          await sendEmail(clientEmail, template.subject, template.html, template.text);
          console.log(`Payment success email sent to ${clientEmail} for payment ${payment._id}`);
        }
      }
    } catch (emailError) {
      // Don't fail the payment if email fails
      console.error('Error sending payment success email:', emailError);
    }

    // Send email and in-app notification to landlord
    try {
      const landlordId = application.landlord?._id || application.landlord;
      const landlordEmail = application.landlord?.email;
      const landlordName = application.landlord?.firstName 
        ? `${application.landlord.firstName} ${application.landlord.lastName || ''}`.trim()
        : 'Landlord';
      const clientName = application.client?.firstName 
        ? `${application.client.firstName} ${application.client.lastName || ''}`.trim()
        : 'Client';

      if (landlordId) {
        const { createNotification } = require('../utils/notifications');
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

        // Create in-app notification for landlord
        await createNotification({
          userId: landlordId,
          type: 'payment_received',
          title: 'Payment Received',
          message: `${clientName} has made a payment of ${payment.currency || 'NGN'} ${payment.amount.toLocaleString()} for ${application.property?.title || 'your property'}.${payment.isEscrow ? ' Payment is held in escrow until property visit.' : ''}`,
          priority: 'high',
          relatedEntity: {
            type: 'payment',
            id: payment._id
          },
          actionUrl: `${frontendUrl}/dashboard/landlord/payments`,
          sendEmail: true,
          emailTemplate: 'paymentReceivedLandlord',
          emailData: {
            landlordName,
            clientName,
            propertyTitle: application.property?.title || 'Property',
            amount: payment.amount,
            currency: payment.currency,
            paymentType: payment.type,
            isEscrow: payment.isEscrow,
            escrowExpiresAt: payment.escrowExpiresAt,
            paymentId: payment._id.toString()
          }
        });

        console.log(`Payment notification sent to landlord ${landlordId} for payment ${payment._id}`);
      }
    } catch (landlordNotifyError) {
      // Don't fail the payment if notification fails
      console.error('Error sending landlord payment notification:', landlordNotifyError);
    }

    // Send email and in-app notification to all admins
    try {
      const { notifyAdmins } = require('../utils/notifications');
      const clientName = application.client?.firstName 
        ? `${application.client.firstName} ${application.client.lastName || ''}`.trim()
        : 'Client';
      const landlordName = application.landlord?.firstName 
        ? `${application.landlord.firstName} ${application.landlord.lastName || ''}`.trim()
        : 'Landlord';
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

      // Create in-app notifications for all admins
      await notifyAdmins(
        'New Payment Received',
        `${clientName} has made a payment of ${payment.currency || 'NGN'} ${payment.amount.toLocaleString()} for property "${application.property?.title || 'N/A'}" (Landlord: ${landlordName}).${payment.isEscrow ? ' Payment is held in escrow.' : ''}`,
        'high',
        `${frontendUrl}/dashboard/admin/transactions`,
        {
          paymentId: payment._id.toString(),
          applicationId: applicationId.toString(),
          amount: payment.amount,
          currency: payment.currency
        }
      );

      // Send email notifications to all admins
      const User = require('../models/User');
      const admins = await User.find({ role: 'admin' }).select('_id email firstName lastName');
      
      for (const admin of admins) {
        try {
          const adminEmail = admin.email;
          const adminName = admin.firstName 
            ? `${admin.firstName} ${admin.lastName || ''}`.trim()
            : 'Admin';

          if (adminEmail) {
            const template = getEmailTemplate('paymentReceivedAdmin', {
              adminName,
              clientName,
              landlordName,
              propertyTitle: application.property?.title || 'Property',
              amount: payment.amount,
              currency: payment.currency,
              paymentType: payment.type,
              isEscrow: payment.isEscrow,
              escrowExpiresAt: payment.escrowExpiresAt,
              paymentId: payment._id.toString(),
              applicationId: applicationId.toString()
            });
            
            if (template) {
              await sendEmail(adminEmail, template.subject, template.html, template.text);
              console.log(`Payment notification email sent to admin ${adminEmail} for payment ${payment._id}`);
            }
          }
        } catch (adminEmailError) {
          console.error(`Error sending email to admin ${admin._id}:`, adminEmailError);
          // Continue with other admins
        }
      }
    } catch (adminNotifyError) {
      // Don't fail the payment if admin notification fails
      console.error('Error sending admin payment notification:', adminNotifyError);
    }

    // Audit log: Payment created/completed
    try {
      await createAuditLog({
        action: 'payment_created',
        entityType: 'Payment',
        entityId: payment._id,
        userId: userId,
        details: {
          paymentId: payment._id.toString(),
          applicationId: applicationId,
          amount: payment.amount,
          currency: payment.currency,
          type: payment.type,
          status: payment.status,
          isEscrow: payment.isEscrow,
          stripeSessionId: sessionId
        },
        ipAddress: null, // Webhook doesn't have IP
        userAgent: null // Webhook doesn't have user agent
      });
    } catch (auditError) {
      console.error('Error creating payment audit log:', auditError);
      // Don't fail payment creation if audit log fails
    }

    return payment;
  } catch (error) {
    console.error('handleCheckoutSessionCompleted error:', error);
    return null;
  }
}

/**
 * Mark a payment completed if we can find it by payment intent.
 * Note: we can't upsert here because Payment requires application/user/type.
 */
async function handlePaymentIntentSucceeded(paymentIntent) {
  try {
    const id = paymentIntent?.id;
    if (!id) return;
    await Payment.findOneAndUpdate(
      { stripePaymentIntentId: id },
      { status: 'completed' }
    );
  } catch (error) {
    console.error('handlePaymentIntentSucceeded error:', error);
  }
}

/**
 * Mark a payment failed if we can find it by payment intent.
 */
async function handlePaymentIntentFailed(paymentIntent) {
  try {
    const id = paymentIntent?.id;
    if (!id) return;
    
    const payment = await Payment.findOneAndUpdate(
      { stripePaymentIntentId: id },
      {
        status: 'failed',
        failureReason: paymentIntent?.last_payment_error?.message,
        failureCode: paymentIntent?.last_payment_error?.code
      }
    ).populate('application', 'property client');

    // Send payment failed email notification to client
    if (payment && payment.application) {
      try {
        const clientEmail = payment.application.client?.email;
        if (clientEmail) {
          const template = getEmailTemplate('paymentFailed', {
            clientName: payment.application.client?.firstName || 'Client',
            propertyTitle: payment.application.property?.title || 'Property',
            amount: payment.amount,
            currency: payment.currency,
            failureReason: paymentIntent?.last_payment_error?.message || 'Payment processing failed',
            applicationId: payment.application._id?.toString()
          });
          
          if (template) {
            await sendEmail(clientEmail, template.subject, template.html, template.text);
            console.log(`Payment failed email sent to ${clientEmail} for payment ${payment._id}`);
          }
        }
      } catch (emailError) {
        // Don't fail the handler if email fails
        console.error('Error sending payment failed email:', emailError);
      }
    }

    // Audit log: Payment failed
    if (payment && payment.user) {
      try {
        await createAuditLog({
          action: 'payment_failed',
          entityType: 'Payment',
          entityId: payment._id,
          userId: payment.user._id || payment.user,
          details: {
            paymentId: payment._id.toString(),
            stripePaymentIntentId: id,
            failureReason: paymentIntent?.last_payment_error?.message,
            failureCode: paymentIntent?.last_payment_error?.code
          },
          ipAddress: null,
          userAgent: null
        });
      } catch (auditError) {
        console.error('Error creating payment audit log:', auditError);
      }
    }
  } catch (error) {
    console.error('handlePaymentIntentFailed error:', error);
  }
}

module.exports = {
  handleCheckoutSessionCompleted,
  handlePaymentIntentSucceeded,
  handlePaymentIntentFailed
};

