const { body, param, query, validationResult } = require('express-validator');

// Handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(error => ({
        field: error.path,
        message: error.msg,
        value: error.value
      }))
    });
  }
  next();
};

// User validation rules
const validateUser = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
  body('firstName')
    .trim()
    .isLength({ min: 1 })
    .withMessage('First name is required'),
  body('lastName')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Last name is required'),
  body('phone')
    .isMobilePhone()
    .withMessage('Valid phone number is required'),
  body('role')
    .optional()
    .isIn(['landlord', 'client'])
    .withMessage('Role must be either landlord or client'),
  handleValidationErrors
];

// Property validation rules
const validateProperty = [
  body('title')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Title must be between 1 and 200 characters'),
  body('description')
    .trim()
    .isLength({ min: 10 })
    .withMessage('Description must be at least 10 characters'),
  body('price')
    .isFloat({ min: 0 })
    .withMessage('Price must be a positive number'),
  body('location.address')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Address is required'),
  body('location.city')
    .trim()
    .isLength({ min: 1 })
    .withMessage('City is required'),
  body('location.state')
    .trim()
    .isLength({ min: 1 })
    .withMessage('State is required'),
  body('location.country')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Country is required'),
  body('propertyType')
    .isIn(['apartment', 'house', 'condo', 'townhouse', 'studio', 'other'])
    .withMessage('Invalid property type'),
  body('bedrooms')
    .isInt({ min: 0 })
    .withMessage('Bedrooms must be a non-negative integer'),
  body('bathrooms')
    .isFloat({ min: 0 })
    .withMessage('Bathrooms must be a non-negative number'),
  handleValidationErrors
];

// Application validation rules
const validateApplication = [
  body('propertyId')
    .isMongoId()
    .withMessage('Valid property ID is required'),
  body('applicationData.moveInDate')
    .optional()
    .isISO8601()
    .withMessage('Valid move-in date is required'),
  body('applicationData.leaseLength')
    .optional()
    .isInt({ min: 1, max: 12 })
    .withMessage('Lease length must be between 1 and 12 months (maximum allowed in Nigeria)'),
  body('applicationData.monthlyIncome')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Monthly income must be a positive number'),
  body('applicationData.employmentStatus')
    .optional()
    .isIn(['employed', 'self_employed', 'student', 'retired', 'unemployed'])
    .withMessage('Invalid employment status'),
  handleValidationErrors
];

// Payment validation rules
const validatePayment = [
  body('amount')
    .isFloat({ min: 0.01 })
    .withMessage('Amount must be greater than 0'),
  body('type')
    .isIn(['application_fee', 'security_deposit', 'first_month_rent', 'monthly_rent', 'late_fee', 'other'])
    .withMessage('Invalid payment type'),
  body('applicationId')
    .isMongoId()
    .withMessage('Valid application ID is required'),
  handleValidationErrors
];

// Maintenance request validation rules
const validateMaintenanceRequest = [
  body('propertyId')
    .isMongoId()
    .withMessage('Valid property ID is required'),
  body('title')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Title must be between 1 and 200 characters'),
  body('description')
    .trim()
    .isLength({ min: 10 })
    .withMessage('Description must be at least 10 characters'),
  body('category')
    .isIn(['plumbing', 'electrical', 'heating', 'cooling', 'appliance', 'structural', 'cleaning', 'pest_control', 'other'])
    .withMessage('Invalid category'),
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Invalid priority'),
  handleValidationErrors
];

// Viewing appointment validation rules
const validateViewingAppointment = [
  body('propertyId')
    .isMongoId()
    .withMessage('Valid property ID is required'),
  body('scheduledDate')
    .isISO8601()
    .withMessage('Valid scheduled date is required'),
  body('scheduledTime')
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Valid time format (HH:MM) is required'),
  body('duration')
    .optional()
    .isInt({ min: 15, max: 480 })
    .withMessage('Duration must be between 15 and 480 minutes'),
  handleValidationErrors
];

// Message validation rules
const validateMessage = [
  body('applicationId')
    .isMongoId()
    .withMessage('Valid application ID is required'),
  body('message')
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Message must be between 1 and 1000 characters'),
  body('messageType')
    .optional()
    .isIn(['text', 'image', 'document', 'system'])
    .withMessage('Invalid message type'),
  handleValidationErrors
];

// Pagination validation
const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  handleValidationErrors
];

// MongoDB ObjectId validation
const validateObjectId = (paramName) => [
  param(paramName)
    .isMongoId()
    .withMessage(`Valid ${paramName} is required`),
  handleValidationErrors
];

// Search validation
const validateSearch = [
  query('q')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Search query must be between 1 and 100 characters'),
  query('category')
    .optional()
    .isIn(['apartment', 'house', 'condo', 'townhouse', 'studio', 'other'])
    .withMessage('Invalid category'),
  query('minPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Minimum price must be a positive number'),
  query('maxPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Maximum price must be a positive number'),
  query('bedrooms')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Bedrooms must be a non-negative integer'),
  query('bathrooms')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Bathrooms must be a non-negative number'),
  handleValidationErrors
];

module.exports = {
  handleValidationErrors,
  validateUser,
  validateProperty,
  validateApplication,
  validatePayment,
  validateMaintenanceRequest,
  validateViewingAppointment,
  validateMessage,
  validatePagination,
  validateObjectId,
  validateSearch
};
