import Application, { IApplication } from '../models/Application';
import Property from '../models/Property';
import User from '../models/User';
import { ApiResponse } from '../types';
import { logger } from '../config/logger';
import { NotFoundError, ValidationError, AuthorizationError } from '../middleware/errorHandler';

// Application creation interface
export interface CreateApplicationRequest {
  propertyId: string;
  message: string;
  moveInDate?: string;
  applicationData?: {
    employmentStatus: string;
    monthlyIncome?: number;
    references?: Array<{
      name: string;
      phone: string;
      relationship: string;
    }>;
    additionalInfo?: string;
  };
}

// Application update interface
export interface UpdateApplicationRequest {
  status?: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
  landlordNotes?: string;
  adminNotes?: string;
}

// Application search interface
export interface ApplicationSearchRequest {
  page?: number;
  limit?: number;
  status?: string;
  propertyId?: string;
  landlordId?: string;
  clientId?: string;
  sortBy?: 'createdAt' | 'updatedAt' | 'status';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Submit a new application
 */
export async function submitApplication(
  clientId: string,
  applicationData: CreateApplicationRequest
): Promise<ApiResponse<IApplication>> {
  try {
    // Verify property exists and is available
    const property = await Property.findById(applicationData.propertyId);
    if (!property) {
      throw new NotFoundError('Property not found');
    }

    if (!property.isAvailable) {
      throw new ValidationError('Property is not available for applications');
    }

    // Check if client already has a pending application for this property
    const existingApplication = await Application.findOne({
      clientId,
      propertyId: applicationData.propertyId,
      status: 'PENDING',
    });

    if (existingApplication) {
      throw new ValidationError('You already have a pending application for this property');
    }

    // Create application
    const application = new Application({
      clientId,
      propertyId: applicationData.propertyId,
      landlordId: property.landlordId,
      message: applicationData.message,
      moveInDate: applicationData.moveInDate ? new Date(applicationData.moveInDate) : undefined,
      applicationData: applicationData.applicationData || {},
      status: 'PENDING',
    });

    await application.save();

    // Populate the application with related data
    await application.populate([
      { path: 'clientId', select: 'email profileData' },
      { path: 'propertyId', select: 'title location price currency' },
      { path: 'landlordId', select: 'email profileData' },
    ]);

    logger.info(`Application submitted: ${application._id} by client: ${clientId} for property: ${applicationData.propertyId}`);

    return {
      success: true,
      data: application,
      message: 'Application submitted successfully',
    };
  } catch (error) {
    logger.error('Submit application error:', error);
    throw error;
  }
}

/**
 * Get application by ID
 */
export async function getApplicationById(applicationId: string): Promise<ApiResponse<IApplication>> {
  try {
    const application = await Application.findById(applicationId).populate([
      { path: 'clientId', select: 'email profileData kycData' },
      { path: 'propertyId', select: 'title location price currency images' },
      { path: 'landlordId', select: 'email profileData' },
    ]);

    if (!application) {
      throw new NotFoundError('Application not found');
    }

    return {
      success: true,
      data: application,
      message: 'Application retrieved successfully',
    };
  } catch (error) {
    logger.error('Get application error:', error);
    throw error;
  }
}

/**
 * Update application status (Landlord/Admin)
 */
export async function updateApplicationStatus(
  applicationId: string,
  userId: string,
  userRole: string,
  updateData: UpdateApplicationRequest
): Promise<ApiResponse<IApplication>> {
  try {
    const application = await Application.findById(applicationId);
    
    if (!application) {
      throw new NotFoundError('Application not found');
    }

    // Check permissions
    if (userRole === 'LANDLORD') {
      if (application.landlordId.toString() !== userId) {
        throw new AuthorizationError('You can only update applications for your properties');
      }
    } else if (userRole !== 'ADMIN') {
      throw new AuthorizationError('Insufficient permissions to update application');
    }

    // Update application
    if (updateData.status) {
      application.status = updateData.status as any;
    }
    if (updateData.landlordNotes) {
      application.landlordNotes = updateData.landlordNotes;
    }
    if (updateData.adminNotes) {
      application.adminNotes = updateData.adminNotes;
    }

    await application.save();

    // Populate the application with related data
    await application.populate([
      { path: 'clientId', select: 'email profileData' },
      { path: 'propertyId', select: 'title location price currency' },
      { path: 'landlordId', select: 'email profileData' },
    ]);

    logger.info(`Application status updated: ${applicationId} to ${updateData.status} by ${userRole}: ${userId}`);

    return {
      success: true,
      data: application,
      message: 'Application status updated successfully',
    };
  } catch (error) {
    logger.error('Update application status error:', error);
    throw error;
  }
}

/**
 * Get applications by user role
 */
export async function getApplicationsByUser(
  userId: string,
  userRole: string,
  searchParams: ApplicationSearchRequest = {}
): Promise<ApiResponse<{ applications: IApplication[]; total: number; page: number; totalPages: number }>> {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = searchParams;

    // Build filter based on user role
    const filter: any = {};

    if (userRole === 'CLIENT') {
      filter.clientId = userId;
    } else if (userRole === 'LANDLORD') {
      filter.landlordId = userId;
    } else if (userRole === 'ADMIN') {
      // Admin can see all applications
    } else {
      throw new AuthorizationError('Invalid user role');
    }

    if (status) {
      filter.status = status;
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Build sort object
    const sort: any = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Execute query
    const [applications, total] = await Promise.all([
      Application.find(filter)
        .populate([
          { path: 'clientId', select: 'email profileData' },
          { path: 'propertyId', select: 'title location price currency images' },
          { path: 'landlordId', select: 'email profileData' },
        ])
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Application.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      success: true,
      data: {
        applications,
        total,
        page,
        totalPages,
      },
      message: 'Applications retrieved successfully',
    };
  } catch (error) {
    logger.error('Get applications by user error:', error);
    throw error;
  }
}

/**
 * Cancel application (Client only)
 */
export async function cancelApplication(
  applicationId: string,
  clientId: string
): Promise<ApiResponse<IApplication>> {
  try {
    const application = await Application.findById(applicationId);
    
    if (!application) {
      throw new NotFoundError('Application not found');
    }

    // Check ownership
    if (application.clientId.toString() !== clientId) {
      throw new AuthorizationError('You can only cancel your own applications');
    }

    // Check if application can be cancelled
    if (application.status !== 'PENDING') {
      throw new ValidationError('Only pending applications can be cancelled');
    }

    // Update status
    application.status = 'CANCELLED';
    await application.save();

    // Populate the application with related data
    await application.populate([
      { path: 'clientId', select: 'email profileData' },
      { path: 'propertyId', select: 'title location price currency' },
      { path: 'landlordId', select: 'email profileData' },
    ]);

    logger.info(`Application cancelled: ${applicationId} by client: ${clientId}`);

    return {
      success: true,
      data: application,
      message: 'Application cancelled successfully',
    };
  } catch (error) {
    logger.error('Cancel application error:', error);
    throw error;
  }
}

/**
 * Get application statistics
 */
export async function getApplicationStatistics(
  userId?: string,
  userRole?: string
): Promise<ApiResponse<{
  totalApplications: number;
  pendingApplications: number;
  acceptedApplications: number;
  rejectedApplications: number;
  cancelledApplications: number;
  applicationsByStatus: Record<string, number>;
  averageProcessingTime: number;
}>> {
  try {
    // Build filter based on user role
    const filter: any = {};

    if (userRole === 'CLIENT') {
      filter.clientId = userId;
    } else if (userRole === 'LANDLORD') {
      filter.landlordId = userId;
    } else if (userRole === 'ADMIN') {
      // Admin can see all applications
    }

    const [
      totalApplications,
      pendingApplications,
      acceptedApplications,
      rejectedApplications,
      cancelledApplications,
      applicationsByStatus,
      averageProcessingTime,
    ] = await Promise.all([
      Application.countDocuments(filter),
      Application.countDocuments({ ...filter, status: 'PENDING' }),
      Application.countDocuments({ ...filter, status: 'ACCEPTED' }),
      Application.countDocuments({ ...filter, status: 'REJECTED' }),
      Application.countDocuments({ ...filter, status: 'CANCELLED' }),
      Application.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]),
      Application.aggregate([
        { $match: { ...filter, status: { $in: ['ACCEPTED', 'REJECTED'] } } },
        {
          $group: {
            _id: null,
            averageTime: {
              $avg: {
                $subtract: ['$updatedAt', '$createdAt'],
              },
            },
          },
        },
      ]),
    ]);

    const applicationsByStatusMap = applicationsByStatus.reduce((acc: any, item: any) => {
      acc[item._id] = item.count;
      return acc;
    }, {});

    const avgProcessingTime = averageProcessingTime[0]?.averageTime || 0;

    return {
      success: true,
      data: {
        totalApplications,
        pendingApplications,
        acceptedApplications,
        rejectedApplications,
        cancelledApplications,
        applicationsByStatus: applicationsByStatusMap,
        averageProcessingTime: avgProcessingTime,
      },
      message: 'Application statistics retrieved successfully',
    };
  } catch (error) {
    logger.error('Get application statistics error:', error);
    throw error;
  }
}

/**
 * Get applications for a specific property
 */
export async function getPropertyApplications(
  propertyId: string,
  landlordId: string,
  page: number = 1,
  limit: number = 10
): Promise<ApiResponse<{ applications: IApplication[]; total: number; page: number; totalPages: number }>> {
  try {
    // Verify property exists and belongs to landlord
    const property = await Property.findById(propertyId);
    if (!property) {
      throw new NotFoundError('Property not found');
    }

    if (property.landlordId.toString() !== landlordId) {
      throw new AuthorizationError('You can only view applications for your properties');
    }

    const skip = (page - 1) * limit;

    const [applications, total] = await Promise.all([
      Application.find({ propertyId })
        .populate([
          { path: 'clientId', select: 'email profileData kycData' },
          { path: 'propertyId', select: 'title location price currency' },
          { path: 'landlordId', select: 'email profileData' },
        ])
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Application.countDocuments({ propertyId }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      success: true,
      data: {
        applications,
        total,
        page,
        totalPages,
      },
      message: 'Property applications retrieved successfully',
    };
  } catch (error) {
    logger.error('Get property applications error:', error);
    throw error;
  }
}
