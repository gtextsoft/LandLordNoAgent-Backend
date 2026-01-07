/**
 * Payments E2E Smoke (DB-level)
 *
 * This script validates the critical payment persistence logic without calling Stripe:
 * - webhook handler idempotency (same checkout.session.completed processed twice)
 * - payment status updates (payment_intent.*)
 * - escrow initialization for rent payments
 *
 * Usage (PowerShell):
 *   cd LLNAB
 *   $env:MONGODB_URI="mongodb://localhost:27017/landlord-no-agent"
 *   node scripts/payments_e2e_smoke.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const User = require('../models/User');
const Property = require('../models/Property');
const Application = require('../models/Application');
const Payment = require('../models/Payment');

const {
  handleCheckoutSessionCompleted,
  handlePaymentIntentSucceeded,
  handlePaymentIntentFailed
} = require('../services/stripeWebhookHandlers');

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI is required to run this smoke test.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  console.log('✅ Connected to MongoDB');

  const suffix = Date.now();

  const landlord = await User.create({
    email: `landlord_${suffix}@example.com`,
    password: 'Password123!',
    role: 'landlord',
    firstName: 'Land',
    lastName: 'Lord'
  });

  const client = await User.create({
    email: `client_${suffix}@example.com`,
    password: 'Password123!',
    role: 'client',
    firstName: 'Cli',
    lastName: 'Ent'
  });

  const property = await Property.create({
    landlord: landlord._id,
    title: 'Test Property',
    description: 'Smoke test property',
    price: 100000,
    currency: 'NGN',
    propertyType: 'apartment',
    rentalType: 'long-term',
    bedrooms: 1,
    bathrooms: 1,
    address: {
      street: '1 Test St',
      city: 'Lagos',
      state: 'Lagos',
      zipCode: '100001',
      country: 'NG'
    },
    images: []
  });

  // A second property is required because Applications enforce a unique index on (client, property).
  const property2 = await Property.create({
    landlord: landlord._id,
    title: 'Test Property 2',
    description: 'Smoke test property (rent scenario)',
    price: 120000,
    currency: 'NGN',
    propertyType: 'apartment',
    rentalType: 'long-term',
    bedrooms: 1,
    bathrooms: 1,
    address: {
      street: '2 Test St',
      city: 'Lagos',
      state: 'Lagos',
      zipCode: '100001',
      country: 'NG'
    },
    images: []
  });

  const appFeeApplication = await Application.create({
    property: property._id,
    client: client._id,
    landlord: landlord._id,
    status: 'pending',
    applicationFee: { amount: 5000 }
  });

  const rentApplication = await Application.create({
    property: property2._id,
    client: client._id,
    landlord: landlord._id,
    status: 'approved',
    applicationFee: { amount: 5000 }
  });

  // --- Application fee payment ---
  const feeSession = {
    id: `cs_test_fee_${suffix}`,
    payment_intent: `pi_test_fee_${suffix}`,
    amount_total: 5000 * 100,
    currency: 'ngn',
    metadata: {
      applicationId: String(appFeeApplication._id),
      userId: String(client._id),
      type: 'application_fee'
    }
  };

  await handleCheckoutSessionCompleted(feeSession);
  await handleCheckoutSessionCompleted(feeSession); // idempotency: should not create a second payment

  const feePayments = await Payment.find({ stripeSessionId: feeSession.id });
  assert(feePayments.length === 1, 'application_fee should create exactly 1 payment (idempotent)');
  assert(feePayments[0].status === 'completed', 'application_fee payment should be completed');

  const refreshedAppFeeApplication = await Application.findById(appFeeApplication._id);
  assert(!!refreshedAppFeeApplication.applicationFee.paid, 'applicationFee.paid should be true after payment');

  // --- Rent payment escrow ---
  const rentSession = {
    id: `cs_test_rent_${suffix}`,
    payment_intent: `pi_test_rent_${suffix}`,
    amount_total: 100000 * 100,
    currency: 'ngn',
    metadata: {
      applicationId: String(rentApplication._id),
      userId: String(client._id),
      type: 'rent'
    }
  };

  await handleCheckoutSessionCompleted(rentSession);
  const rentPayment = await Payment.findOne({ stripeSessionId: rentSession.id });
  assert(!!rentPayment, 'rent payment should exist');
  assert(rentPayment.isEscrow === true, 'rent payment should be escrow');
  assert(rentPayment.escrowStatus === 'held', 'rent escrowStatus should be held');
  assert(!!rentPayment.escrowExpiresAt, 'rent escrowExpiresAt should be set');

  // --- payment_intent update paths ---
  await handlePaymentIntentFailed({ id: rentSession.payment_intent, last_payment_error: { message: 'fail', code: 'failed' } });
  const failedRentPayment = await Payment.findOne({ stripePaymentIntentId: rentSession.payment_intent });
  assert(failedRentPayment.status === 'failed', 'payment_intent.payment_failed should set status failed');

  await handlePaymentIntentSucceeded({ id: rentSession.payment_intent });
  const succeededRentPayment = await Payment.findOne({ stripePaymentIntentId: rentSession.payment_intent });
  assert(succeededRentPayment.status === 'completed', 'payment_intent.succeeded should set status completed');

  console.log('✅ Payments E2E smoke checks passed');
  console.log('Created records:', {
    landlord: String(landlord._id),
    client: String(client._id),
    property: String(property._id),
    property2: String(property2._id),
    applicationFeeApplication: String(appFeeApplication._id),
    rentApplication: String(rentApplication._id)
  });
}

main()
  .catch((err) => {
    console.error('❌ Payments E2E smoke failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.disconnect();
    } catch {}
  });

