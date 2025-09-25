import User from '../models/User';
import { ApiResponse } from '../types';
import { logger } from '../config/logger';
import { NotFoundError, ValidationError, AuthorizationError } from '../middleware/errorHandler';

// KYC submission interface
export interface KycSubmissionRequest {
  personalInfo: {
    firstName: string;
    lastName: string;
    phone: string;
    address: string;
    city: string;
    state: string;
    postalCode: string;
    dateOfBirth: string;
    nationality: string;
    occupation: string;
    employer: string;
    monthlyIncome: number;
  };
  documents: {
    idCard: {
      fileUrl: string;
      fileName: string;
    };
    proofOfAddress: {
      fileUrl: string;
      fileName: string;
    };
    proofOfIncome: {
      fileUrl: string;
      fileName: string;
    };
    bankStatement: {
      fileUrl: string;
      fileName: string;
    };
  };
}

// KYC verification interface
export interface KycVerificationRequest {
  status: 'in_review' | 'approved' | 'rejected';
  adminNotes?: string;
  documentStatus?: {
    idCard?: 'approved' | 'rejected';
    proofOfAddress?: 'approved' | 'rejected';
    proofOfIncome?: 'approved' | 'rejected';
    bankStatement?: 'approved' | 'rejected';
  };
}

/**
 * Submit KYC data
 */
export async function submitKycData(
  userId: string,
  kycData: KycSubmissionRequest
): Promise<ApiResponse<any>> {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Check if user already has KYC data
    if (user.kycData && user.kycData.verificationStatus !== 'pending') {
      throw new ValidationError('KYC data already submitted and processed');
    }

    // Prepare KYC data
    const kycSubmission = {
      personalInfo: {
        ...kycData.personalInfo,
        dateOfBirth: new Date(kycData.personalInfo.dateOfBirth),
      },
      documents: {
        idCard: {
          ...kycData.documents.idCard,
          status: 'pending' as const,
        },
        proofOfAddress: {
          ...kycData.documents.proofOfAddress,
          status: 'pending' as const,
        },
        proofOfIncome: {
          ...kycData.documents.proofOfIncome,
          status: 'pending' as const,
        },
        bankStatement: {
          ...kycData.documents.bankStatement,
          status: 'pending' as const,
        },
      },
      verificationStatus: 'pending' as const,
      submittedAt: new Date(),
    };

    // Update user with KYC data
    user.kycData = kycSubmission;
    await user.save();

    logger.info(`KYC data submitted for user: ${userId}`);

    // Remove sensitive data from response
    const userResponse = user.toObject();
    delete (userResponse as any).passwordHash;

    return {
      success: true,
      data: userResponse,
      message: 'KYC data submitted successfully',
    };
  } catch (error) {
    logger.error('Submit KYC data error:', error);
    throw error;
  }
}

/**
 * Get KYC data for user
 */
export async function getKycData(userId: string): Promise<ApiResponse<any>> {
  try {
    const user = await User.findById(userId).select('kycData email role');
    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (!user.kycData) {
      return {
        success: true,
        data: null,
        message: 'No KYC data found',
      };
    }

    return {
      success: true,
      data: user.kycData,
      message: 'KYC data retrieved successfully',
    };
  } catch (error) {
    logger.error('Get KYC data error:', error);
    throw error;
  }
}

/**
 * Verify KYC data (Admin only)
 */
export async function verifyKycData(
  userId: string,
  verificationData: KycVerificationRequest,
  adminId: string
): Promise<ApiResponse<any>> {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (!user.kycData) {
      throw new ValidationError('No KYC data found for this user');
    }

    // Update KYC verification status
    user.kycData.verificationStatus = verificationData.status;
    user.kycData.reviewedAt = new Date();
    user.kycData.adminNotes = verificationData.adminNotes;

    // Update individual document statuses if provided
    if (verificationData.documentStatus) {
      Object.keys(verificationData.documentStatus).forEach(docType => {
        const status = verificationData.documentStatus![docType as keyof typeof verificationData.documentStatus];
        if (user.kycData && user.kycData.documents[docType as keyof typeof user.kycData.documents]) {
          (user.kycData.documents[docType as keyof typeof user.kycData.documents] as any).status = status;
        }
      });
    }

    // If approved, mark user as verified
    if (verificationData.status === 'approved') {
      user.isVerified = true;
    }

    await user.save();

    logger.info(`KYC verification updated for user: ${userId} by admin: ${adminId} to status: ${verificationData.status}`);

    // Remove sensitive data from response
    const userResponse = user.toObject();
    delete (userResponse as any).passwordHash;

    return {
      success: true,
      data: userResponse,
      message: `KYC verification ${verificationData.status} successfully`,
    };
  } catch (error) {
    logger.error('Verify KYC data error:', error);
    throw error;
  }
}

/**
 * Get pending KYC submissions (Admin only)
 */
export async function getPendingKycSubmissions(
  page: number = 1,
  limit: number = 10
): Promise<ApiResponse<{ users: any[]; total: number; page: number; totalPages: number }>> {
  try {
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      User.find({
        'kycData.verificationStatus': 'pending',
      })
        .select('email profileData kycData createdAt')
        .sort({ 'kycData.submittedAt': 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments({
        'kycData.verificationStatus': 'pending',
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      success: true,
      data: {
        users,
        total,
        page,
        totalPages,
      },
      message: 'Pending KYC submissions retrieved successfully',
    };
  } catch (error) {
    logger.error('Get pending KYC submissions error:', error);
    throw error;
  }
}

/**
 * Get KYC statistics (Admin only)
 */
export async function getKycStatistics(): Promise<ApiResponse<{
  totalSubmissions: number;
  pendingSubmissions: number;
  approvedSubmissions: number;
  rejectedSubmissions: number;
  averageProcessingTime: number;
  submissionsByMonth: Record<string, number>;
}>> {
  try {
    const [
      totalSubmissions,
      pendingSubmissions,
      approvedSubmissions,
      rejectedSubmissions,
      averageProcessingTime,
      submissionsByMonth,
    ] = await Promise.all([
      User.countDocuments({ 'kycData.verificationStatus': { $exists: true } }),
      User.countDocuments({ 'kycData.verificationStatus': 'pending' }),
      User.countDocuments({ 'kycData.verificationStatus': 'approved' }),
      User.countDocuments({ 'kycData.verificationStatus': 'rejected' }),
      User.aggregate([
        {
          $match: {
            'kycData.verificationStatus': { $in: ['approved', 'rejected'] },
            'kycData.reviewedAt': { $exists: true },
          },
        },
        {
          $group: {
            _id: null,
            averageTime: {
              $avg: {
                $subtract: ['$kycData.reviewedAt', '$kycData.submittedAt'],
              },
            },
          },
        },
      ]),
      User.aggregate([
        {
          $match: {
            'kycData.submittedAt': { $exists: true },
          },
        },
        {
          $group: {
            _id: {
              year: { $year: '$kycData.submittedAt' },
              month: { $month: '$kycData.submittedAt' },
            },
            count: { $sum: 1 },
          },
        },
        {
          $sort: { '_id.year': 1, '_id.month': 1 },
        },
      ]),
    ]);

    const avgProcessingTime = averageProcessingTime[0]?.averageTime || 0;

    const submissionsByMonthMap = submissionsByMonth.reduce((acc: any, item: any) => {
      const key = `${item._id.year}-${item._id.month.toString().padStart(2, '0')}`;
      acc[key] = item.count;
      return acc;
    }, {});

    return {
      success: true,
      data: {
        totalSubmissions,
        pendingSubmissions,
        approvedSubmissions,
        rejectedSubmissions,
        averageProcessingTime: avgProcessingTime,
        submissionsByMonth: submissionsByMonthMap,
      },
      message: 'KYC statistics retrieved successfully',
    };
  } catch (error) {
    logger.error('Get KYC statistics error:', error);
    throw error;
  }
}

/**
 * Update KYC document status
 */
export async function updateKycDocumentStatus(
  userId: string,
  documentType: 'idCard' | 'proofOfAddress' | 'proofOfIncome' | 'bankStatement',
  status: 'approved' | 'rejected',
  notes: string,
  adminId: string
): Promise<ApiResponse<any>> {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (!user.kycData) {
      throw new ValidationError('No KYC data found for this user');
    }

    // Update document status
    if (user.kycData.documents[documentType]) {
      (user.kycData.documents[documentType] as any).status = status;
      (user.kycData.documents[documentType] as any).notes = notes;
    }

    await user.save();

    logger.info(`KYC document ${documentType} status updated for user: ${userId} by admin: ${adminId} to ${status}`);

    // Remove sensitive data from response
    const userResponse = user.toObject();
    delete (userResponse as any).passwordHash;

    return {
      success: true,
      data: userResponse,
      message: `Document ${documentType} ${status} successfully`,
    };
  } catch (error) {
    logger.error('Update KYC document status error:', error);
    throw error;
  }
}
