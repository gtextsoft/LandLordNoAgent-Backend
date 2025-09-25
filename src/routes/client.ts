import express from 'express';
import {
  getClientProperties,
  getClientApplications,
  getClientPayments,
  getClientSavedProperties,
  toggleSavedProperty,
  submitClientApplication,
  getClientApplicationStatus,
} from '../controllers/clientController';
import { authenticateToken, requireRole } from '../middleware/auth';
import { validationSchemas } from '../middleware/validation';

const router = express.Router();

// All client routes require authentication and client role
router.use(authenticateToken, requireRole(['CLIENT']));

// Property routes
router.get('/properties', getClientProperties);
router.get('/saved-properties', getClientSavedProperties);
router.post('/saved-properties', toggleSavedProperty);
router.delete('/saved-properties/:id', toggleSavedProperty);

// Application routes
router.get('/applications', getClientApplications);
router.post('/applications', validationSchemas.submitApplication, submitClientApplication);
router.get('/applications/accepted', getClientApplicationStatus);

// Payment routes
router.get('/payments', getClientPayments);
router.get('/payments/status', getClientApplicationStatus);

export default router;
