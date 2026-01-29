const express = require('express');
const Property = require('../models/Property');
const Application = require('../models/Application');
const User = require('../models/User');
const { verifyToken, authorize, optionalAuth } = require('../middleware/auth');
const { createAuditLog, getRequestMetadata } = require('../utils/auditLogger');

const router = express.Router();

// @route   GET /api/properties
// @desc    Get all properties with filters
// @access  Public
router.get('/', optionalAuth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 12,
      minPrice,
      maxPrice,
      bedrooms,
      bathrooms,
      propertyType,
      rentalType,
      duration,
      city,
      state,
      zipCode,
      features,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter object
    // Always filter by verified properties for public/client access
    // Admin can see all properties via /api/admin/properties
    // For verified properties, we show them regardless of status (active, draft, etc.)
    // as long as they are verified and available
    const filters = {
      isAvailable: true,
      isVerified: true // Only show verified properties to clients/tenants
    };
    
    // For client-facing queries, show verified properties regardless of status
    // This allows verified properties to be visible even if they're in 'draft' status
    // Only filter by status if explicitly requested
    if (req.query.status) {
      filters.status = req.query.status;
    } else {
      // Include multiple statuses for verified properties
      // 'draft' status is allowed for verified properties so they can be visible to clients
      filters.status = { $in: ['active', 'draft', 'published', 'live'] };
    }
    
    // Allow explicit verified parameter override (though it should always be true for clients)
    if (req.query.verified === 'false') {
      // Only allow unverified properties if explicitly requested (for admin/internal use)
      // This should be restricted to admin routes, but keeping for backward compatibility
      delete filters.isVerified;
    }

    if (minPrice || maxPrice) {
      filters.price = {};
      if (minPrice) filters.price.$gte = parseInt(minPrice);
      if (maxPrice) filters.price.$lte = parseInt(maxPrice);
    }

    if (bedrooms) filters.bedrooms = parseInt(bedrooms);
    if (bathrooms) filters.bathrooms = parseInt(bathrooms);
    if (propertyType) filters.propertyType = propertyType;
    if (rentalType) filters.rentalType = rentalType;

    // Duration filter (long-term): match properties whose minimum lease is <= desired duration.
    // This keeps short-term listings unaffected.
    if (duration && !Number.isNaN(parseInt(duration))) {
      filters['leaseTerms.minLease'] = { $lte: parseInt(duration) };
    }

    // Handle location parameter (can be city, state, or a general location string)
    // Priority: specific city/state > general location parameter
    if (city) {
      filters['address.city'] = new RegExp(city, 'i');
    } else if (state) {
      filters['address.state'] = new RegExp(state, 'i');
    } else if (req.query.location) {
      // Use general location parameter to search across city, state, and street
      const location = req.query.location;
      filters.$or = [
        { 'address.city': new RegExp(location, 'i') },
        { 'address.state': new RegExp(location, 'i') },
        { 'address.street': new RegExp(location, 'i') }
      ];
    }
    
    if (zipCode) filters['address.zipCode'] = zipCode;

    // Handle both 'features' and 'amenities' parameters (for backward compatibility)
    const featuresParam = req.query.features || req.query.amenities;
    if (featuresParam) {
      const featureArray = featuresParam.split(',');

      // Combine with any existing $or (e.g., location search) safely using $and.
      const existingOr = filters.$or ? { $or: filters.$or } : null;
      if (filters.$or) delete filters.$or;

      const featureOr = {
        $or: [
          { features: { $in: featureArray } },
          { amenities: { $in: featureArray } }
        ]
      };

      if (existingOr) {
        filters.$and = (filters.$and || []).concat([existingOr, featureOr]);
      } else {
        filters.$and = (filters.$and || []).concat([featureOr]);
      }
    }

    // Build sort object - validate sortBy field
    const validSortFields = ['createdAt', 'price', 'title', 'updatedAt', 'views'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const sort = {};
    sort[sortField] = sortOrder === 'desc' ? -1 : 1;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit) || 12;

    // Execute query with error handling
    let properties, total;
    try {
      // Don't use lean() with populate - it can cause issues
      properties = await Property.find(filters)
        .populate('landlord', 'firstName lastName email phone')
        .sort(sort)
        .skip(skip)
        .limit(limitNum);
      
      total = await Property.countDocuments(filters);
    } catch (queryError) {
      console.error('Database query error:', queryError);
      // If populate fails, try without populate
      try {
        properties = await Property.find(filters)
          .sort(sort)
          .skip(skip)
          .limit(limitNum);
        total = await Property.countDocuments(filters);
      } catch (fallbackError) {
        console.error('Fallback query error:', fallbackError);
        throw fallbackError;
      }
    }

    // Transform properties to ensure consistent format
    const transformedProperties = properties.map(prop => {
      // Handle both Mongoose documents and plain objects (from lean())
      const propObj = prop.toObject ? prop.toObject() : (prop._doc || prop);
      const landlordObj = propObj.landlord ? 
        (propObj.landlord.toObject ? propObj.landlord.toObject() : (propObj.landlord._doc || propObj.landlord)) : 
        null;
      
      return {
        ...propObj,
        _id: propObj._id,
        id: propObj._id?.toString() || propObj.id,
        // Ensure landlord is properly formatted
        landlord: landlordObj ? {
          ...landlordObj,
          id: landlordObj._id?.toString() || landlordObj.id
        } : propObj.landlord
      };
    });

    res.json({
      properties: transformedProperties,
      pagination: {
        current: parseInt(page) || 1,
        pages: Math.ceil(total / limitNum) || 1,
        total: total || 0,
        limit: limitNum
      }
    });

  } catch (error) {
    console.error('Get properties error:', error);
    res.status(500).json({ 
      message: 'Server error while fetching properties',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/properties/:id
// @desc    Get single property by ID
// @access  Public
// Note: For client-facing access, we should only show verified properties
// But for individual property pages, we allow access if the property is verified
// regardless of status (draft, active, etc.)
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const property = await Property.findById(req.params.id)
      .populate('landlord', 'firstName lastName email phone avatar');

    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }

    // For client-facing access, only show verified properties
    // Admin and landlords can see their own properties regardless of verification
    const isAdmin = req.user && req.user.role === 'admin';
    const isOwner = req.user && property.landlord && 
      (property.landlord._id?.toString() === req.user._id?.toString() || 
       property.landlord.toString() === req.user._id?.toString());

    // If not admin or owner, only show verified properties
    if (!isAdmin && !isOwner && !property.isVerified) {
      return res.status(404).json({ message: 'Property not found' });
    }

    // Increment view count
    await property.incrementViews();

    // Transform property to ensure consistent format
    const propertyObj = property.toObject ? property.toObject() : (property._doc || property);
    const landlordObj = propertyObj.landlord ? 
      (propertyObj.landlord.toObject ? propertyObj.landlord.toObject() : (propertyObj.landlord._doc || propertyObj.landlord)) : 
      null;

    const transformedProperty = {
      ...propertyObj,
      _id: propertyObj._id,
      id: propertyObj._id?.toString() || propertyObj.id,
      landlord: landlordObj ? {
        ...landlordObj,
        id: landlordObj._id?.toString() || landlordObj.id
      } : propertyObj.landlord
    };

    res.json({ property: transformedProperty });

  } catch (error) {
    console.error('Get property error:', error);
    res.status(500).json({ message: 'Server error while fetching property' });
  }
});

// @route   POST /api/properties
// @desc    Create new property
// @access  Private (Landlord)
router.post('/', verifyToken, authorize('landlord'), async (req, res) => {
  try {
    // Check if landlord is verified
    const landlord = await User.findById(req.user._id);
    if (!landlord) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!landlord.isVerified) {
      return res.status(403).json({ 
        message: 'You must be verified by admin before you can list properties. Please complete your KYC verification first.' 
      });
    }

    // Transform arrays of strings to arrays of objects for schema compliance
    const propertyData = {
      ...req.body,
      landlord: req.user._id
    };

    // Enforce maximum lease duration of 12 months (Nigeria rental law)
    if (propertyData.leaseTerms) {
      if (propertyData.leaseTerms.minLease && propertyData.leaseTerms.minLease > 12) {
        return res.status(400).json({ 
          message: 'Minimum lease duration cannot exceed 12 months as per Nigeria rental regulations' 
        });
      }
      if (propertyData.leaseTerms.maxLease && propertyData.leaseTerms.maxLease > 12) {
        return res.status(400).json({ 
          message: 'Maximum lease duration cannot exceed 12 months as per Nigeria rental regulations' 
        });
      }
      // Set maxLease to 12 if not specified or if it exceeds 12
      if (!propertyData.leaseTerms.maxLease) {
        propertyData.leaseTerms.maxLease = 12;
      } else {
        propertyData.leaseTerms.maxLease = Math.min(propertyData.leaseTerms.maxLease, 12);
      }
      // Ensure minLease doesn't exceed 12
      if (propertyData.leaseTerms.minLease) {
        propertyData.leaseTerms.minLease = Math.min(propertyData.leaseTerms.minLease, 12);
      }
    }

    // Transform images: if array of strings, convert to array of objects
    if (propertyData.images && Array.isArray(propertyData.images)) {
      propertyData.images = propertyData.images.map((img, index) => {
        if (typeof img === 'string') {
          return {
            url: img,
            caption: '',
            isPrimary: index === 0,
            uploadedAt: new Date()
          };
        }
        return img; // Already an object
      });
    }

    // Transform videos: if array of strings, convert to array of objects
    if (propertyData.videos && Array.isArray(propertyData.videos)) {
      propertyData.videos = propertyData.videos.map((video) => {
        if (typeof video === 'string') {
          return {
            url: video,
            caption: '',
            uploadedAt: new Date()
          };
        }
        return video; // Already an object
      });
    }

    // Transform houseDocuments: if array of strings, convert to array of objects
    if (propertyData.houseDocuments && Array.isArray(propertyData.houseDocuments)) {
      propertyData.houseDocuments = propertyData.houseDocuments.map((doc) => {
        if (typeof doc === 'string') {
          return {
            url: doc,
            name: '',
            type: 'other',
            uploadedAt: new Date()
          };
        }
        return doc; // Already an object
      });
    }

    // Also handle house_documents (snake_case variant)
    if (propertyData.house_documents && Array.isArray(propertyData.house_documents)) {
      if (!propertyData.houseDocuments) {
        propertyData.houseDocuments = [];
      }
      propertyData.houseDocuments = propertyData.houseDocuments.concat(
        propertyData.house_documents.map((doc) => {
          if (typeof doc === 'string') {
            return {
              url: doc,
              name: '',
              type: 'other',
              uploadedAt: new Date()
            };
          }
          return doc;
        })
      );
      delete propertyData.house_documents;
    }

    const property = new Property(propertyData);
    await property.save();

    await property.populate('landlord', 'firstName lastName email phone');

    // Audit log: Property created
    const { ipAddress, userAgent } = getRequestMetadata(req);
    await createAuditLog({
      action: 'property_created',
      entityType: 'Property',
      entityId: property._id,
      userId: req.user._id,
      details: { propertyId: property._id.toString(), title: property.title },
      ipAddress,
      userAgent
    });

    // Notify admins about new property
    try {
      const { notifyAdmins } = require('../utils/notifications');
      const landlordName = property.landlord?.firstName 
        ? `${property.landlord.firstName} ${property.landlord.lastName || ''}`.trim()
        : property.landlord?.email || 'A landlord';
      await notifyAdmins(
        'New Property Submitted',
        `${landlordName} has submitted a new property "${property.title}" for verification.`,
        'medium',
        '/admin/dashboard?tab=properties',
        { propertyId: property._id.toString(), type: 'property_submission' }
      );
    } catch (notifError) {
      console.error('Error notifying admins about property:', notifError);
    }

    res.status(201).json({
      message: 'Property created successfully',
      property
    });

  } catch (error) {
    console.error('Create property error:', error);
    res.status(500).json({ message: 'Server error while creating property' });
  }
});

// @route   PUT /api/properties/:id
// @desc    Update property
// @access  Private (Landlord/Owner or Admin)
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);

    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }

    // Check ownership or admin role
    if (property.landlord.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to update this property' });
    }

    // Transform arrays of strings to arrays of objects for schema compliance
    const updateData = { ...req.body };

    // Enforce maximum lease duration of 12 months (Nigeria rental law)
    if (updateData.leaseTerms) {
      if (updateData.leaseTerms.minLease && updateData.leaseTerms.minLease > 12) {
        return res.status(400).json({ 
          message: 'Minimum lease duration cannot exceed 12 months as per Nigeria rental regulations' 
        });
      }
      if (updateData.leaseTerms.maxLease && updateData.leaseTerms.maxLease > 12) {
        return res.status(400).json({ 
          message: 'Maximum lease duration cannot exceed 12 months as per Nigeria rental regulations' 
        });
      }
      // Set maxLease to 12 if not specified or if it exceeds 12
      if (!updateData.leaseTerms.maxLease) {
        updateData.leaseTerms.maxLease = 12;
      } else {
        updateData.leaseTerms.maxLease = Math.min(updateData.leaseTerms.maxLease, 12);
      }
      // Ensure minLease doesn't exceed 12
      if (updateData.leaseTerms.minLease) {
        updateData.leaseTerms.minLease = Math.min(updateData.leaseTerms.minLease, 12);
      }
    }

    // Transform images: if array of strings, convert to array of objects
    if (updateData.images && Array.isArray(updateData.images)) {
      updateData.images = updateData.images.map((img, index) => {
        if (typeof img === 'string') {
          return {
            url: img,
            caption: '',
            isPrimary: index === 0,
            uploadedAt: new Date()
          };
        }
        return img; // Already an object
      });
    }

    // Transform videos: if array of strings, convert to array of objects
    if (updateData.videos && Array.isArray(updateData.videos)) {
      updateData.videos = updateData.videos.map((video) => {
        if (typeof video === 'string') {
          return {
            url: video,
            caption: '',
            uploadedAt: new Date()
          };
        }
        return video; // Already an object
      });
    }

    // Transform houseDocuments: if array of strings, convert to array of objects
    if (updateData.houseDocuments && Array.isArray(updateData.houseDocuments)) {
      updateData.houseDocuments = updateData.houseDocuments.map((doc) => {
        if (typeof doc === 'string') {
          return {
            url: doc,
            name: '',
            type: 'other',
            uploadedAt: new Date()
          };
        }
        return doc; // Already an object
      });
    }

    // Also handle house_documents (snake_case variant)
    if (updateData.house_documents && Array.isArray(updateData.house_documents)) {
      if (!updateData.houseDocuments) {
        updateData.houseDocuments = [];
      }
      updateData.houseDocuments = updateData.houseDocuments.concat(
        updateData.house_documents.map((doc) => {
          if (typeof doc === 'string') {
            return {
              url: doc,
              name: '',
              type: 'other',
              uploadedAt: new Date()
            };
          }
          return doc;
        })
      );
      delete updateData.house_documents;
    }

    const updatedProperty = await Property.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('landlord', 'firstName lastName email phone');

    // Audit log: Property updated
    const { ipAddress, userAgent } = getRequestMetadata(req);
    await createAuditLog({
      action: 'property_updated',
      entityType: 'Property',
      entityId: req.params.id,
      userId: req.user._id,
      details: { propertyId: req.params.id, updatedFields: Object.keys(updateData) },
      ipAddress,
      userAgent
    });

    res.json({
      message: 'Property updated successfully',
      property: updatedProperty
    });

  } catch (error) {
    console.error('Update property error:', error);
    res.status(500).json({ message: 'Server error while updating property' });
  }
});

// @route   DELETE /api/properties/:id
// @desc    Delete property
// @access  Private (Landlord/Owner or Admin)
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);

    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }

    // Check ownership or admin role
    if (property.landlord.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to delete this property' });
    }

    await Property.findByIdAndDelete(req.params.id);

    // Audit log: Property deleted
    const { ipAddress, userAgent } = getRequestMetadata(req);
    await createAuditLog({
      action: 'property_deleted',
      entityType: 'Property',
      entityId: req.params.id,
      userId: req.user._id,
      details: { propertyId: req.params.id, title: property.title },
      ipAddress,
      userAgent
    });

    res.json({ message: 'Property deleted successfully' });

  } catch (error) {
    console.error('Delete property error:', error);
    res.status(500).json({ message: 'Server error while deleting property' });
  }
});

// @route   GET /api/properties/landlord/:landlordId
// @desc    Get properties by landlord
// @access  Private
router.get('/landlord/:landlordId', verifyToken, async (req, res) => {
  try {
    const { landlordId } = req.params;
    const { status, page = 1, limit = 12 } = req.query;

    // Check if user can view these properties
    if (req.user._id.toString() !== landlordId && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to view these properties' });
    }

    const filters = { landlord: landlordId };
    if (status) filters.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const properties = await Property.find(filters)
      .populate('landlord', 'firstName lastName email phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Property.countDocuments(filters);

    res.json({
      properties,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total,
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Get landlord properties error:', error);
    res.status(500).json({ message: 'Server error while fetching properties' });
  }
});

// @route   POST /api/properties/:id/images
// @desc    Upload property images
// @access  Private (Landlord/Owner)
router.post('/:id/images', verifyToken, async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);

    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }

    if (property.landlord.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to upload images for this property' });
    }

    // This would typically handle file uploads
    // For now, we'll expect the file URLs to be passed in the request body
    const { images } = req.body;

    if (!images || !Array.isArray(images)) {
      return res.status(400).json({ message: 'Images array is required' });
    }

    // Add new images to existing ones
    property.images.push(...images.map(img => ({
      url: img.url,
      caption: img.caption || '',
      isPrimary: img.isPrimary || false
    })));

    await property.save();

    res.json({
      message: 'Images uploaded successfully',
      property
    });

  } catch (error) {
    console.error('Upload images error:', error);
    res.status(500).json({ message: 'Server error while uploading images' });
  }
});

// @route   DELETE /api/properties/:id/images/:imageId
// @desc    Delete property image
// @access  Private (Landlord/Owner)
router.delete('/:id/images/:imageId', verifyToken, async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);

    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }

    if (property.landlord.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to delete images for this property' });
    }

    property.images = property.images.filter(
      img => img._id.toString() !== req.params.imageId
    );

    await property.save();

    res.json({
      message: 'Image deleted successfully',
      property
    });

  } catch (error) {
    console.error('Delete image error:', error);
    res.status(500).json({ message: 'Server error while deleting image' });
  }
});

// @route   GET /api/properties/search/similar
// @desc    Get similar properties
// @access  Public
router.get('/search/similar', async (req, res) => {
  try {
    const { propertyId, limit = 6 } = req.query;

    const property = await Property.findById(propertyId);
    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }

    // Find similar properties based on location, price range, and type
    const priceRange = property.price * 0.2; // 20% price range
    const filters = {
      _id: { $ne: property._id },
      status: 'active',
      isAvailable: true,
      isVerified: true,
      propertyType: property.propertyType,
      bedrooms: property.bedrooms,
      'address.city': property.address.city,
      price: {
        $gte: property.price - priceRange,
        $lte: property.price + priceRange
      }
    };

    const similarProperties = await Property.find(filters)
      .populate('landlord', 'firstName lastName email phone')
      .limit(parseInt(limit));

    res.json({ properties: similarProperties });

  } catch (error) {
    console.error('Get similar properties error:', error);
    res.status(500).json({ message: 'Server error while fetching similar properties' });
  }
});

module.exports = router;
