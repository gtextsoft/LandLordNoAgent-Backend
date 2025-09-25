import { Request, Response, NextFunction } from 'express';
import {
  submitApplication,
  getApplicationById,
  updateApplicationStatus,
  getApplicationsByUser,
  cancelApplication,
  getApplicationStatistics,
  getPropertyApplications,
  CreateApplicationRequest,
  UpdateApplicationRequest,
  ApplicationSearchRequest,
} from '../services/applicationService';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../config/logger';

/**
 * Submit a new application
 */
export const submitApplicationController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const clientId = req.user?.userId;
    const applicationData: CreateApplicationRequest = req.body;

    if (!clientId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    if (req.user?.role !== 'CLIENT') {
      return res.status(403).json({
        success: false,
        error: 'Only clients can submit applications',
      });
    }

    const result = await submitApplication(clientId, applicationData);

    return res.status(201).json(result);
  }
);

/**
 * Get application by ID
 */
export const getApplicationController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const result = await getApplicationById(id);

    // Check if user has permission to view this application
    const application = result.data as any;
    const canView = 
      userRole === 'ADMIN' ||
      application.clientId._id.toString() === userId ||
      application.landlordId._id.toString() === userId;

    if (!canView) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to view this application',
      });
    }

    return res.status(200).json(result);
  }
);

/**
 * Update application status
 */
export const updateApplicationStatusController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const userId = req.user?.userId;
    const userRole = req.user?.role;
    const updateData: UpdateApplicationRequest = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    if (!['LANDLORD', 'ADMIN'].includes(userRole || '')) {
      return res.status(403).json({
        success: false,
        error: 'Only landlords and admins can update application status',
      });
    }

    const result = await updateApplicationStatus(id, userId, userRole!, updateData);

    return res.status(200).json(result);
  }
);

/**
 * Get applications by user
 */
export const getApplicationsController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const searchParams: ApplicationSearchRequest = {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 10,
      status: req.query.status as string,
      propertyId: req.query.propertyId as string,
      landlordId: req.query.landlordId as string,
      clientId: req.query.clientId as string,
      sortBy: req.query.sortBy as 'createdAt' | 'updatedAt' | 'status' || 'createdAt',
      sortOrder: req.query.sortOrder as 'asc' | 'desc' || 'desc',
    };

    const result = await getApplicationsByUser(userId, userRole!, searchParams);

    return res.status(200).json(result);
  }
);

/**
 * Cancel application
 */
export const cancelApplicationController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const clientId = req.user?.userId;

    if (!clientId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    if (req.user?.role !== 'CLIENT') {
      return res.status(403).json({
        success: false,
        error: 'Only clients can cancel applications',
      });
    }

    const result = await cancelApplication(id, clientId);

    return res.status(200).json(result);
  }
);

/**
 * Get application statistics
 */
export const getApplicationStatisticsController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const result = await getApplicationStatistics(userId, userRole);

    return res.status(200).json(result);
  }
);

/**
 * Get applications for a specific property (Landlord only)
 */
export const getPropertyApplicationsController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { propertyId } = req.params;
    const landlordId = req.user?.userId;

    if (!landlordId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    if (req.user?.role !== 'LANDLORD') {
      return res.status(403).json({
        success: false,
        error: 'Only landlords can view property applications',
      });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    const result = await getPropertyApplications(propertyId, landlordId, page, limit);

    return res.status(200).json(result);
  }
);

/**
 * Get all applications (Admin only)
 */
export const getAllApplicationsController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required',
      });
    }

    const searchParams: ApplicationSearchRequest = {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 10,
      status: req.query.status as string,
      propertyId: req.query.propertyId as string,
      landlordId: req.query.landlordId as string,
      clientId: req.query.clientId as string,
      sortBy: req.query.sortBy as 'createdAt' | 'updatedAt' | 'status' || 'createdAt',
      sortOrder: req.query.sortOrder as 'asc' | 'desc' || 'desc',
    };

    const result = await getApplicationsByUser('', 'ADMIN', searchParams);

    return res.status(200).json(result);
  }
);
