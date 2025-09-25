import express from 'express';
import {
  submitKycController,
  getKycController,
  verifyKycController,
  getPendingKycController,
  getKycStatisticsController,
  updateKycDocumentController,
} from '../controllers/kycController';
import { authenticateToken, requireRole } from '../middleware/auth';
import { validationSchemas } from '../middleware/validation';

const router = express.Router();

// Client routes
router.post('/', authenticateToken, requireRole(['CLIENT']), validationSchemas.submitKyc, submitKycController);
router.get('/', authenticateToken, requireRole(['CLIENT']), getKycController);

// Admin routes
router.get('/admin/pending', authenticateToken, requireRole(['ADMIN']), getPendingKycController);
router.get('/admin/statistics', authenticateToken, requireRole(['ADMIN']), getKycStatisticsController);
router.put('/admin/:userId/verify', authenticateToken, requireRole(['ADMIN']), verifyKycController);
router.put('/admin/:userId/documents/:documentType', authenticateToken, requireRole(['ADMIN']), updateKycDocumentController);

export default router;
