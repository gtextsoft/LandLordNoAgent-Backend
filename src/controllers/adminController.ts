import { Request, Response, NextFunction } from 'express';
import {
  getPlatformStatistics,
  getAllUsers,
  updateUserStatus,
  deleteUser,
  getPlatformAnalytics,
  bulkUpdateUsers,
  getSystemHealth,
} from '../services/adminService';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../config/logger';

/**
 * Get platform statistics
 */
export const getPlatformStatisticsController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required',
      });
    }

    const result = await getPlatformStatistics();

    return res.status(200).json(result);
  }
);

/**
 * Get all users
 */
export const getAllUsersController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required',
      });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const role = req.query.role as string;
    const isVerified = req.query.isVerified ? req.query.isVerified === 'true' : undefined;

    const result = await getAllUsers(page, limit, role, isVerified);

    return res.status(200).json(result);
  }
);

/**
 * Update user status
 */
export const updateUserStatusController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required',
      });
    }

    const { userId } = req.params;
    const { isVerified } = req.body;
    const adminId = req.user?.userId;

    if (typeof isVerified !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'isVerified must be a boolean value',
      });
    }

    const result = await updateUserStatus(userId, isVerified, adminId!);

    return res.status(200).json(result);
  }
);

/**
 * Delete user
 */
export const deleteUserController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required',
      });
    }

    const { userId } = req.params;
    const adminId = req.user?.userId;

    const result = await deleteUser(userId, adminId!);

    return res.status(200).json(result);
  }
);

/**
 * Get platform analytics
 */
export const getPlatformAnalyticsController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required',
      });
    }

    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    const result = await getPlatformAnalytics(startDate, endDate);

    return res.status(200).json(result);
  }
);

/**
 * Bulk update users
 */
export const bulkUpdateUsersController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required',
      });
    }

    const { userIds, updates } = req.body;
    const adminId = req.user?.userId;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'userIds must be a non-empty array',
      });
    }

    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'updates must be an object',
      });
    }

    const result = await bulkUpdateUsers(userIds, updates, adminId!);

    return res.status(200).json(result);
  }
);

/**
 * Get system health
 */
export const getSystemHealthController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required',
      });
    }

    const result = await getSystemHealth();

    return res.status(200).json(result);
  }
);
