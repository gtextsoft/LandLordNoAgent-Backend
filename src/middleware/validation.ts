import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { logger } from '../config/logger';

// Validation error interface
interface ValidationError {
  field: string;
  message: string;
}

/**
 * Middleware factory to validate request data using Joi schemas
 */
export const validate = (schema: {
  body?: Joi.ObjectSchema;
  params?: Joi.ObjectSchema;
  query?: Joi.ObjectSchema;
}) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: ValidationError[] = [];

    // Validate request body
    if (schema.body) {
      const { error } = schema.body.validate(req.body, { abortEarly: false });
      if (error) {
        error.details.forEach(detail => {
          errors.push({
            field: detail.path.join('.'),
            message: detail.message,
          });
        });
      }
    }

    // Validate request parameters
    if (schema.params) {
      const { error } = schema.params.validate(req.params, { abortEarly: false });
      if (error) {
        error.details.forEach(detail => {
          errors.push({
            field: `params.${detail.path.join('.')}`,
            message: detail.message,
          });
        });
      }
    }

    // Validate query parameters
    if (schema.query) {
      const { error } = schema.query.validate(req.query, { abortEarly: false });
      if (error) {
        error.details.forEach(detail => {
          errors.push({
            field: `query.${detail.path.join('.')}`,
            message: detail.message,
          });
        });
      }
    }

    if (errors.length > 0) {
      logger.warn('Validation errors:', errors);
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors,
      });
      return;
    }

    next();
  };
};

// Common validation schemas
export const schemas = {
  // UUID validation
  uuid: Joi.string().uuid().required(),
  optionalUuid: Joi.string().uuid(),

  // Email validation
  email: Joi.string().email().required(),
  optionalEmail: Joi.string().email(),

  // Password validation
  password: Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .required()
    .messages({
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
    }),

  // User role validation
  userRole: Joi.string().valid('CLIENT', 'LANDLORD', 'ADMIN').required(),
  optionalUserRole: Joi.string().valid('CLIENT', 'LANDLORD', 'ADMIN'),

  // Property type validation
  propertyType: Joi.string().valid(
    'SELF_CONTAIN', 'MINI_FLAT', 'ONE_BEDROOM', 'TWO_BEDROOM', 'THREE_BEDROOM',
    'FOUR_BEDROOM', 'BUNGALOW', 'DETACHED_DUPLEX', 'SEMI_DETACHED_DUPLEX',
    'TERRACED_DUPLEX', 'MANSION', 'PENTHOUSE', 'SHOP', 'WAREHOUSE'
  ).required(),

  // Application status validation
  applicationStatus: Joi.string().valid('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED').required(),
  optionalApplicationStatus: Joi.string().valid('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED'),

  // Payment status validation
  paymentStatus: Joi.string().valid('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED').required(),
  optionalPaymentStatus: Joi.string().valid('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED'),

  // Currency validation
  currency: Joi.string().length(3).uppercase().default('USD'),
  optionalCurrency: Joi.string().length(3).uppercase(),

  // Price validation
  price: Joi.number().positive().precision(2).required(),
  optionalPrice: Joi.number().positive().precision(2),

  // Pagination validation
  pagination: {
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sortBy: Joi.string(),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
  },

  // Location validation
  location: Joi.object({
    address: Joi.string().required(),
    city: Joi.string().required(),
    state: Joi.string().required(),
    country: Joi.string().default('Nigeria'),
    coordinates: Joi.object({
      lat: Joi.number().min(-90).max(90),
      lng: Joi.number().min(-180).max(180),
    }).optional(),
  }).required(),

  // KYC personal info validation
  personalInfo: Joi.object({
    firstName: Joi.string().min(2).max(50).required(),
    lastName: Joi.string().min(2).max(50).required(),
    phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required(),
    address: Joi.string().min(10).max(200).required(),
    city: Joi.string().min(2).max(50).required(),
    state: Joi.string().min(2).max(50).required(),
    postalCode: Joi.string().min(3).max(10).required(),
    dateOfBirth: Joi.date().max('now').required(),
    nationality: Joi.string().min(2).max(50).required(),
    occupation: Joi.string().min(2).max(50).required(),
    employer: Joi.string().min(2).max(100).required(),
    monthlyIncome: Joi.number().positive().required(),
  }).required(),

  // Document info validation
  documentInfo: Joi.object({
    fileUrl: Joi.string().uri().required(),
    fileName: Joi.string().required(),
    status: Joi.string().valid('pending', 'approved', 'rejected').default('pending'),
    notes: Joi.string().max(500).optional(),
  }).required(),

  // Message type validation
  messageType: Joi.string().valid('TEXT', 'IMAGE', 'FILE').default('TEXT'),
  optionalMessageType: Joi.string().valid('TEXT', 'IMAGE', 'FILE'),

  // Notification priority validation
  notificationPriority: Joi.string().valid('LOW', 'MEDIUM', 'HIGH', 'URGENT').default('MEDIUM'),
  optionalNotificationPriority: Joi.string().valid('LOW', 'MEDIUM', 'HIGH', 'URGENT'),
};

// Specific validation schemas for different endpoints
export const validationSchemas = {
  // Authentication schemas
  register: validate({
    body: Joi.object({
      email: schemas.email,
      password: schemas.password,
      role: schemas.userRole,
      profileData: Joi.object({
        firstName: Joi.string().min(2).max(50),
        lastName: Joi.string().min(2).max(50),
        phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/),
      }).optional(),
    }),
  }),

  login: validate({
    body: Joi.object({
      email: schemas.email,
      password: Joi.string().required(),
    }),
  }),

  forgotPassword: validate({
    body: Joi.object({
      email: schemas.email,
    }),
  }),

  resetPassword: validate({
    body: Joi.object({
      token: Joi.string().required(),
      password: schemas.password,
    }),
  }),

  // User schemas
  updateProfile: validate({
    body: Joi.object({
      profileData: Joi.object({
        firstName: Joi.string().min(2).max(50),
        lastName: Joi.string().min(2).max(50),
        phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/),
        avatar: Joi.string().uri(),
        preferences: Joi.object({
          currency: Joi.string().length(3).uppercase(),
          notifications: Joi.object({
            email: Joi.boolean(),
            push: Joi.boolean(),
            sms: Joi.boolean(),
          }),
          language: Joi.string().length(2),
        }),
      }),
    }),
  }),

  // Property schemas
  createProperty: validate({
    body: Joi.object({
      title: Joi.string().min(5).max(100).required(),
      description: Joi.string().max(1000).optional(),
      propertyType: schemas.propertyType,
      price: schemas.price,
      currency: schemas.currency,
      location: schemas.location,
      amenities: Joi.array().items(Joi.string()).default([]),
      images: Joi.array().items(Joi.string().uri()).default([]),
      videos: Joi.array().items(Joi.string().uri()).default([]),
      houseDocuments: Joi.array().items(Joi.string().uri()).default([]),
    }),
  }),

  updateProperty: validate({
    body: Joi.object({
      title: Joi.string().min(5).max(100),
      description: Joi.string().max(1000),
      propertyType: schemas.propertyType,
      price: schemas.price,
      currency: schemas.currency,
      location: schemas.location,
      amenities: Joi.array().items(Joi.string()),
      images: Joi.array().items(Joi.string().uri()),
      videos: Joi.array().items(Joi.string().uri()),
      houseDocuments: Joi.array().items(Joi.string().uri()),
      isAvailable: Joi.boolean(),
    }),
  }),

  propertyParams: validate({
    params: Joi.object({
      id: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
    }),
  }),

  // Application schemas
  submitApplication: validate({
    body: Joi.object({
      propertyId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
      message: Joi.string().min(1).max(500).required(),
      moveInDate: Joi.string().isoDate().optional(),
      applicationData: Joi.object({
        employmentStatus: Joi.string().min(1).max(50).required(),
        monthlyIncome: Joi.number().positive().optional(),
        references: Joi.array().items(Joi.object({
          name: Joi.string().min(2).max(50).required(),
          phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required(),
          relationship: Joi.string().min(2).max(50).required(),
        })).min(1).max(3).optional(),
        additionalInfo: Joi.string().max(500).optional(),
      }).optional(),
    }),
  }),

  updateApplicationStatus: validate({
    body: Joi.object({
      status: Joi.string().valid('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED').optional(),
      landlordNotes: Joi.string().max(500).optional(),
      adminNotes: Joi.string().max(500).optional(),
    }),
  }),

  applicationParams: validate({
    params: Joi.object({
      id: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
    }),
  }),

  propertyApplicationParams: validate({
    params: Joi.object({
      propertyId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
    }),
  }),

  // Payment schemas
  createPayment: validate({
    body: Joi.object({
      applicationId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
      amount: Joi.number().positive().precision(2).required(),
      currency: Joi.string().length(3).uppercase().default('USD'),
    }),
  }),

  paymentParams: validate({
    params: Joi.object({
      id: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
    }),
  }),

  refundPayment: validate({
    body: Joi.object({
      refundAmount: Joi.number().positive().precision(2).optional(),
      reason: Joi.string().max(500).optional(),
    }),
  }),

  // Chat schemas
  sendMessage: validate({
    body: Joi.object({
      applicationId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
      content: Joi.string().min(1).max(1000).required(),
      messageType: Joi.string().valid('TEXT', 'IMAGE', 'FILE').default('TEXT'),
      fileUrl: Joi.string().uri().optional(),
    }),
  }),

  chatParams: validate({
    params: Joi.object({
      applicationId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
    }),
  }),

  // KYC schemas
  submitKyc: validate({
    body: Joi.object({
      personalInfo: schemas.personalInfo,
      documents: Joi.object({
        idCard: Joi.object({
          fileUrl: Joi.string().uri().required(),
          fileName: Joi.string().required(),
        }).required(),
        proofOfAddress: Joi.object({
          fileUrl: Joi.string().uri().required(),
          fileName: Joi.string().required(),
        }).required(),
        proofOfIncome: Joi.object({
          fileUrl: Joi.string().uri().required(),
          fileName: Joi.string().required(),
        }).required(),
        bankStatement: Joi.object({
          fileUrl: Joi.string().uri().required(),
          fileName: Joi.string().required(),
        }).required(),
      }).required(),
    }),
  }),

  updateKycStatus: validate({
    body: Joi.object({
      status: Joi.string().valid('in_review', 'approved', 'rejected').required(),
      adminNotes: Joi.string().max(500).optional(),
      documentStatus: Joi.object({
        idCard: Joi.string().valid('approved', 'rejected').optional(),
        proofOfAddress: Joi.string().valid('approved', 'rejected').optional(),
        proofOfIncome: Joi.string().valid('approved', 'rejected').optional(),
        bankStatement: Joi.string().valid('approved', 'rejected').optional(),
      }).optional(),
    }),
  }),

  // Notification schemas
  createNotification: validate({
    body: Joi.object({
      userId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
      type: Joi.string().min(1).max(50).required(),
      title: Joi.string().min(1).max(100).required(),
      message: Joi.string().min(1).max(500).required(),
      data: Joi.object().optional(),
      priority: Joi.string().valid('LOW', 'MEDIUM', 'HIGH', 'URGENT').default('MEDIUM'),
    }),
  }),

  // Report schemas
  createReport: validate({
    body: Joi.object({
      reportedUserId: schemas.optionalUuid,
      reportedPropertyId: schemas.optionalUuid,
      reportType: Joi.string().valid('SPAM', 'INAPPROPRIATE', 'FRAUD', 'HARASSMENT', 'OTHER').required(),
      description: Joi.string().min(10).max(1000).required(),
    }),
  }),

  // Dispute schemas
  createDispute: validate({
    body: Joi.object({
      landlordId: schemas.uuid,
      applicationId: schemas.uuid,
      disputeType: Joi.string().valid('PAYMENT', 'PROPERTY', 'SERVICE', 'OTHER').required(),
      description: Joi.string().min(10).max(1000).required(),
    }),
  }),

  resolveDispute: validate({
    body: Joi.object({
      resolution: Joi.string().min(10).max(1000).required(),
      adminNotes: Joi.string().max(500).optional(),
    }),
  }),

  // Pagination schemas
  pagination: validate({
    query: Joi.object(schemas.pagination),
  }),

  // Search and filter schemas
  propertySearch: validate({
    query: Joi.object({
      ...schemas.pagination,
      propertyType: Joi.array().items(schemas.propertyType),
      minPrice: Joi.number().positive(),
      maxPrice: Joi.number().positive(),
      currency: schemas.optionalCurrency,
      city: Joi.string().min(2).max(50),
      state: Joi.string().min(2).max(50),
      amenities: Joi.array().items(Joi.string()),
      isAvailable: Joi.boolean(),
      isVerified: Joi.boolean(),
    }),
  }),

  // Email verification schemas
  verifyEmailWithCode: validate({
    body: Joi.object({
      email: Joi.string().email().required(),
      verificationCode: Joi.string().length(6).pattern(/^\d+$/).required(),
    }),
  }),

  resendVerification: validate({
    body: Joi.object({
      email: Joi.string().email().required(),
    }),
  }),
};

export default validate;
