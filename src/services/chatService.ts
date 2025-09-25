import ChatMessage, { IChatMessage } from '../models/ChatMessage';
import Application from '../models/Application';
import User from '../models/User';
import { ApiResponse } from '../types';
import { logger } from '../config/logger';
import { NotFoundError, ValidationError, AuthorizationError } from '../middleware/errorHandler';

// Chat message creation interface
export interface CreateChatMessageRequest {
  applicationId: string;
  content: string;
  messageType?: 'TEXT' | 'IMAGE' | 'FILE';
  fileUrl?: string;
}

// Chat search interface
export interface ChatSearchRequest {
  page?: number;
  limit?: number;
  messageType?: string;
  sortBy?: 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Send a chat message
 */
export async function sendMessage(
  senderId: string,
  messageData: CreateChatMessageRequest
): Promise<ApiResponse<IChatMessage>> {
  try {
    // Verify application exists and user has access
    const application = await Application.findById(messageData.applicationId)
      .populate('clientId', 'email profileData')
      .populate('landlordId', 'email profileData');

    if (!application) {
      throw new NotFoundError('Application not found');
    }

    // Check if user is part of this application conversation
    const isClient = (application.clientId as any)._id.toString() === senderId;
    const isLandlord = (application.landlordId as any)._id.toString() === senderId;

    if (!isClient && !isLandlord) {
      throw new AuthorizationError('You can only send messages to your own applications');
    }

    // Determine receiver
    const receiverId = isClient ? (application.landlordId as any)._id : (application.clientId as any)._id;

    // Create chat message
    const message = new ChatMessage({
      applicationId: messageData.applicationId,
      senderId: senderId,
      receiverId: receiverId,
      content: messageData.content,
      messageType: messageData.messageType || 'TEXT',
      fileUrl: messageData.fileUrl,
      isRead: false,
    });

    await message.save();

    // Populate the message with sender information
    await message.populate('senderId', 'email profileData');

    logger.info(`Chat message sent: ${message._id} by user: ${senderId} in application: ${messageData.applicationId}`);

    return {
      success: true,
      data: message,
      message: 'Message sent successfully',
    };
  } catch (error) {
    logger.error('Send message error:', error);
    throw error;
  }
}

/**
 * Get chat messages for an application
 */
export async function getChatMessages(
  applicationId: string,
  userId: string,
  searchParams: ChatSearchRequest = {}
): Promise<ApiResponse<{ messages: IChatMessage[]; total: number; page: number; totalPages: number }>> {
  try {
    // Verify application exists and user has access
    const application = await Application.findById(applicationId);

    if (!application) {
      throw new NotFoundError('Application not found');
    }

    // Check if user is part of this application conversation
    const isClient = application.clientId.toString() === userId;
    const isLandlord = application.landlordId.toString() === userId;

    if (!isClient && !isLandlord) {
      throw new AuthorizationError('You can only view messages for your own applications');
    }

    const {
      page = 1,
      limit = 50,
      messageType,
      sortBy = 'createdAt',
      sortOrder = 'asc', // For chat, we usually want oldest first
    } = searchParams;

    // Build filter
    const filter: any = { applicationId };

    if (messageType) {
      filter.messageType = messageType;
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Build sort object
    const sort: any = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Execute queries
    const [messages, total] = await Promise.all([
      ChatMessage.find(filter)
        .populate('senderId', 'email profileData')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      ChatMessage.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      success: true,
      data: {
        messages,
        total,
        page,
        totalPages,
      },
      message: 'Chat messages retrieved successfully',
    };
  } catch (error) {
    logger.error('Get chat messages error:', error);
    throw error;
  }
}

/**
 * Mark messages as read
 */
export async function markMessagesAsRead(
  applicationId: string,
  userId: string
): Promise<ApiResponse<{ updatedCount: number }>> {
  try {
    // Verify application exists and user has access
    const application = await Application.findById(applicationId);

    if (!application) {
      throw new NotFoundError('Application not found');
    }

    // Check if user is part of this application conversation
    const isClient = application.clientId.toString() === userId;
    const isLandlord = application.landlordId.toString() === userId;

    if (!isClient && !isLandlord) {
      throw new AuthorizationError('You can only mark messages as read for your own applications');
    }

    // Mark all unread messages as read
    const result = await ChatMessage.updateMany(
      {
        applicationId,
        receiverId: userId,
        isRead: false,
      },
      { isRead: true }
    );

    logger.info(`Messages marked as read: ${result.modifiedCount} for application: ${applicationId} by user: ${userId}`);

    return {
      success: true,
      data: { updatedCount: result.modifiedCount },
      message: `${result.modifiedCount} messages marked as read`,
    };
  } catch (error) {
    logger.error('Mark messages as read error:', error);
    throw error;
  }
}

/**
 * Get unread message count for user
 */
export async function getUnreadMessageCount(userId: string): Promise<ApiResponse<{ unreadCount: number; unreadByApplication: Record<string, number> }>> {
  try {
    const [totalUnread, unreadByApplication] = await Promise.all([
      ChatMessage.countDocuments({
        receiverId: userId,
        isRead: false,
      }),
      ChatMessage.aggregate([
        {
          $match: {
            receiverId: userId,
            isRead: false,
          },
        },
        {
          $group: {
            _id: '$applicationId',
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const unreadByApplicationMap = unreadByApplication.reduce((acc: any, item: any) => {
      acc[item._id.toString()] = item.count;
      return acc;
    }, {});

    return {
      success: true,
      data: {
        unreadCount: totalUnread,
        unreadByApplication: unreadByApplicationMap,
      },
      message: 'Unread message count retrieved successfully',
    };
  } catch (error) {
    logger.error('Get unread message count error:', error);
    throw error;
  }
}

/**
 * Delete a chat message
 */
export async function deleteMessage(
  messageId: string,
  userId: string
): Promise<ApiResponse<null>> {
  try {
    const message = await ChatMessage.findOneAndDelete({
      _id: messageId,
      senderId: userId, // Only sender can delete their own messages
    });

    if (!message) {
      throw new NotFoundError('Message not found or you do not have permission to delete it');
    }

    logger.info(`Chat message deleted: ${messageId} by user: ${userId}`);

    return {
      success: true,
      data: null,
      message: 'Message deleted successfully',
    };
  } catch (error) {
    logger.error('Delete message error:', error);
    throw error;
  }
}

/**
 * Get chat statistics
 */
export async function getChatStatistics(
  userId?: string,
  userRole?: string
): Promise<ApiResponse<{
  totalMessages: number;
  unreadMessages: number;
  messagesByType: Record<string, number>;
  averageMessagesPerDay: number;
  mostActiveApplications: Array<{ applicationId: string; messageCount: number }>;
}>> {
  try {
    // Build filter based on user role
    const filter: any = {};

    if (userRole === 'CLIENT') {
      filter.$or = [{ senderId: userId }, { receiverId: userId }];
    } else if (userRole === 'LANDLORD') {
      filter.$or = [{ senderId: userId }, { receiverId: userId }];
    } else if (userRole === 'ADMIN') {
      // Admin can see all messages
    }

    const [
      totalMessages,
      unreadMessages,
      messagesByType,
      averageMessagesPerDay,
      mostActiveApplications,
    ] = await Promise.all([
      ChatMessage.countDocuments(filter),
      ChatMessage.countDocuments({ ...filter, isRead: false }),
      ChatMessage.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$messageType',
            count: { $sum: 1 },
          },
        },
      ]),
      ChatMessage.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            averageMessages: {
              $avg: {
                $divide: [
                  { $size: { $ifNull: ['$createdAt', []] } },
                  30, // Approximate days
                ],
              },
            },
          },
        },
      ]),
      ChatMessage.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$applicationId',
            messageCount: { $sum: 1 },
          },
        },
        { $sort: { messageCount: -1 } },
        { $limit: 10 },
      ]),
    ]);

    const messagesByTypeMap = messagesByType.reduce((acc: any, item: any) => {
      acc[item._id] = item.count;
      return acc;
    }, {});

    const avgMessagesPerDay = averageMessagesPerDay[0]?.averageMessages || 0;

    return {
      success: true,
      data: {
        totalMessages,
        unreadMessages,
        messagesByType: messagesByTypeMap,
        averageMessagesPerDay: avgMessagesPerDay,
        mostActiveApplications,
      },
      message: 'Chat statistics retrieved successfully',
    };
  } catch (error) {
    logger.error('Get chat statistics error:', error);
    throw error;
  }
}

/**
 * Get all conversations for user
 */
export async function getUserConversations(
  userId: string,
  page: number = 1,
  limit: number = 10
): Promise<ApiResponse<{ conversations: any[]; total: number; page: number; totalPages: number }>> {
  try {
    const skip = (page - 1) * limit;

    // Get applications where user is either client or landlord
    const applications = await Application.find({
      $or: [{ clientId: userId }, { landlordId: userId }],
    })
      .populate('clientId', 'email profileData')
      .populate('landlordId', 'email profileData')
      .populate('propertyId', 'title location')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Get unread message counts for each application
    const conversations = await Promise.all(
      applications.map(async (application) => {
        const unreadCount = await ChatMessage.countDocuments({
          applicationId: application._id,
          receiverId: userId,
          isRead: false,
        });

        const lastMessage = await ChatMessage.findOne({
          applicationId: application._id,
        })
          .sort({ createdAt: -1 })
          .populate('senderId', 'email profileData')
          .lean();

        return {
          applicationId: application._id,
          application,
          unreadCount,
          lastMessage,
        };
      })
    );

    const total = await Application.countDocuments({
      $or: [{ clientId: userId }, { landlordId: userId }],
    });

    const totalPages = Math.ceil(total / limit);

    return {
      success: true,
      data: {
        conversations,
        total,
        page,
        totalPages,
      },
      message: 'User conversations retrieved successfully',
    };
  } catch (error) {
    logger.error('Get user conversations error:', error);
    throw error;
  }
}
