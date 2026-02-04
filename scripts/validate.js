/**
 * Backend validation script - verifies all modules load without errors.
 * Run before pushing to production: npm run build
 */

require('dotenv').config();

const path = require('path');
const fs = require('fs');

const routeFiles = [
  'auth',
  'users',
  'properties',
  'applications',
  'payments',
  'maintenance',
  'appointments',
  'messages',
  'admin',
  'moderation',
  'upload',
  'email',
  'notifications',
  'reviews',
  'stripe',
  'landlordAccounts',
  'payouts',
  'commission'
];

const routesDir = path.join(__dirname, '../routes');

console.log('🔍 Validating backend...\n');

// 1. Validate route modules
for (const name of routeFiles) {
  const filePath = path.join(routesDir, `${name}.js`);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Route file not found: routes/${name}.js`);
    process.exit(1);
  }
  try {
    require(filePath);
    console.log(`  ✓ routes/${name}.js`);
  } catch (err) {
    console.error(`❌ routes/${name}.js:`, err.message);
    process.exit(1);
  }
}

// 2. Validate main app modules (without starting server)
try {
  require('../models/User');
  require('../models/Property');
  require('../utils/logger');
  console.log('  ✓ core models/utils');
} catch (err) {
  console.error('❌ Core modules:', err.message);
  process.exit(1);
}

// 3. Syntax check server.js
try {
  require('child_process').execSync('node --check server.js', {
    cwd: path.join(__dirname, '..'),
    stdio: 'pipe'
  });
  console.log('  ✓ server.js syntax');
} catch {
  console.error('❌ server.js syntax check failed');
  process.exit(1);
}

console.log('\n✅ Backend validation passed\n');
process.exit(0);
