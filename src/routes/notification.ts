import express from 'express';
import {
  createNotificationController,
  getUserNotificationsController,
  markNotificationAsReadController,
  markAllNotificationsAsReadController,
  deleteNotificationController,
  getNotificationStatisticsController,
  createBulkNotificationsController,
  sendNotificationToRoleController,
  getAllNotificationsController,
  getGlobalNotificationStatisticsController,
} from '../controllers/notificationController';
import { authenticateToken, requireRole } from '../middleware/auth';
import { validationSchemas } from '../middleware/validation';

const router = express.Router();

// User routes
router.get('/', authenticateToken, getUserNotificationsController);
router.post('/', authenticateToken, validationSchemas.createNotification, createNotificationController);
router.put('/:id/read', authenticateToken, markNotificationAsReadController);
router.put('/read-all', authenticateToken, markAllNotificationsAsReadController);
router.delete('/:id', authenticateToken, deleteNotificationController);
router.get('/statistics', authenticateToken, getNotificationStatisticsController);

// Admin routes
router.get('/admin/all', authenticateToken, requireRole(['ADMIN']), getAllNotificationsController);
router.post('/admin/bulk', authenticateToken, requireRole(['ADMIN']), createBulkNotificationsController);
router.post('/admin/send-to-role', authenticateToken, requireRole(['ADMIN']), sendNotificationToRoleController);
router.get('/admin/statistics', authenticateToken, requireRole(['ADMIN']), getGlobalNotificationStatisticsController);

export default router;
