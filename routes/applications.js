const express = require('express');
const Application = require('../models/Application');
const Property = require('../models/Property');
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
      .populate('property', 'title price address images')
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
    const { propertyId, personalInfo, employment, rentalHistory, financialInfo, preferences } = req.body;

    // Validate required fields
    if (!propertyId || !personalInfo || !employment) {
      return res.status(400).json({ 
        message: 'Property ID, personal info, and employment info are required' 
      });
    }

    // Check if property exists and is available
    const property = await Property.findById(propertyId);
    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }

    if (!property.isAvailable || property.status !== 'active') {
      return res.status(400).json({ message: 'Property is not available for applications' });
    }

    // Check if user already has an application for this property
    const existingApplication = await Application.findOne({
      client: req.user._id,
      property: propertyId
    });

    if (existingApplication) {
      return res.status(400).json({ 
        message: 'You already have an application for this property' 
      });
    }

    // Create application
    const application = new Application({
      property: propertyId,
      client: req.user._id,
      landlord: property.landlord,
      personalInfo,
      employment,
      rentalHistory: rentalHistory || [],
      financialInfo,
      preferences,
      applicationFee: {
        amount: property.applicationFee || 0
      }
    });

    await application.save();

    // Update property applications count
    await property.updateApplicationsCount();

    // Populate the response
    await application.populate([
      { path: 'property', select: 'title price address images' },
      { path: 'client', select: 'firstName lastName email phone' },
      { path: 'landlord', select: 'firstName lastName email phone' }
    ]);

    res.status(201).json({
      message: 'Application submitted successfully',
      application
    });

  } catch (error) {
    console.error('Create application error:', error);
    res.status(500).json({ message: 'Server error while creating application' });
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

    // Restrict what fields can be updated based on role and status
    const allowedUpdates = {};
    
    if (req.user.role === 'client' && application.status === 'pending') {
      // Clients can only update certain fields when application is pending
      const allowedClientFields = ['personalInfo', 'employment', 'rentalHistory', 'financialInfo', 'preferences'];
      allowedClientFields.forEach(field => {
        if (req.body[field]) allowedUpdates[field] = req.body[field];
      });
    } else if (req.user.role === 'landlord' || req.user.role === 'admin') {
      // Landlords and admins can update status and review information
      const allowedLandlordFields = ['status', 'reviewNotes', 'decision'];
      allowedLandlordFields.forEach(field => {
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
      { path: 'property', select: 'title price address images' },
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
