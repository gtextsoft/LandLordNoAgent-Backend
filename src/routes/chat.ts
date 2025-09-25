import express from 'express';
import {
  sendMessageController,
  getChatMessagesController,
  markMessagesAsReadController,
  getUnreadMessageCountController,
  deleteMessageController,
  getChatStatisticsController,
  getUserConversationsController,
  getAllChatMessagesController,
  getGlobalChatStatisticsController,
} from '../controllers/chatController';
import { authenticateToken, requireRole } from '../middleware/auth';
import { validationSchemas } from '../middleware/validation';

const router = express.Router();

// User routes
router.post('/send', authenticateToken, validationSchemas.sendMessage, sendMessageController);
router.get('/conversations', authenticateToken, getUserConversationsController);
router.get('/unread-count', authenticateToken, getUnreadMessageCountController);
router.get('/statistics', authenticateToken, getChatStatisticsController);

// Application-specific routes
router.get('/:applicationId/messages', authenticateToken, validationSchemas.chatParams, getChatMessagesController);
router.put('/:applicationId/read', authenticateToken, validationSchemas.chatParams, markMessagesAsReadController);

// Message-specific routes
router.delete('/message/:messageId', authenticateToken, deleteMessageController);

// Admin routes
router.get('/admin/messages', authenticateToken, requireRole(['ADMIN']), getAllChatMessagesController);
router.get('/admin/statistics', authenticateToken, requireRole(['ADMIN']), getGlobalChatStatisticsController);

export default router;
