import express from 'express';
import {
  uploadPropertyImages,
  uploadPropertyDocuments,
  uploadKycDocuments,
  uploadChatFiles,
  deleteFile,
  getFileInfoController,
  generateUploadUrl,
} from '../controllers/uploadController';
import { authenticateToken, requireRole } from '../middleware/auth';

const router = express.Router();

// Property file uploads (Landlord only)
router.post('/properties/:propertyId/images', authenticateToken, requireRole(['LANDLORD']), uploadPropertyImages);
router.post('/properties/:propertyId/documents', authenticateToken, requireRole(['LANDLORD']), uploadPropertyDocuments);

// Property image uploads (without property ID - for frontend compatibility)
router.post('/property-images', authenticateToken, requireRole(['LANDLORD']), uploadPropertyImages);

// KYC document uploads (Client only)
router.post('/kyc', authenticateToken, requireRole(['CLIENT']), uploadKycDocuments);

// Chat file uploads (Authenticated users)
router.post('/chat/:applicationId', authenticateToken, uploadChatFiles);

// File management (Authenticated users)
router.delete('/:fileId', authenticateToken, deleteFile);
router.get('/:fileId/info', authenticateToken, getFileInfoController);
router.post('/generate-url', authenticateToken, generateUploadUrl);

export default router;
