const express = require('express');
const Application = require('../models/Application');
const Property = require('../models/Property');
const User = require('../models/User');
const Payment = require('../models/Payment');
const { verifyToken, authorize } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/applications
// @desc    Get applications for current user
// @access  Private
router.get('/', verifyToken, async (req, res) => {
  try {
    const { status, page = 1, limit = 12 } = req.query;
    
    let filters = {};
    
    // Filter based on user role
    if (req.user.role === 'client') {
      filters.client = req.user._id;
    } else if (req.user.role === 'landlord') {
      filters.landlord = req.user._id;
    } else if (req.user.role === 'admin') {
      // Admin can see all applications
    } else {
      return res.status(403).json({ message: 'Invalid user role' });
    }

    if (status) {
      filters.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const applications = await Application.find(filters)
      .populate('property', 'title price address images rentalType propertyType')
      .populate('client', 'firstName lastName email phone')
      .populate('landlord', 'firstName lastName email phone')
      .sort({ applicationDate: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Application.countDocuments(filters);

    res.json({
      applications,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total,
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Get applications error:', error);
    res.status(500).json({ message: 'Server error while fetching applications' });
  }
});

// @route   GET /api/applications/:id
// @desc    Get single application
// @access  Private
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const application = await Application.findById(req.params.id)
      .populate('property', 'title price address images landlord')
      .populate('client', 'firstName lastName email phone')
      .populate('landlord', 'firstName lastName email phone')
      .populate('messages');

    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    // Check if user has access to this application
    const hasAccess = 
      req.user.role === 'admin' ||
      application.client._id.toString() === req.user._id.toString() ||
      application.landlord._id.toString() === req.user._id.toString();

    if (!hasAccess) {
      return res.status(403).json({ message: 'Not authorized to view this application' });
    }

    res.json({ application });

  } catch (error) {
    console.error('Get application error:', error);
    res.status(500).json({ message: 'Server error while fetching application' });
  }
});

// @route   POST /api/applications
// @desc    Create new application
// @access  Private (Client)
router.post('/', verifyToken, authorize('client'), async (req, res) => {
  try {
    // Support both new simple format and legacy complex format
    const { 
      propertyId, 
      property_id, 
      personalInfo, 
      employment, 
      rentalHistory, 
      financialInfo, 
      preferences,
      // New simple format fields
      message,
      monthly_income,
      employment_status,
      custom_employment_status,
      move_in_date,
      booking_start_date,
      booking_end_date,
      lease_duration,
      total_amount,
      kyc_docs,
      status
    } = req.body;

    // Use propertyId or property_id
    const propertyIdValue = propertyId || property_id;
    
    if (!propertyIdValue) {
      return res.status(400).json({ 
        message: 'Property ID is required' 
      });
    }

    // Check if property exists and is available
    const property = await Property.findById(propertyIdValue);
    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }

    // For verified properties, allow applications even if status is 'draft'
    const isVerified = property.isVerified;
    const isAvailable = property.isAvailable;
    const propertyStatus = property.status;
    
    if (!isAvailable || (!isVerified && propertyStatus !== 'active')) {
      return res.status(400).json({ message: 'Property is not available for applications' });
    }

    // Check if user already has an application for this property
    const existingApplication = await Application.findOne({
      client: req.user._id,
      property: propertyIdValue
    });

    if (existingApplication) {
      return res.status(400).json({ 
        message: 'You already have an application for this property' 
      });
    }

    // Build application data - support both formats
    let applicationData = {
      property: propertyIdValue,
      client: req.user._id,
      landlord: property.landlord,
      status: status || 'pending',
      applicationFee: {
        amount: property.applicationFee || 0
      }
    };

    // If using new simple format, map to backend structure
    if (message !== undefined || monthly_income !== undefined || employment_status !== undefined) {
      // Get user info for personalInfo
      const user = await User.findById(req.user._id);
      
      applicationData.personalInfo = {
        firstName: user?.firstName || req.user.firstName || '',
        lastName: user?.lastName || req.user.lastName || '',
        email: user?.email || req.user.email || '',
        phone: user?.phone || req.user.phone || ''
      };

      // Map frontend employment_status to backend enum values
      // Frontend sends: 'employed', 'part_time', 'self_employed', 'student', 'retired', 'unemployed', 'other'
      // Backend expects: 'full-time', 'part-time', 'contract', 'self-employed', 'unemployed', 'student', 'retired'
      const employmentTypeMap = {
        'employed': 'full-time',
        'part_time': 'part-time',
        'part-time': 'part-time',
        'self_employed': 'self-employed',
        'self-employed': 'self-employed',
        'contract': 'contract',
        'unemployed': 'unemployed',
        'student': 'student',
        'retired': 'retired',
        'other': 'self-employed' // Default 'other' to 'self-employed'
      };
      
      // Get mapped value or use the original if it's already a valid enum value
      const validEnumValues = ['full-time', 'part-time', 'contract', 'self-employed', 'unemployed', 'student', 'retired'];
      const mappedEmploymentType = employmentTypeMap[employment_status] || 
                                   (validEnumValues.includes(employment_status) 
                                     ? employment_status 
                                     : 'self-employed'); // Default to 'self-employed' if unknown

      applicationData.employment = {
        monthlyIncome: parseFloat(monthly_income) || 0,
        employmentType: mappedEmploymentType
      };

      applicationData.financialInfo = {
        monthlyIncome: parseFloat(monthly_income) || 0
      };

      // Add message as preferences or notes
      if (message) {
        applicationData.preferences = { message };
        applicationData.reviewNotes = message;
      }

      // Add dates
      if (move_in_date) {
        applicationData.preferences = {
          ...applicationData.preferences,
          moveInDate: move_in_date,
          leaseDuration: parseInt(lease_duration) || 12
        };
      }

      if (booking_start_date && booking_end_date) {
        applicationData.preferences = {
          ...applicationData.preferences,
          bookingStartDate: booking_start_date,
          bookingEndDate: booking_end_date,
          totalAmount: parseFloat(total_amount) || 0
        };
      }

      // Add KYC docs if provided
      if (kyc_docs && Object.keys(kyc_docs).length > 0) {
        applicationData.documents = Object.entries(kyc_docs).map(([type, url]) => ({
          type,
          url: String(url), // Convert to string (JavaScript, not TypeScript)
          uploadedAt: new Date()
        }));
      }
    } else {
      // Legacy format
      applicationData.personalInfo = personalInfo;
      applicationData.employment = employment;
      applicationData.rentalHistory = rentalHistory || [];
      applicationData.financialInfo = financialInfo;
      applicationData.preferences = preferences;
    }

    // Create application
    const application = new Application(applicationData);
    await application.save();

    // Update property applications count
    await property.updateApplicationsCount();

    // Populate the response
    await application.populate([
      { path: 'property', select: 'title price address images rentalType' },
      { path: 'client', select: 'firstName lastName email phone' },
      { path: 'landlord', select: 'firstName lastName email phone' }
    ]);

    res.status(201).json({
      message: 'Application submitted successfully',
      application
    });

  } catch (error) {
    console.error('Create application error:', error);
    res.status(500).json({ message: 'Server error while creating application', error: error.message });
  }
});

// @route   PUT /api/applications/:id
// @desc    Update application
// @access  Private
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const application = await Application.findById(req.params.id);

    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    // Check if user can update this application
    const canUpdate = 
      req.user.role === 'admin' ||
      (req.user.role === 'client' && application.client.toString() === req.user._id.toString() && application.status === 'pending') ||
      (req.user.role === 'landlord' && application.landlord.toString() === req.user._id.toString());

    if (!canUpdate) {
      return res.status(403).json({ message: 'Not authorized to update this application' });
    }

    // Check if payment has been made for this application
    const hasPayment = await Payment.findOne({ 
      application: application._id, 
      status: 'completed' 
    });

    // Restrict what fields can be updated based on role and status
    const allowedUpdates = {};
    
    if (req.user.role === 'client' && application.status === 'pending') {
      // Clients can only update certain fields when application is pending
      const allowedClientFields = ['personalInfo', 'employment', 'rentalHistory', 'financialInfo', 'preferences'];
      allowedClientFields.forEach(field => {
        if (req.body[field]) allowedUpdates[field] = req.body[field];
      });
    } else if (req.user.role === 'landlord') {
      // Landlords can update status and review information
      // BUT: Cannot reject after payment has been made
      if (req.body.status === 'rejected' && hasPayment) {
        return res.status(403).json({ 
          message: 'Cannot reject application after payment has been made. Please contact admin.' 
        });
      }
      
      const allowedLandlordFields = ['status', 'reviewNotes', 'decision'];
      allowedLandlordFields.forEach(field => {
        if (req.body[field]) allowedUpdates[field] = req.body[field];
      });
      
      if (req.body.status && req.body.status !== application.status) {
        allowedUpdates.reviewedAt = new Date();
        allowedUpdates.reviewedBy = req.user._id;
      }
    } else if (req.user.role === 'admin') {
      // Admin can update status at any time (even after payment)
      const allowedAdminFields = ['status', 'reviewNotes', 'decision'];
      allowedAdminFields.forEach(field => {
        if (req.body[field]) allowedUpdates[field] = req.body[field];
      });
      
      if (req.body.status && req.body.status !== application.status) {
        allowedUpdates.reviewedAt = new Date();
        allowedUpdates.reviewedBy = req.user._id;
      }
    }

    const updatedApplication = await Application.findByIdAndUpdate(
      req.params.id,
      allowedUpdates,
      { new: true, runValidators: true }
    ).populate([
      { path: 'property', select: 'title price address images rentalType propertyType' },
      { path: 'client', select: 'firstName lastName email phone' },
      { path: 'landlord', select: 'firstName lastName email phone' }
    ]);

    res.json({
      message: 'Application updated successfully',
      application: updatedApplication
    });

  } catch (error) {
    console.error('Update application error:', error);
    res.status(500).json({ message: 'Server error while updating application' });
  }
});

// @route   DELETE /api/applications/:id
// @desc    Delete application (withdraw)
// @access  Private (Client/Owner)
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const application = await Application.findById(req.params.id);

    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    // Check if user can delete this application
    const canDelete = 
      req.user.role === 'admin' ||
      (req.user.role === 'client' && application.client.toString() === req.user._id.toString());

    if (!canDelete) {
      return res.status(403).json({ message: 'Not authorized to delete this application' });
    }

    // Update status to withdrawn instead of deleting
    application.status = 'withdrawn';
    await application.save();

    res.json({ message: 'Application withdrawn successfully' });

  } catch (error) {
    console.error('Delete application error:', error);
    res.status(500).json({ message: 'Server error while deleting application' });
  }
});

// @route   POST /api/applications/:id/documents
// @desc    Upload application documents
// @access  Private (Client/Owner)
router.post('/:id/documents', verifyToken, async (req, res) => {
  try {
    const application = await Application.findById(req.params.id);

    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    // Check if user can upload documents
    const canUpload = 
      req.user.role === 'admin' ||
      application.client.toString() === req.user._id.toString();

    if (!canUpload) {
      return res.status(403).json({ message: 'Not authorized to upload documents for this application' });
    }

    const { documents } = req.body;

    if (!documents || !Array.isArray(documents)) {
      return res.status(400).json({ message: 'Documents array is required' });
    }

    // Add new documents to existing ones
    application.documents.push(...documents.map(doc => ({
      type: doc.type,
      url: doc.url,
      name: doc.name
    })));

    await application.save();

    res.json({
      message: 'Documents uploaded successfully',
      application
    });

  } catch (error) {
    console.error('Upload documents error:', error);
    res.status(500).json({ message: 'Server error while uploading documents' });
  }
});

// @route   GET /api/applications/property/:propertyId
// @desc    Get applications for a specific property
// @access  Private (Landlord/Owner or Admin)
router.get('/property/:propertyId', verifyToken, async (req, res) => {
  try {
    const { propertyId } = req.params;
    const { status, page = 1, limit = 12 } = req.query;

    // Check if property exists and user has access
    const property = await Property.findById(propertyId);
    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }

    const hasAccess = 
      req.user.role === 'admin' ||
      property.landlord.toString() === req.user._id.toString();

    if (!hasAccess) {
      return res.status(403).json({ message: 'Not authorized to view applications for this property' });
    }

    const filters = { property: propertyId };
    if (status) filters.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const applications = await Application.find(filters)
      .populate('client', 'firstName lastName email phone')
      .sort({ applicationDate: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Application.countDocuments(filters);

    res.json({
      applications,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total,
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Get property applications error:', error);
    res.status(500).json({ message: 'Server error while fetching applications' });
  }
});

module.exports = router;
