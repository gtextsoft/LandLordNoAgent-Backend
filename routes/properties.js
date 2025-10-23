const express = require('express');
const Property = require('../models/Property');
const Application = require('../models/Application');
const { verifyToken, authorize, optionalAuth } = require('../middleware/auth');

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
      city,
      state,
      zipCode,
      features,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter object
    const filters = {
      status: 'active',
      isAvailable: true,
      isVerified: true
    };

    if (minPrice || maxPrice) {
      filters.price = {};
      if (minPrice) filters.price.$gte = parseInt(minPrice);
      if (maxPrice) filters.price.$lte = parseInt(maxPrice);
    }

    if (bedrooms) filters.bedrooms = parseInt(bedrooms);
    if (bathrooms) filters.bathrooms = parseInt(bathrooms);
    if (propertyType) filters.propertyType = propertyType;

    if (city) filters['address.city'] = new RegExp(city, 'i');
    if (state) filters['address.state'] = new RegExp(state, 'i');
    if (zipCode) filters['address.zipCode'] = zipCode;

    if (features) {
      const featureArray = features.split(',');
      filters.features = { $in: featureArray };
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Execute query
    const properties = await Property.find(filters)
      .populate('landlord', 'firstName lastName email phone')
      .sort(sort)
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
    console.error('Get properties error:', error);
    res.status(500).json({ message: 'Server error while fetching properties' });
  }
});

// @route   GET /api/properties/:id
// @desc    Get single property by ID
// @access  Public
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const property = await Property.findById(req.params.id)
      .populate('landlord', 'firstName lastName email phone avatar');

    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }

    // Increment view count
    await property.incrementViews();

    res.json({ property });

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
    const propertyData = {
      ...req.body,
      landlord: req.user._id
    };

    const property = new Property(propertyData);
    await property.save();

    await property.populate('landlord', 'firstName lastName email phone');

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

    const updatedProperty = await Property.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('landlord', 'firstName lastName email phone');

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
