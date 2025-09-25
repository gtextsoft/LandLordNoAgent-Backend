import { Request, Response, NextFunction } from 'express';
import {
  submitKycData,
  getKycData,
  verifyKycData,
  getPendingKycSubmissions,
  getKycStatistics,
  updateKycDocumentStatus,
  KycSubmissionRequest,
  KycVerificationRequest,
} from '../services/kycService';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../config/logger';

/**
 * Submit KYC data
 */
export const submitKycController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.userId;
    const kycData: KycSubmissionRequest = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    if (req.user?.role !== 'CLIENT') {
      return res.status(403).json({
        success: false,
        error: 'Only clients can submit KYC data',
      });
    }

    const result = await submitKycData(userId, kycData);

    return res.status(201).json(result);
  }
);

/**
 * Get KYC data
 */
export const getKycController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const result = await getKycData(userId);

    return res.status(200).json(result);
  }
);

/**
 * Verify KYC data (Admin only)
 */
export const verifyKycController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { userId } = req.params;
    const adminId = req.user?.userId;
    const verificationData: KycVerificationRequest = req.body;

    if (!adminId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required',
      });
    }

    const result = await verifyKycData(userId, verificationData, adminId);

    return res.status(200).json(result);
  }
);

/**
 * Get pending KYC submissions (Admin only)
 */
export const getPendingKycController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required',
      });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    const result = await getPendingKycSubmissions(page, limit);

    return res.status(200).json(result);
  }
);

/**
 * Get KYC statistics (Admin only)
 */
export const getKycStatisticsController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required',
      });
    }

    const result = await getKycStatistics();

    return res.status(200).json(result);
  }
);

/**
 * Update KYC document status (Admin only)
 */
export const updateKycDocumentController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { userId, documentType } = req.params;
    const adminId = req.user?.userId;
    const { status, notes } = req.body;

    if (!adminId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required',
      });
    }

    const validDocumentTypes = ['idCard', 'proofOfAddress', 'proofOfIncome', 'bankStatement'];
    if (!validDocumentTypes.includes(documentType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid document type',
      });
    }

    const validStatuses = ['approved', 'rejected'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status. Must be approved or rejected',
      });
    }

    const result = await updateKycDocumentStatus(
      userId,
      documentType as any,
      status as any,
      notes,
      adminId
    );

    return res.status(200).json(result);
  }
);
