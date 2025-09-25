import Notification, { INotification } from '../models/Notification';
import User from '../models/User';
import { ApiResponse } from '../types';
import { logger } from '../config/logger';
import { NotFoundError, ValidationError } from '../middleware/errorHandler';

// Notification creation interface
export interface CreateNotificationRequest {
  userId: string;
  type: string;
  title: string;
  message: string;
  data?: any;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
}

// Notification search interface
export interface NotificationSearchRequest {
  page?: number;
  limit?: number;
  type?: string;
  priority?: string;
  isRead?: boolean;
  sortBy?: 'createdAt' | 'priority';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Create a new notification
 */
export async function createNotification(
  notificationData: CreateNotificationRequest
): Promise<ApiResponse<INotification>> {
  try {
    // Verify user exists
    const user = await User.findById(notificationData.userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Create notification
    const notification = new Notification({
      userId: notificationData.userId,
      type: notificationData.type,
      title: notificationData.title,
      message: notificationData.message,
      data: notificationData.data || {},
      priority: notificationData.priority || 'MEDIUM',
      isRead: false,
    });

    await notification.save();

    logger.info(`Notification created: ${notification._id} for user: ${notificationData.userId}`);

    return {
      success: true,
      data: notification,
      message: 'Notification created successfully',
    };
  } catch (error) {
    logger.error('Create notification error:', error);
    throw error;
  }
}

/**
 * Get notifications for user
 */
export async function getUserNotifications(
  userId: string,
  searchParams: NotificationSearchRequest = {}
): Promise<ApiResponse<{ notifications: INotification[]; total: number; page: number; totalPages: number; unreadCount: number }>> {
  try {
    const {
      page = 1,
      limit = 10,
      type,
      priority,
      isRead,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = searchParams;

    // Build filter
    const filter: any = { userId };

    if (type) {
      filter.type = type;
    }

    if (priority) {
      filter.priority = priority;
    }

    if (isRead !== undefined) {
      filter.isRead = isRead;
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Build sort object
    const sort: any = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Execute queries
    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments(filter),
      Notification.countDocuments({ ...filter, isRead: false }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      success: true,
      data: {
        notifications,
        total,
        page,
        totalPages,
        unreadCount,
      },
      message: 'Notifications retrieved successfully',
    };
  } catch (error) {
    logger.error('Get user notifications error:', error);
    throw error;
  }
}

/**
 * Mark notification as read
 */
export async function markNotificationAsRead(
  notificationId: string,
  userId: string
): Promise<ApiResponse<INotification>> {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, userId },
      { isRead: true, readAt: new Date() },
      { new: true }
    );

    if (!notification) {
      throw new NotFoundError('Notification not found');
    }

    logger.info(`Notification marked as read: ${notificationId} by user: ${userId}`);

    return {
      success: true,
      data: notification,
      message: 'Notification marked as read',
    };
  } catch (error) {
    logger.error('Mark notification as read error:', error);
    throw error;
  }
}

/**
 * Mark all notifications as read for user
 */
export async function markAllNotificationsAsRead(userId: string): Promise<ApiResponse<{ updatedCount: number }>> {
  try {
    const result = await Notification.updateMany(
      { userId, isRead: false },
      { isRead: true, readAt: new Date() }
    );

    logger.info(`All notifications marked as read for user: ${userId}, count: ${result.modifiedCount}`);

    return {
      success: true,
      data: { updatedCount: result.modifiedCount },
      message: 'All notifications marked as read',
    };
  } catch (error) {
    logger.error('Mark all notifications as read error:', error);
    throw error;
  }
}

/**
 * Delete notification
 */
export async function deleteNotification(
  notificationId: string,
  userId: string
): Promise<ApiResponse<null>> {
  try {
    const notification = await Notification.findOneAndDelete({
      _id: notificationId,
      userId,
    });

    if (!notification) {
      throw new NotFoundError('Notification not found');
    }

    logger.info(`Notification deleted: ${notificationId} by user: ${userId}`);

    return {
      success: true,
      data: null,
      message: 'Notification deleted successfully',
    };
  } catch (error) {
    logger.error('Delete notification error:', error);
    throw error;
  }
}

/**
 * Get notification statistics
 */
export async function getNotificationStatistics(
  userId?: string
): Promise<ApiResponse<{
  totalNotifications: number;
  unreadNotifications: number;
  notificationsByType: Record<string, number>;
  notificationsByPriority: Record<string, number>;
  averageReadTime: number;
}>> {
  try {
    const filter = userId ? { userId } : {};

    const [
      totalNotifications,
      unreadNotifications,
      notificationsByType,
      notificationsByPriority,
      averageReadTime,
    ] = await Promise.all([
      Notification.countDocuments(filter),
      Notification.countDocuments({ ...filter, isRead: false }),
      Notification.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 },
          },
        },
      ]),
      Notification.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$priority',
            count: { $sum: 1 },
          },
        },
      ]),
      Notification.aggregate([
        {
          $match: {
            ...filter,
            isRead: true,
            readAt: { $exists: true },
          },
        },
        {
          $group: {
            _id: null,
            averageTime: {
              $avg: {
                $subtract: ['$readAt', '$createdAt'],
              },
            },
          },
        },
      ]),
    ]);

    const notificationsByTypeMap = notificationsByType.reduce((acc: any, item: any) => {
      acc[item._id] = item.count;
      return acc;
    }, {});

    const notificationsByPriorityMap = notificationsByPriority.reduce((acc: any, item: any) => {
      acc[item._id] = item.count;
      return acc;
    }, {});

    const avgReadTime = averageReadTime[0]?.averageTime || 0;

    return {
      success: true,
      data: {
        totalNotifications,
        unreadNotifications,
        notificationsByType: notificationsByTypeMap,
        notificationsByPriority: notificationsByPriorityMap,
        averageReadTime: avgReadTime,
      },
      message: 'Notification statistics retrieved successfully',
    };
  } catch (error) {
    logger.error('Get notification statistics error:', error);
    throw error;
  }
}

/**
 * Create bulk notifications
 */
export async function createBulkNotifications(
  notifications: CreateNotificationRequest[]
): Promise<ApiResponse<{ created: number; failed: string[] }>> {
  try {
    const createdNotifications = [];
    const failedNotifications = [];

    for (const notificationData of notifications) {
      try {
        // Verify user exists
        const user = await User.findById(notificationData.userId);
        if (!user) {
          failedNotifications.push(`User ${notificationData.userId} not found`);
          continue;
        }

        const notification = new Notification({
          userId: notificationData.userId,
          type: notificationData.type,
          title: notificationData.title,
          message: notificationData.message,
          data: notificationData.data || {},
          priority: notificationData.priority || 'MEDIUM',
          isRead: false,
        });

        await notification.save();
        createdNotifications.push(notification);
      } catch (error) {
        failedNotifications.push(`Failed to create notification for user ${notificationData.userId}: ${error}`);
      }
    }

    logger.info(`Bulk notifications created: ${createdNotifications.length}, failed: ${failedNotifications.length}`);

    return {
      success: true,
      data: {
        created: createdNotifications.length,
        failed: failedNotifications,
      },
      message: `Bulk notifications processed: ${createdNotifications.length} created`,
    };
  } catch (error) {
    logger.error('Create bulk notifications error:', error);
    throw error;
  }
}

/**
 * Send notification to all users by role
 */
export async function sendNotificationToRole(
  role: string,
  type: string,
  title: string,
  message: string,
  data?: any,
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' = 'MEDIUM'
): Promise<ApiResponse<{ sent: number }>> {
  try {
    // Get all users with the specified role
    const users = await User.find({ role }).select('_id');
    
    if (users.length === 0) {
      return {
        success: true,
        data: { sent: 0 },
        message: 'No users found with the specified role',
      };
    }

    // Create notifications for all users
    const notifications = users.map(user => ({
      userId: user._id.toString(),
      type,
      title,
      message,
      data: data || {},
      priority,
    }));

    const result = await createBulkNotifications(notifications);

    return {
      success: true,
      data: { sent: result.data?.created || 0 },
      message: `Notification sent to ${result.data?.created || 0} users`,
    };
  } catch (error) {
    logger.error('Send notification to role error:', error);
    throw error;
  }
}
