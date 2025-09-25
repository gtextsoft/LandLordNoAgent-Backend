import User from '../models/User';
import Property from '../models/Property';
import Application from '../models/Application';
import Payment from '../models/Payment';
import ChatMessage from '../models/ChatMessage';
import Notification from '../models/Notification';
import { ApiResponse } from '../types';
import { logger } from '../config/logger';
import { NotFoundError, ValidationError, AuthorizationError } from '../middleware/errorHandler';

/**
 * Get platform statistics
 */
export async function getPlatformStatistics(): Promise<ApiResponse<{
  totalUsers: number;
  usersByRole: Record<string, number>;
  totalProperties: number;
  propertiesByStatus: Record<string, number>;
  totalApplications: number;
  applicationsByStatus: Record<string, number>;
  totalPayments: number;
  paymentsByStatus: Record<string, number>;
  totalRevenue: number;
  totalCommission: number;
  activeConversations: number;
  totalNotifications: number;
  growthStats: {
    usersThisMonth: number;
    propertiesThisMonth: number;
    applicationsThisMonth: number;
    revenueThisMonth: number;
  };
}>> {
  try {
    const [
      totalUsers,
      usersByRole,
      totalProperties,
      propertiesByStatus,
      totalApplications,
      applicationsByStatus,
      totalPayments,
      paymentsByStatus,
      revenueStats,
      activeConversations,
      totalNotifications,
      growthStats,
    ] = await Promise.all([
      User.countDocuments(),
      User.aggregate([
        {
          $group: {
            _id: '$role',
            count: { $sum: 1 },
          },
        },
      ]),
      Property.countDocuments(),
      Property.aggregate([
        {
          $group: {
            _id: '$isVerified',
            count: { $sum: 1 },
          },
        },
      ]),
      Application.countDocuments(),
      Application.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]),
      Payment.countDocuments(),
      Payment.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]),
      Payment.aggregate([
        {
          $match: { status: 'COMPLETED' },
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$amount' },
            totalCommission: { $sum: '$commissionAmount' },
          },
        },
      ]),
      Application.distinct('_id').then(count => count.length),
      Notification.countDocuments(),
      Promise.all([
        User.countDocuments({
          createdAt: {
            $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        }),
        Property.countDocuments({
          createdAt: {
            $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        }),
        Application.countDocuments({
          createdAt: {
            $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        }),
        Payment.aggregate([
          {
            $match: {
              status: 'COMPLETED',
              createdAt: {
                $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
              },
            },
          },
          {
            $group: {
              _id: null,
              revenue: { $sum: '$amount' },
            },
          },
        ]),
      ]),
    ]);

    const usersByRoleMap = usersByRole.reduce((acc: any, item: any) => {
      acc[item._id] = item.count;
      return acc;
    }, {});

    const propertiesByStatusMap = propertiesByStatus.reduce((acc: any, item: any) => {
      acc[item._id ? 'verified' : 'unverified'] = item.count;
      return acc;
    }, {});

    const applicationsByStatusMap = applicationsByStatus.reduce((acc: any, item: any) => {
      acc[item._id] = item.count;
      return acc;
    }, {});

    const paymentsByStatusMap = paymentsByStatus.reduce((acc: any, item: any) => {
      acc[item._id] = item.count;
      return acc;
    }, {});

    const revenueData = revenueStats[0] || { totalRevenue: 0, totalCommission: 0 };
    const totalRevenue = revenueData.totalRevenue / 100; // Convert from cents
    const totalCommission = revenueData.totalCommission / 100; // Convert from cents

    const growthData = growthStats[3][0] || { revenue: 0 };

    return {
      success: true,
      data: {
        totalUsers,
        usersByRole: usersByRoleMap,
        totalProperties,
        propertiesByStatus: propertiesByStatusMap,
        totalApplications,
        applicationsByStatus: applicationsByStatusMap,
        totalPayments,
        paymentsByStatus: paymentsByStatusMap,
        totalRevenue,
        totalCommission,
        activeConversations,
        totalNotifications,
        growthStats: {
          usersThisMonth: growthStats[0],
          propertiesThisMonth: growthStats[1],
          applicationsThisMonth: growthStats[2],
          revenueThisMonth: growthData.revenue / 100, // Convert from cents
        },
      },
      message: 'Platform statistics retrieved successfully',
    };
  } catch (error) {
    logger.error('Get platform statistics error:', error);
    throw error;
  }
}

/**
 * Get all users with pagination
 */
export async function getAllUsers(
  page: number = 1,
  limit: number = 10,
  role?: string,
  isVerified?: boolean
): Promise<ApiResponse<{ users: any[]; total: number; page: number; totalPages: number }>> {
  try {
    const skip = (page - 1) * limit;
    const filter: any = {};

    if (role) {
      filter.role = role;
    }

    if (isVerified !== undefined) {
      filter.isVerified = isVerified;
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-passwordHash')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      success: true,
      data: {
        users,
        total,
        page,
        totalPages,
      },
      message: 'Users retrieved successfully',
    };
  } catch (error) {
    logger.error('Get all users error:', error);
    throw error;
  }
}

/**
 * Update user status
 */
export async function updateUserStatus(
  userId: string,
  isVerified: boolean,
  adminId: string
): Promise<ApiResponse<any>> {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    user.isVerified = isVerified;
    await user.save();

    logger.info(`User verification status updated: ${userId} to ${isVerified} by admin: ${adminId}`);

    // Remove sensitive data from response
    const userResponse = user.toObject();
    delete (userResponse as any).passwordHash;

    return {
      success: true,
      data: userResponse,
      message: `User ${isVerified ? 'verified' : 'unverified'} successfully`,
    };
  } catch (error) {
    logger.error('Update user status error:', error);
    throw error;
  }
}

/**
 * Delete user
 */
export async function deleteUser(
  userId: string,
  adminId: string
): Promise<ApiResponse<null>> {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Check if user has any active applications or payments
    const [activeApplications, activePayments] = await Promise.all([
      Application.countDocuments({
        $or: [{ clientId: userId }, { landlordId: userId }],
        status: { $in: ['PENDING', 'ACCEPTED'] },
      }),
      Payment.countDocuments({
        $or: [{ clientId: userId }, { landlordId: userId }],
        status: { $in: ['PENDING', 'COMPLETED'] },
      }),
    ]);

    if (activeApplications > 0 || activePayments > 0) {
      throw new ValidationError('Cannot delete user with active applications or payments');
    }

    // Delete user and related data
    await Promise.all([
      User.findByIdAndDelete(userId),
      Application.deleteMany({
        $or: [{ clientId: userId }, { landlordId: userId }],
      }),
      Payment.deleteMany({
        $or: [{ clientId: userId }, { landlordId: userId }],
      }),
      ChatMessage.deleteMany({
        $or: [{ senderId: userId }, { receiverId: userId }],
      }),
      Notification.deleteMany({ userId }),
    ]);

    logger.info(`User deleted: ${userId} by admin: ${adminId}`);

    return {
      success: true,
      data: null,
      message: 'User deleted successfully',
    };
  } catch (error) {
    logger.error('Delete user error:', error);
    throw error;
  }
}

/**
 * Get platform analytics
 */
export async function getPlatformAnalytics(
  startDate?: string,
  endDate?: string
): Promise<ApiResponse<{
  userGrowth: Array<{ date: string; count: number }>;
  propertyGrowth: Array<{ date: string; count: number }>;
  applicationTrends: Array<{ date: string; count: number }>;
  revenueTrends: Array<{ date: string; amount: number }>;
  topCities: Array<{ city: string; count: number }>;
  propertyTypes: Array<{ type: string; count: number }>;
}>> {
  try {
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    const end = endDate ? new Date(endDate) : new Date();

    const [
      userGrowth,
      propertyGrowth,
      applicationTrends,
      revenueTrends,
      topCities,
      propertyTypes,
    ] = await Promise.all([
      User.aggregate([
        {
          $match: {
            createdAt: { $gte: start, $lte: end },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt',
              },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Property.aggregate([
        {
          $match: {
            createdAt: { $gte: start, $lte: end },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt',
              },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Application.aggregate([
        {
          $match: {
            createdAt: { $gte: start, $lte: end },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt',
              },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Payment.aggregate([
        {
          $match: {
            status: 'COMPLETED',
            createdAt: { $gte: start, $lte: end },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt',
              },
            },
            amount: { $sum: '$amount' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Property.aggregate([
        {
          $group: {
            _id: '$location.city',
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      Property.aggregate([
        {
          $group: {
            _id: '$propertyType',
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
      ]),
    ]);

    return {
      success: true,
      data: {
        userGrowth: userGrowth.map(item => ({ date: item._id, count: item.count })),
        propertyGrowth: propertyGrowth.map(item => ({ date: item._id, count: item.count })),
        applicationTrends: applicationTrends.map(item => ({ date: item._id, count: item.count })),
        revenueTrends: revenueTrends.map(item => ({ date: item._id, amount: item.amount / 100 })),
        topCities: topCities.map(item => ({ city: item._id, count: item.count })),
        propertyTypes: propertyTypes.map(item => ({ type: item._id, count: item.count })),
      },
      message: 'Platform analytics retrieved successfully',
    };
  } catch (error) {
    logger.error('Get platform analytics error:', error);
    throw error;
  }
}

/**
 * Bulk operations
 */
export async function bulkUpdateUsers(
  userIds: string[],
  updates: { isVerified?: boolean; role?: string },
  adminId: string
): Promise<ApiResponse<{ updated: number; failed: string[] }>> {
  try {
    const failed: string[] = [];
    let updated = 0;

    for (const userId of userIds) {
      try {
        await User.findByIdAndUpdate(userId, updates);
        updated++;
      } catch (error) {
        failed.push(userId);
      }
    }

    logger.info(`Bulk user update completed: ${updated} updated, ${failed.length} failed by admin: ${adminId}`);

    return {
      success: true,
      data: {
        updated,
        failed,
      },
      message: `Bulk update completed: ${updated} users updated`,
    };
  } catch (error) {
    logger.error('Bulk update users error:', error);
    throw error;
  }
}

/**
 * Get system health
 */
export async function getSystemHealth(): Promise<ApiResponse<{
  database: { status: string; collections: number };
  storage: { status: string; available: boolean };
  services: { status: string; uptime: number };
  performance: {
    avgResponseTime: number;
    totalRequests: number;
    errorRate: number;
  };
}>> {
  try {
    // This is a simplified version - in production you'd want more comprehensive health checks
    const collections = await Promise.all([
      User.countDocuments(),
      Property.countDocuments(),
      Application.countDocuments(),
      Payment.countDocuments(),
      ChatMessage.countDocuments(),
      Notification.countDocuments(),
    ]);

    const totalCollections = collections.length;
    const totalDocuments = collections.reduce((sum, count) => sum + count, 0);

    return {
      success: true,
      data: {
        database: {
          status: 'healthy',
          collections: totalCollections,
        },
        storage: {
          status: 'healthy',
          available: true,
        },
        services: {
          status: 'healthy',
          uptime: process.uptime(),
        },
        performance: {
          avgResponseTime: 0, // Would be calculated from actual metrics
          totalRequests: totalDocuments,
          errorRate: 0, // Would be calculated from actual metrics
        },
      },
      message: 'System health check completed',
    };
  } catch (error) {
    logger.error('Get system health error:', error);
    throw error;
  }
}
