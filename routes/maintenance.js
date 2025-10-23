const express = require('express');
const MaintenanceRequest = require('../models/MaintenanceRequest');
const Application = require('../models/Application');
const { verifyToken, authorize } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/maintenance
// @desc    Get maintenance requests for current user
// @access  Private
router.get('/', verifyToken, async (req, res) => {
  try {
    const { status, page = 1, limit = 12 } = req.query;
    
    let filters = {};
    
    // Filter based on user role
    if (req.user.role === 'client') {
      filters.tenant = req.user._id;
    } else if (req.user.role === 'landlord') {
      filters.landlord = req.user._id;
    } else if (req.user.role === 'admin') {
      // Admin can see all maintenance requests
    } else {
      return res.status(403).json({ message: 'Invalid user role' });
    }

    if (status) {
      filters.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const requests = await MaintenanceRequest.find(filters)
      .populate('property', 'title address images')
      .populate('tenant', 'firstName lastName email phone')
      .populate('landlord', 'firstName lastName email phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await MaintenanceRequest.countDocuments(filters);

    res.json({
      requests,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total,
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Get maintenance requests error:', error);
    res.status(500).json({ message: 'Server error while fetching maintenance requests' });
  }
});

// @route   GET /api/maintenance/:id
// @desc    Get single maintenance request
// @access  Private
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const request = await MaintenanceRequest.findById(req.params.id)
      .populate('property', 'title address images landlord')
      .populate('tenant', 'firstName lastName email phone')
      .populate('landlord', 'firstName lastName email phone');

    if (!request) {
      return res.status(404).json({ message: 'Maintenance request not found' });
    }

    // Check if user has access to this request
    const hasAccess = 
      req.user.role === 'admin' ||
      request.tenant._id.toString() === req.user._id.toString() ||
      request.landlord._id.toString() === req.user._id.toString();

    if (!hasAccess) {
      return res.status(403).json({ message: 'Not authorized to view this maintenance request' });
    }

    res.json({ request });

  } catch (error) {
    console.error('Get maintenance request error:', error);
    res.status(500).json({ message: 'Server error while fetching maintenance request' });
  }
});

// @route   POST /api/maintenance
// @desc    Create new maintenance request
// @access  Private
router.post('/', verifyToken, async (req, res) => {
  try {
    const { 
      propertyId, 
      title, 
      description, 
      priority, 
      category, 
      estimatedCost,
      scheduledDate 
    } = req.body;

    // Validate required fields
    if (!propertyId || !title || !description || !priority || !category) {
      return res.status(400).json({ 
        message: 'Property ID, title, description, priority, and category are required' 
      });
    }

    // Get property and verify access
    const property = await Application.findOne({ 
      property: propertyId, 
      client: req.user._id,
      status: 'approved'
    }).populate('property');

    if (!property) {
      return res.status(404).json({ 
        message: 'Property not found or you do not have an approved application for this property' 
      });
    }

    // Create maintenance request
    const maintenanceRequest = new MaintenanceRequest({
      property: propertyId,
      tenant: req.user._id,
      landlord: property.property.landlord,
      title,
      description,
      priority,
      category,
      status: 'pending',
      estimatedCost: estimatedCost ? parseFloat(estimatedCost) : null,
      scheduledDate: scheduledDate ? new Date(scheduledDate) : null
    });

    await maintenanceRequest.save();

    // Populate the response
    await maintenanceRequest.populate([
      { path: 'property', select: 'title address images' },
      { path: 'tenant', select: 'firstName lastName email phone' },
      { path: 'landlord', select: 'firstName lastName email phone' }
    ]);

    res.status(201).json({
      message: 'Maintenance request submitted successfully',
      request: maintenanceRequest
    });

  } catch (error) {
    console.error('Create maintenance request error:', error);
    res.status(500).json({ message: 'Server error while creating maintenance request' });
  }
});

// @route   PUT /api/maintenance/:id
// @desc    Update maintenance request
// @access  Private
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const request = await MaintenanceRequest.findById(req.params.id);

    if (!request) {
      return res.status(404).json({ message: 'Maintenance request not found' });
    }

    // Check if user can update this request
    const canUpdate = 
      req.user.role === 'admin' ||
      (req.user.role === 'client' && request.tenant.toString() === req.user._id.toString() && request.status === 'pending') ||
      (req.user.role === 'landlord' && request.landlord.toString() === req.user._id.toString());

    if (!canUpdate) {
      return res.status(403).json({ message: 'Not authorized to update this maintenance request' });
    }

    // Restrict what fields can be updated based on role and status
    const allowedUpdates = {};
    
    if (req.user.role === 'client' && request.status === 'pending') {
      // Clients can only update certain fields when request is pending
      const allowedClientFields = ['title', 'description', 'priority', 'category', 'estimatedCost', 'scheduledDate'];
      allowedClientFields.forEach(field => {
        if (req.body[field] !== undefined) {
          allowedUpdates[field] = req.body[field];
        }
      });
    } else if (req.user.role === 'landlord' || req.user.role === 'admin') {
      // Landlords and admins can update status and other fields
      const allowedLandlordFields = ['status', 'notes', 'actualCost', 'completedDate', 'assignedTo'];
      allowedLandlordFields.forEach(field => {
        if (req.body[field] !== undefined) {
          allowedUpdates[field] = req.body[field];
        }
      });
    }

    const updatedRequest = await MaintenanceRequest.findByIdAndUpdate(
      req.params.id,
      allowedUpdates,
      { new: true, runValidators: true }
    ).populate([
      { path: 'property', select: 'title address images' },
      { path: 'tenant', select: 'firstName lastName email phone' },
      { path: 'landlord', select: 'firstName lastName email phone' }
    ]);

    res.json({
      message: 'Maintenance request updated successfully',
      request: updatedRequest
    });

  } catch (error) {
    console.error('Update maintenance request error:', error);
    res.status(500).json({ message: 'Server error while updating maintenance request' });
  }
});

// @route   DELETE /api/maintenance/:id
// @desc    Delete maintenance request
// @access  Private (Tenant/Owner or Admin)
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const request = await MaintenanceRequest.findById(req.params.id);

    if (!request) {
      return res.status(404).json({ message: 'Maintenance request not found' });
    }

    // Check if user can delete this request
    const canDelete = 
      req.user.role === 'admin' ||
      (req.user.role === 'client' && request.tenant.toString() === req.user._id.toString() && request.status === 'pending');

    if (!canDelete) {
      return res.status(403).json({ message: 'Not authorized to delete this maintenance request' });
    }

    await MaintenanceRequest.findByIdAndDelete(req.params.id);

    res.json({ message: 'Maintenance request deleted successfully' });

  } catch (error) {
    console.error('Delete maintenance request error:', error);
    res.status(500).json({ message: 'Server error while deleting maintenance request' });
  }
});

// @route   GET /api/maintenance/property/:propertyId
// @desc    Get maintenance requests for a specific property
// @access  Private (Landlord/Owner or Admin)
router.get('/property/:propertyId', verifyToken, async (req, res) => {
  try {
    const { propertyId } = req.params;
    const { status, page = 1, limit = 12 } = req.query;

    // Check if user has access to this property's maintenance requests
    if (req.user.role !== 'admin') {
      // For landlords, check if they own the property
      const property = await Property.findById(propertyId);
      if (!property || property.landlord.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Not authorized to view maintenance requests for this property' });
      }
    }

    const filters = { property: propertyId };
    if (status) filters.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const requests = await MaintenanceRequest.find(filters)
      .populate('tenant', 'firstName lastName email phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await MaintenanceRequest.countDocuments(filters);

    res.json({
      requests,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total,
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Get property maintenance requests error:', error);
    res.status(500).json({ message: 'Server error while fetching maintenance requests' });
  }
});

module.exports = router;
