import { Request, Response, NextFunction } from 'express';
import {
  createNotification,
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  getNotificationStatistics,
  createBulkNotifications,
  sendNotificationToRole,
  CreateNotificationRequest,
  NotificationSearchRequest,
} from '../services/notificationService';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../config/logger';

/**
 * Create a notification
 */
export const createNotificationController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const notificationData: CreateNotificationRequest = req.body;

    // Only admins can create notifications for other users
    if (req.user?.role !== 'ADMIN' && notificationData.userId !== req.user?.userId) {
      return res.status(403).json({
        success: false,
        error: 'You can only create notifications for yourself',
      });
    }

    const result = await createNotification(notificationData);

    return res.status(201).json(result);
  }
);

/**
 * Get user notifications
 */
export const getUserNotificationsController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const searchParams: NotificationSearchRequest = {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 10,
      type: req.query.type as string,
      priority: req.query.priority as string,
      isRead: req.query.isRead ? req.query.isRead === 'true' : undefined,
      sortBy: req.query.sortBy as 'createdAt' | 'priority' || 'createdAt',
      sortOrder: req.query.sortOrder as 'asc' | 'desc' || 'desc',
    };

    const result = await getUserNotifications(userId, searchParams);

    return res.status(200).json(result);
  }
);

/**
 * Mark notification as read
 */
export const markNotificationAsReadController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const result = await markNotificationAsRead(id, userId);

    return res.status(200).json(result);
  }
);

/**
 * Mark all notifications as read
 */
export const markAllNotificationsAsReadController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const result = await markAllNotificationsAsRead(userId);

    return res.status(200).json(result);
  }
);

/**
 * Delete notification
 */
export const deleteNotificationController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const result = await deleteNotification(id, userId);

    return res.status(200).json(result);
  }
);

/**
 * Get notification statistics
 */
export const getNotificationStatisticsController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const result = await getNotificationStatistics(userId);

    return res.status(200).json(result);
  }
);

/**
 * Create bulk notifications (Admin only)
 */
export const createBulkNotificationsController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required',
      });
    }

    const notifications: CreateNotificationRequest[] = req.body.notifications;

    if (!notifications || !Array.isArray(notifications)) {
      return res.status(400).json({
        success: false,
        error: 'Notifications array is required',
      });
    }

    const result = await createBulkNotifications(notifications);

    return res.status(201).json(result);
  }
);

/**
 * Send notification to role (Admin only)
 */
export const sendNotificationToRoleController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required',
      });
    }

    const { role, type, title, message, data, priority } = req.body;

    if (!role || !type || !title || !message) {
      return res.status(400).json({
        success: false,
        error: 'Role, type, title, and message are required',
      });
    }

    const validRoles = ['CLIENT', 'LANDLORD', 'ADMIN'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid role. Must be CLIENT, LANDLORD, or ADMIN',
      });
    }

    const result = await sendNotificationToRole(role, type, title, message, data, priority);

    return res.status(200).json(result);
  }
);

/**
 * Get all notifications (Admin only)
 */
export const getAllNotificationsController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required',
      });
    }

    const searchParams: NotificationSearchRequest = {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 10,
      type: req.query.type as string,
      priority: req.query.priority as string,
      isRead: req.query.isRead ? req.query.isRead === 'true' : undefined,
      sortBy: req.query.sortBy as 'createdAt' | 'priority' || 'createdAt',
      sortOrder: req.query.sortOrder as 'asc' | 'desc' || 'desc',
    };

    // For admin, we don't filter by userId
    const result = await getUserNotifications('', searchParams);

    return res.status(200).json(result);
  }
);

/**
 * Get global notification statistics (Admin only)
 */
export const getGlobalNotificationStatisticsController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required',
      });
    }

    const result = await getNotificationStatistics();

    return res.status(200).json(result);
  }
);
