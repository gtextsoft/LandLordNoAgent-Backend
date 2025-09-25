import swaggerJsdoc from 'swagger-jsdoc';
import { config } from './index';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'LandLordNoAgent API',
      version: '1.0.0',
      description: 'A comprehensive rental property management platform API built with Node.js, Express, and MongoDB. This API enables direct connections between landlords and tenants without traditional real estate agents.',
      contact: {
        name: 'LandLordNoAgent Support',
        email: 'support@landlordnoagent.com',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: `http://localhost:${config.server.port}`,
        description: 'Development server',
      },
      {
        url: 'https://api.landlordnoagent.com',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token obtained from login endpoint',
        },
      },
      schemas: {
        User: {
          type: 'object',
          required: ['email', 'passwordHash', 'role'],
          properties: {
            _id: {
              type: 'string',
              description: 'Unique user identifier',
              example: '507f1f77bcf86cd799439011',
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'User email address',
              example: 'user@example.com',
            },
            passwordHash: {
              type: 'string',
              description: 'Hashed password',
              example: '$2b$10$...',
            },
            role: {
              type: 'string',
              enum: ['CLIENT', 'LANDLORD', 'ADMIN'],
              description: 'User role',
              example: 'CLIENT',
            },
            isVerified: {
              type: 'boolean',
              description: 'Email verification status',
              example: true,
            },
            profileData: {
              type: 'object',
              properties: {
                firstName: { type: 'string', example: 'John' },
                lastName: { type: 'string', example: 'Doe' },
                phone: { type: 'string', example: '+1234567890' },
                avatar: { type: 'string', example: 'https://example.com/avatar.jpg' },
              },
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Account creation timestamp',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Last update timestamp',
            },
          },
        },
        Property: {
          type: 'object',
          required: ['title', 'description', 'price', 'location', 'landlordId'],
          properties: {
            _id: {
              type: 'string',
              description: 'Unique property identifier',
              example: '507f1f77bcf86cd799439011',
            },
            title: {
              type: 'string',
              description: 'Property title',
              example: 'Beautiful 2BR Apartment in Downtown',
            },
            description: {
              type: 'string',
              description: 'Detailed property description',
              example: 'Modern apartment with stunning city views...',
            },
            price: {
              type: 'number',
              description: 'Monthly rent price',
              example: 2500,
            },
            location: {
              type: 'string',
              description: 'Property location',
              example: '123 Main St, New York, NY 10001',
            },
            images: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of property image URLs',
              example: ['https://example.com/image1.jpg', 'https://example.com/image2.jpg'],
            },
            bedrooms: {
              type: 'number',
              description: 'Number of bedrooms',
              example: 2,
            },
            bathrooms: {
              type: 'number',
              description: 'Number of bathrooms',
              example: 2,
            },
            area: {
              type: 'number',
              description: 'Property area in square feet',
              example: 1200,
            },
            propertyType: {
              type: 'string',
              description: 'Type of property',
              example: 'apartment',
            },
            status: {
              type: 'string',
              enum: ['available', 'rented', 'maintenance'],
              description: 'Property availability status',
              example: 'available',
            },
            isVerified: {
              type: 'boolean',
              description: 'Property verification status',
              example: true,
            },
            landlordId: {
              type: 'string',
              description: 'ID of the property owner',
              example: '507f1f77bcf86cd799439011',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Property creation timestamp',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Last update timestamp',
            },
          },
        },
        Application: {
          type: 'object',
          required: ['propertyId', 'clientId'],
          properties: {
            _id: {
              type: 'string',
              description: 'Unique application identifier',
              example: '507f1f77bcf86cd799439011',
            },
            propertyId: {
              type: 'string',
              description: 'ID of the property being applied for',
              example: '507f1f77bcf86cd799439011',
            },
            clientId: {
              type: 'string',
              description: 'ID of the applicant',
              example: '507f1f77bcf86cd799439011',
            },
            status: {
              type: 'string',
              enum: ['pending', 'approved', 'rejected'],
              description: 'Application status',
              example: 'pending',
            },
            appliedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Application submission timestamp',
            },
            reviewedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Application review timestamp',
            },
          },
        },
        Payment: {
          type: 'object',
          required: ['applicationId', 'amount'],
          properties: {
            _id: {
              type: 'string',
              description: 'Unique payment identifier',
              example: '507f1f77bcf86cd799439011',
            },
            applicationId: {
              type: 'string',
              description: 'ID of the associated application',
              example: '507f1f77bcf86cd799439011',
            },
            amount: {
              type: 'number',
              description: 'Payment amount',
              example: 2500,
            },
            status: {
              type: 'string',
              enum: ['pending', 'completed', 'failed'],
              description: 'Payment status',
              example: 'completed',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Payment creation timestamp',
            },
          },
        },
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false,
            },
            error: {
              type: 'string',
              description: 'Error message',
              example: 'Invalid credentials',
            },
            message: {
              type: 'string',
              description: 'Additional error details',
              example: 'The provided email or password is incorrect',
            },
          },
        },
        Success: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            message: {
              type: 'string',
              description: 'Success message',
              example: 'Operation completed successfully',
            },
            data: {
              type: 'object',
              description: 'Response data',
            },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: [
    './src/routes/*.ts',
    './src/controllers/*.ts',
    './src/models/*.ts',
  ],
};

export const swaggerSpec = swaggerJsdoc(options);
export default swaggerSpec;
