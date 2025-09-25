import express from 'express';
import {
  submitApplicationController,
  getApplicationController,
  updateApplicationStatusController,
  getApplicationsController,
  cancelApplicationController,
  getApplicationStatisticsController,
  getPropertyApplicationsController,
  getAllApplicationsController,
} from '../controllers/applicationController';
import { authenticateToken, requireRole } from '../middleware/auth';
import { validationSchemas } from '../middleware/validation';

const router = express.Router();

// Client routes
router.post('/', authenticateToken, requireRole(['CLIENT']), validationSchemas.submitApplication, submitApplicationController);
router.get('/my-applications', authenticateToken, requireRole(['CLIENT']), getApplicationsController);
router.put('/:id/cancel', authenticateToken, requireRole(['CLIENT']), validationSchemas.applicationParams, cancelApplicationController);
router.get('/statistics', authenticateToken, requireRole(['CLIENT']), getApplicationStatisticsController);

// Landlord routes
router.get('/landlord/my-applications', authenticateToken, requireRole(['LANDLORD']), getApplicationsController);
router.put('/:id/status', authenticateToken, requireRole(['LANDLORD']), validationSchemas.applicationParams, updateApplicationStatusController);
router.get('/landlord/statistics', authenticateToken, requireRole(['LANDLORD']), getApplicationStatisticsController);
router.get('/property/:propertyId', authenticateToken, requireRole(['LANDLORD']), validationSchemas.propertyApplicationParams, getPropertyApplicationsController);

// Admin routes
router.get('/admin/all', authenticateToken, requireRole(['ADMIN']), getAllApplicationsController);
router.put('/admin/:id/status', authenticateToken, requireRole(['ADMIN']), validationSchemas.applicationParams, updateApplicationStatusController);
router.get('/admin/statistics', authenticateToken, requireRole(['ADMIN']), getApplicationStatisticsController);

// Shared routes (accessible by all authenticated users)
router.get('/:id', authenticateToken, validationSchemas.applicationParams, getApplicationController);

export default router;
