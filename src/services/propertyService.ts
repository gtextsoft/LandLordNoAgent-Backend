import Property, { IProperty } from '../models/Property';
import User from '../models/User';
import { ApiResponse } from '../types';
import { logger } from '../config/logger';
import { NotFoundError, ValidationError, AuthorizationError } from '../middleware/errorHandler';

// Property creation interface
export interface CreatePropertyRequest {
  title: string;
  description?: string;
  propertyType: string;
  price: number;
  currency?: string;
  location: {
    address: string;
    city: string;
    state: string;
    country?: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  };
  amenities?: string[];
  images?: string[];
  videos?: string[];
  houseDocuments?: string[];
}

// Property update interface
export interface UpdatePropertyRequest {
  title?: string;
  description?: string;
  propertyType?: string;
  price?: number;
  currency?: string;
  location?: {
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  };
  amenities?: string[];
  images?: string[];
  videos?: string[];
  houseDocuments?: string[];
  isAvailable?: boolean;
}

// Property search interface
export interface PropertySearchRequest {
  page?: number;
  limit?: number;
  propertyType?: string;
  minPrice?: number;
  maxPrice?: number;
  currency?: string;
  city?: string;
  state?: string;
  amenities?: string[];
  isAvailable?: boolean;
  isVerified?: boolean;
  sortBy?: 'price' | 'createdAt' | 'title';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Create a new property
 */
export async function createProperty(
  landlordId: string,
  propertyData: CreatePropertyRequest
): Promise<ApiResponse<IProperty>> {
  try {
    // Verify landlord exists
    const landlord = await User.findById(landlordId);
    if (!landlord) {
      throw new NotFoundError('Landlord not found');
    }

    if (landlord.role !== 'LANDLORD') {
      throw new AuthorizationError('Only landlords can create properties');
    }

    // Create property
    const property = new Property({
      ...propertyData,
      landlordId,
      currency: propertyData.currency || 'USD',
      isAvailable: true,
      isVerified: false,
    });

    await property.save();

    logger.info(`Property created: ${property._id} by landlord: ${landlordId}`);

    return {
      success: true,
      data: property,
      message: 'Property created successfully',
    };
  } catch (error) {
    logger.error('Create property error:', error);
    throw error;
  }
}

/**
 * Get property by ID
 */
export async function getPropertyById(propertyId: string): Promise<ApiResponse<IProperty>> {
  try {
    const property = await Property.findById(propertyId).populate('landlordId', 'email profileData');
    
    if (!property) {
      throw new NotFoundError('Property not found');
    }

    return {
      success: true,
      data: property,
      message: 'Property retrieved successfully',
    };
  } catch (error) {
    logger.error('Get property error:', error);
    throw error;
  }
}

/**
 * Update property
 */
export async function updateProperty(
  propertyId: string,
  landlordId: string,
  updateData: UpdatePropertyRequest
): Promise<ApiResponse<IProperty>> {
  try {
    const property = await Property.findById(propertyId);
    
    if (!property) {
      throw new NotFoundError('Property not found');
    }

    // Check ownership
    if (property.landlordId.toString() !== landlordId) {
      throw new AuthorizationError('You can only update your own properties');
    }

    // Update property
    Object.assign(property, updateData);
    await property.save();

    logger.info(`Property updated: ${propertyId} by landlord: ${landlordId}`);

    return {
      success: true,
      data: property,
      message: 'Property updated successfully',
    };
  } catch (error) {
    logger.error('Update property error:', error);
    throw error;
  }
}

/**
 * Delete property
 */
export async function deleteProperty(
  propertyId: string,
  landlordId: string
): Promise<ApiResponse<null>> {
  try {
    const property = await Property.findById(propertyId);
    
    if (!property) {
      throw new NotFoundError('Property not found');
    }

    // Check ownership
    if (property.landlordId.toString() !== landlordId) {
      throw new AuthorizationError('You can only delete your own properties');
    }

    await Property.findByIdAndDelete(propertyId);

    logger.info(`Property deleted: ${propertyId} by landlord: ${landlordId}`);

    return {
      success: true,
      data: null,
      message: 'Property deleted successfully',
    };
  } catch (error) {
    logger.error('Delete property error:', error);
    throw error;
  }
}

/**
 * Search and filter properties
 */
export async function searchProperties(
  searchParams: PropertySearchRequest
): Promise<ApiResponse<{ properties: IProperty[]; total: number; page: number; totalPages: number }>> {
  try {
    const {
      page = 1,
      limit = 10,
      propertyType,
      minPrice,
      maxPrice,
      currency = 'USD',
      city,
      state,
      amenities,
      isAvailable = true,
      isVerified,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = searchParams;

    // Build filter query
    const filter: any = {};

    if (propertyType) {
      filter.propertyType = propertyType;
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      filter.price = {};
      if (minPrice !== undefined) filter.price.$gte = minPrice;
      if (maxPrice !== undefined) filter.price.$lte = maxPrice;
    }

    if (currency) {
      filter.currency = currency;
    }

    if (city) {
      filter['location.city'] = new RegExp(city, 'i');
    }

    if (state) {
      filter['location.state'] = new RegExp(state, 'i');
    }

    if (amenities && amenities.length > 0) {
      filter.amenities = { $in: amenities };
    }

    if (isAvailable !== undefined) {
      filter.isAvailable = isAvailable;
    }

    if (isVerified !== undefined) {
      filter.isVerified = isVerified;
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Build sort object
    const sort: any = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Execute query
    const [properties, total] = await Promise.all([
      Property.find(filter)
        .populate('landlordId', 'email profileData')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Property.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      success: true,
      data: {
        properties,
        total,
        page,
        totalPages,
      },
      message: 'Properties retrieved successfully',
    };
  } catch (error) {
    logger.error('Search properties error:', error);
    throw error;
  }
}

/**
 * Get properties by landlord
 */
export async function getPropertiesByLandlord(
  landlordId: string,
  page: number = 1,
  limit: number = 10
): Promise<ApiResponse<{ properties: IProperty[]; total: number; page: number; totalPages: number }>> {
  try {
    const skip = (page - 1) * limit;

    const [properties, total] = await Promise.all([
      Property.find({ landlordId })
        .populate('landlordId', 'email profileData')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Property.countDocuments({ landlordId }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      success: true,
      data: {
        properties,
        total,
        page,
        totalPages,
      },
      message: 'Landlord properties retrieved successfully',
    };
  } catch (error) {
    logger.error('Get landlord properties error:', error);
    throw error;
  }
}

/**
 * Toggle property availability
 */
export async function togglePropertyAvailability(
  propertyId: string,
  landlordId: string
): Promise<ApiResponse<IProperty>> {
  try {
    const property = await Property.findById(propertyId);
    
    if (!property) {
      throw new NotFoundError('Property not found');
    }

    // Check ownership
    if (property.landlordId.toString() !== landlordId) {
      throw new AuthorizationError('You can only update your own properties');
    }

    // Toggle availability
    property.isAvailable = !property.isAvailable;
    await property.save();

    logger.info(`Property availability toggled: ${propertyId} to ${property.isAvailable}`);

    return {
      success: true,
      data: property,
      message: `Property ${property.isAvailable ? 'made available' : 'made unavailable'}`,
    };
  } catch (error) {
    logger.error('Toggle property availability error:', error);
    throw error;
  }
}

/**
 * Verify property (Admin only)
 */
export async function verifyProperty(
  propertyId: string,
  isVerified: boolean,
  adminNotes?: string
): Promise<ApiResponse<IProperty>> {
  try {
    const property = await Property.findById(propertyId);
    
    if (!property) {
      throw new NotFoundError('Property not found');
    }

    property.isVerified = isVerified;
    if (adminNotes) {
      (property as any).adminNotes = adminNotes;
    }

    await property.save();

    logger.info(`Property verification updated: ${propertyId} to ${isVerified}`);

    return {
      success: true,
      data: property,
      message: `Property ${isVerified ? 'verified' : 'unverified'} successfully`,
    };
  } catch (error) {
    logger.error('Verify property error:', error);
    throw error;
  }
}

/**
 * Get property statistics
 */
export async function getPropertyStatistics(): Promise<ApiResponse<{
  totalProperties: number;
  verifiedProperties: number;
  availableProperties: number;
  propertiesByType: Record<string, number>;
  averagePrice: number;
}>> {
  try {
    const [
      totalProperties,
      verifiedProperties,
      availableProperties,
      propertiesByType,
      averagePriceResult,
    ] = await Promise.all([
      Property.countDocuments(),
      Property.countDocuments({ isVerified: true }),
      Property.countDocuments({ isAvailable: true }),
      Property.aggregate([
        {
          $group: {
            _id: '$propertyType',
            count: { $sum: 1 },
          },
        },
      ]),
      Property.aggregate([
        {
          $group: {
            _id: null,
            averagePrice: { $avg: '$price' },
          },
        },
      ]),
    ]);

    const propertiesByTypeMap = propertiesByType.reduce((acc: any, item: any) => {
      acc[item._id] = item.count;
      return acc;
    }, {});

    const averagePrice = averagePriceResult[0]?.averagePrice || 0;

    return {
      success: true,
      data: {
        totalProperties,
        verifiedProperties,
        availableProperties,
        propertiesByType: propertiesByTypeMap,
        averagePrice,
      },
      message: 'Property statistics retrieved successfully',
    };
  } catch (error) {
    logger.error('Get property statistics error:', error);
    throw error;
  }
}
