import express from 'express';
import {
  getPlatformStatisticsController,
  getAllUsersController,
  updateUserStatusController,
  deleteUserController,
  getPlatformAnalyticsController,
  bulkUpdateUsersController,
  getSystemHealthController,
} from '../controllers/adminController';
import { authenticateToken, requireRole } from '../middleware/auth';

const router = express.Router();

// All admin routes require authentication and admin role
router.use(authenticateToken, requireRole(['ADMIN']));

// Platform statistics and analytics
router.get('/statistics', getPlatformStatisticsController);
router.get('/analytics', getPlatformAnalyticsController);
router.get('/health', getSystemHealthController);

// User management
router.get('/users', getAllUsersController);
router.put('/users/:userId/status', updateUserStatusController);
router.delete('/users/:userId', deleteUserController);
router.put('/users/bulk-update', bulkUpdateUsersController);

export default router;
