const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

/**
 * GET /api/health/database
 * Check database connection and health
 */
router.get('/database', async (req, res) => {
  try {
    // Check MongoDB connection status
    const isConnected = mongoose.connection.readyState === 1;
    
    // Get list of collections
    let tablesCount = 0;
    let collections = [];
    
    if (isConnected) {
      collections = await mongoose.connection.db.listCollections().toArray();
      tablesCount = collections.length;
    }

    // Define required collections
    const requiredCollections = [
      'users',
      'properties',
      'applications',
      'payments',
      'maintenancerequests',
      'viewingappointments',
      'messages',
      'notifications'
    ];

    // Check if required collections exist
    const collectionNames = collections.map(c => c.name.toLowerCase());
    const hasRequiredTables = requiredCollections.every(name => 
      collectionNames.includes(name.toLowerCase())
    );

    const status = {
      isConnected,
      tablesCount,
      hasRequiredTables,
      collections: collectionNames,
      errors: isConnected ? [] : ['Database not connected'],
    };

    res.json({
      success: isConnected,
      database: status,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Database health check failed:', error);

    res.status(500).json({
      success: false,
      error: error.message || 'Unknown error',
      database: {
        isConnected: false,
        tablesCount: 0,
        hasRequiredTables: false,
        errors: [error.message || 'Unknown error'],
      },
      timestamp: new Date().toISOString(),
    });
  }
});

module.exports = router;

