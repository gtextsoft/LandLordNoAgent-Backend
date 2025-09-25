import { Request, Response, NextFunction } from 'express';
import { getApplicationsByUser, submitApplication } from '../services/applicationService';
import { getUserPayments } from '../services/paymentService';
import { searchProperties } from '../services/propertyService';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../config/logger';
import Application from '../models/Application';
import Payment from '../models/Payment';

/**
 * Get properties for client (with search and filters)
 */
export const getClientProperties = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    // Extract search parameters
    const searchParams = {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 10,
      location: req.query.location as string,
      propertyType: req.query.propertyType as string,
      minPrice: req.query.minPrice ? parseFloat(req.query.minPrice as string) : undefined,
      maxPrice: req.query.maxPrice ? parseFloat(req.query.maxPrice as string) : undefined,
      amenities: req.query.amenities ? (req.query.amenities as string).split(',') : undefined,
      sortBy: (req.query.sortBy as 'createdAt' | 'title' | 'price') || 'createdAt',
      sortOrder: req.query.sortOrder as 'asc' | 'desc',
    };

    const result = await searchProperties(searchParams);

    return res.status(200).json(result.data?.properties || []);
  }
);

/**
 * Get client applications
 */
export const getClientApplications = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const result = await getApplicationsByUser(userId, 'CLIENT', {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 10,
    });

    return res.status(200).json(result.data?.applications || []);
  }
);

/**
 * Submit client application
 */
export const submitClientApplication = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const clientId = req.user?.userId;
    const applicationData = req.body;

    if (!clientId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    // Add client ID to application data
    const applicationWithClient = {
      ...applicationData,
      clientId,
    };

    const result = await submitApplication(clientId, applicationWithClient);

    return res.status(201).json(result.data);
  }
);

/**
 * Get client payments
 */
export const getClientPayments = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const result = await getUserPayments(userId, 'CLIENT', {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 10,
    });

    return res.status(200).json(result.data?.payments || []);
  }
);

/**
 * Get client saved properties
 */
export const getClientSavedProperties = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    // For now, return empty array - this would need to be implemented
    // based on your saved properties logic
    return res.status(200).json([]);
  }
);

/**
 * Toggle saved property
 */
export const toggleSavedProperty = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.userId;
    const { propertyId } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    // For now, return success - this would need to be implemented
    // based on your saved properties logic
    return res.status(200).json({
      success: true,
      message: 'Saved property toggled successfully',
    });
  }
);

/**
 * Get client application status (for accepted applications)
 */
export const getClientApplicationStatus = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.userId;
    const { applicationId, propertyIds } = req.query;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    try {
      if (applicationId) {
        // Get payment status for specific application
        const payment = await Payment.findOne({
          applicationId: applicationId as string,
          clientId: userId,
        });

        if (payment) {
          return res.status(200).json({
            status: payment.status.toLowerCase(),
            paymentId: payment._id,
          });
        } else {
          return res.status(200).json({
            status: 'not_found',
          });
        }
      } else if (propertyIds) {
        // Get accepted applications for specific properties
        const propertyIdArray = (propertyIds as string).split(',');
        
        const applications = await Application.find({
          clientId: userId,
          propertyId: { $in: propertyIdArray },
          status: 'ACCEPTED',
        }).select('_id propertyId');

        return res.status(200).json(applications);
      } else {
        return res.status(400).json({
          success: false,
          error: 'applicationId or propertyIds parameter required',
        });
      }
    } catch (error) {
      logger.error('Get client application status error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to get application status',
      });
    }
  }
);
