import { Request, Response, NextFunction } from 'express';
import { uploadToCloudinary, deleteFromCloudinary, getFileInfo, generateSignedUploadUrl } from '../services/uploadService';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../config/logger';
import multer from 'multer';

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Define allowed file types
    const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const allowedDocumentTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    const allowedVideoTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo'];

    const allowedTypes = [...allowedImageTypes, ...allowedDocumentTypes, ...allowedVideoTypes];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type') as any, false);
    }
  },
});

/**
 * Upload property images
 */
export const uploadPropertyImages = [
  upload.array('images', 10), // Allow up to 10 images
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.userId;
    const { propertyId } = req.params;
    const files = req.files as Express.Multer.File[];

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files uploaded',
      });
    }

    const result = await uploadToCloudinary(files, 'property-images', propertyId);

    logger.info(`Property images uploaded: ${files.length} files for property: ${propertyId}`);

    return res.status(200).json(result);
  })
];

/**
 * Upload property documents
 */
export const uploadPropertyDocuments = [
  upload.array('documents', 5), // Allow up to 5 documents
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.userId;
    const { propertyId } = req.params;
    const files = req.files as Express.Multer.File[];

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files uploaded',
      });
    }

    const result = await uploadToCloudinary(files, 'property-documents', propertyId);

    logger.info(`Property documents uploaded: ${files.length} files for property: ${propertyId}`);

    return res.status(200).json(result);
  })
];

/**
 * Upload KYC documents
 */
export const uploadKycDocuments = [
  upload.fields([
    { name: 'idCard', maxCount: 1 },
    { name: 'proofOfAddress', maxCount: 1 },
    { name: 'proofOfIncome', maxCount: 1 },
    { name: 'bankStatement', maxCount: 1 },
  ]),
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.userId;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const result = await uploadToCloudinary(files, 'kyc-documents', userId);

    logger.info(`KYC documents uploaded for user: ${userId}`);

    return res.status(200).json(result);
  })
];

/**
 * Upload chat files
 */
export const uploadChatFiles = [
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.userId;
    const { applicationId } = req.params;
    const file = req.file;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    if (!file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
    }

    const result = await uploadToCloudinary([file], 'chat-files', applicationId);

    logger.info(`Chat file uploaded: ${file.originalname} for application: ${applicationId}`);

    return res.status(200).json(result);
  })
];

/**
 * Delete file
 */
export const deleteFile = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.userId;
    const { fileId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const result = await deleteFromCloudinary(fileId);

    logger.info(`File deleted: ${fileId} by user: ${userId}`);

    return res.status(200).json(result);
  }
);

/**
 * Get file information
 */
export const getFileInfoController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { fileId } = req.params;

    const result = await getFileInfo(fileId);

    return res.status(200).json(result);
  }
);

/**
 * Generate signed upload URL
 */
export const generateUploadUrl = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.userId;
    const { folder, resourceType } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const result = await generateSignedUploadUrl(folder, resourceType);

    return res.status(200).json(result);
  }
);
