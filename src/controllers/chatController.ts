import { Request, Response, NextFunction } from 'express';
import {
  sendMessage,
  getChatMessages,
  markMessagesAsRead,
  getUnreadMessageCount,
  deleteMessage,
  getChatStatistics,
  getUserConversations,
  CreateChatMessageRequest,
  ChatSearchRequest,
} from '../services/chatService';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../config/logger';

/**
 * Send a chat message
 */
export const sendMessageController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const senderId = req.user?.userId;
    const messageData: CreateChatMessageRequest = req.body;

    if (!senderId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const result = await sendMessage(senderId, messageData);

    return res.status(201).json(result);
  }
);

/**
 * Get chat messages for an application
 */
export const getChatMessagesController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { applicationId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const searchParams: ChatSearchRequest = {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 50,
      messageType: req.query.messageType as string,
      sortBy: req.query.sortBy as 'createdAt' || 'createdAt',
      sortOrder: req.query.sortOrder as 'asc' | 'desc' || 'asc',
    };

    const result = await getChatMessages(applicationId, userId, searchParams);

    return res.status(200).json(result);
  }
);

/**
 * Mark messages as read
 */
export const markMessagesAsReadController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { applicationId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const result = await markMessagesAsRead(applicationId, userId);

    return res.status(200).json(result);
  }
);

/**
 * Get unread message count
 */
export const getUnreadMessageCountController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const result = await getUnreadMessageCount(userId);

    return res.status(200).json(result);
  }
);

/**
 * Delete a chat message
 */
export const deleteMessageController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { messageId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const result = await deleteMessage(messageId, userId);

    return res.status(200).json(result);
  }
);

/**
 * Get chat statistics
 */
export const getChatStatisticsController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const result = await getChatStatistics(userId, userRole);

    return res.status(200).json(result);
  }
);

/**
 * Get user conversations
 */
export const getUserConversationsController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    const result = await getUserConversations(userId, page, limit);

    return res.status(200).json(result);
  }
);

/**
 * Get all chat messages (Admin only)
 */
export const getAllChatMessagesController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required',
      });
    }

    const searchParams: ChatSearchRequest = {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 50,
      messageType: req.query.messageType as string,
      sortBy: req.query.sortBy as 'createdAt' || 'createdAt',
      sortOrder: req.query.sortOrder as 'asc' | 'desc' || 'desc',
    };

    // For admin, we can get messages from any application
    const applicationId = req.query.applicationId as string;
    if (!applicationId) {
      return res.status(400).json({
        success: false,
        error: 'Application ID is required for admin access',
      });
    }

    const result = await getChatMessages(applicationId, '', searchParams);

    return res.status(200).json(result);
  }
);

/**
 * Get global chat statistics (Admin only)
 */
export const getGlobalChatStatisticsController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required',
      });
    }

    const result = await getChatStatistics();

    return res.status(200).json(result);
  }
);
