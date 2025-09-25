import { Request, Response, NextFunction } from 'express';
import {
  createProperty,
  getPropertyById,
  updateProperty,
  deleteProperty,
  searchProperties,
  getPropertiesByLandlord,
  togglePropertyAvailability,
  verifyProperty,
  getPropertyStatistics,
  CreatePropertyRequest,
  UpdatePropertyRequest,
  PropertySearchRequest,
} from '../services/propertyService';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../config/logger';

/**
 * Create a new property
 */
export const createPropertyController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const landlordId = req.user?.userId;
    const propertyData: CreatePropertyRequest = req.body;

    if (!landlordId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const result = await createProperty(landlordId, propertyData);

    return res.status(201).json(result);
  }
);

/**
 * Get property by ID
 */
export const getPropertyController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;

    const result = await getPropertyById(id);

    return res.status(200).json(result);
  }
);

/**
 * Update property
 */
export const updatePropertyController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const landlordId = req.user?.userId;
    const updateData: UpdatePropertyRequest = req.body;

    if (!landlordId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const result = await updateProperty(id, landlordId, updateData);

    return res.status(200).json(result);
  }
);

/**
 * Delete property
 */
export const deletePropertyController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const landlordId = req.user?.userId;

    if (!landlordId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const result = await deleteProperty(id, landlordId);

    return res.status(200).json(result);
  }
);

/**
 * Search and filter properties
 */
export const searchPropertiesController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const searchParams: PropertySearchRequest = {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 10,
      propertyType: req.query.propertyType as string,
      minPrice: req.query.minPrice ? parseFloat(req.query.minPrice as string) : undefined,
      maxPrice: req.query.maxPrice ? parseFloat(req.query.maxPrice as string) : undefined,
      currency: req.query.currency as string || 'USD',
      city: req.query.city as string,
      state: req.query.state as string,
      amenities: req.query.amenities ? (req.query.amenities as string).split(',') : undefined,
      isAvailable: req.query.isAvailable ? req.query.isAvailable === 'true' : true,
      isVerified: req.query.isVerified ? req.query.isVerified === 'true' : undefined,
      sortBy: req.query.sortBy as 'price' | 'createdAt' | 'title' || 'createdAt',
      sortOrder: req.query.sortOrder as 'asc' | 'desc' || 'desc',
    };

    const result = await searchProperties(searchParams);

    return res.status(200).json(result);
  }
);

/**
 * Get properties by landlord
 */
export const getLandlordPropertiesController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const landlordId = req.user?.userId;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    if (!landlordId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const result = await getPropertiesByLandlord(landlordId, page, limit);

    return res.status(200).json(result);
  }
);

/**
 * Toggle property availability
 */
export const togglePropertyAvailabilityController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const landlordId = req.user?.userId;

    if (!landlordId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const result = await togglePropertyAvailability(id, landlordId);

    return res.status(200).json(result);
  }
);

/**
 * Verify property (Admin only)
 */
export const verifyPropertyController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const { isVerified, adminNotes } = req.body;

    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required',
      });
    }

    const result = await verifyProperty(id, isVerified, adminNotes);

    return res.status(200).json(result);
  }
);

/**
 * Get property statistics (Admin only)
 */
export const getPropertyStatisticsController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required',
      });
    }

    const result = await getPropertyStatistics();

    return res.status(200).json(result);
  }
);

/**
 * Get all properties (Admin only)
 */
export const getAllPropertiesController = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required',
      });
    }

    const searchParams: PropertySearchRequest = {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 10,
      propertyType: req.query.propertyType as string,
      minPrice: req.query.minPrice ? parseFloat(req.query.minPrice as string) : undefined,
      maxPrice: req.query.maxPrice ? parseFloat(req.query.maxPrice as string) : undefined,
      currency: req.query.currency as string,
      city: req.query.city as string,
      state: req.query.state as string,
      amenities: req.query.amenities ? (req.query.amenities as string).split(',') : undefined,
      isAvailable: req.query.isAvailable ? req.query.isAvailable === 'true' : undefined,
      isVerified: req.query.isVerified ? req.query.isVerified === 'true' : undefined,
      sortBy: req.query.sortBy as 'price' | 'createdAt' | 'title' || 'createdAt',
      sortOrder: req.query.sortOrder as 'asc' | 'desc' || 'desc',
    };

    const result = await searchProperties(searchParams);

    return res.status(200).json(result);
  }
);
