const express = require('express');
const Review = require('../models/Review');
const Application = require('../models/Application');
const Property = require('../models/Property');
const User = require('../models/User');
const { verifyToken, authorize } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

const router = express.Router();

/**
 * @route   GET /api/reviews
 * @desc    Get reviews (with optional filters)
 * @access  Public (for published reviews), Private (for user's own reviews)
 */
router.get('/', async (req, res) => {
  try {
    const { propertyId, landlordId, reviewerId, status = 'published', limit = 20, page = 1 } = req.query;
    const query = { status: 'published', moderationStatus: 'approved' };

    if (propertyId) query.property = propertyId;
    if (landlordId) query.landlord = landlordId;
    if (reviewerId) query.reviewer = reviewerId;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const reviews = await Review.find(query)
      .populate('property', 'title address images')
      .populate('reviewer', 'firstName lastName avatar email')
      .populate('landlord', 'firstName lastName avatar')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await Review.countDocuments(query);

    res.json({
      success: true,
      data: reviews,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching reviews:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch reviews' });
  }
});

/**
 * @route   GET /api/reviews/:id
 * @desc    Get single review
 * @access  Public
 */
router.get('/:id', async (req, res) => {
  try {
    const review = await Review.findById(req.params.id)
      .populate('property', 'title address images')
      .populate('reviewer', 'firstName lastName avatar email')
      .populate('landlord', 'firstName lastName avatar');

    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    res.json({ success: true, data: review });
  } catch (error) {
    console.error('Error fetching review:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch review' });
  }
});

/**
 * @route   POST /api/reviews
 * @desc    Submit a new review
 * @access  Private (Client)
 */
router.post('/', 
  verifyToken, 
  authorize('client'),
  [
    body('propertyId').notEmpty().withMessage('Property ID is required'),
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('title').trim().isLength({ min: 5, max: 200 }).withMessage('Title must be between 5 and 200 characters'),
    body('comment').trim().isLength({ min: 10, max: 2000 }).withMessage('Comment must be between 10 and 2000 characters')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { propertyId, rating, title, comment, isAnonymous = false, applicationId } = req.body;
      const userId = req.user._id;

      // Verify user can review (must have approved application for this property)
      const application = await Application.findOne({
        client: userId,
        property: propertyId,
        status: 'approved'
      }).populate('property').populate('landlord');

      if (!application) {
        return res.status(403).json({ 
          success: false, 
          message: 'You can only review properties you have rented' 
        });
      }

      // Check if user already reviewed this property
      const existingReview = await Review.findOne({
        reviewer: userId,
        property: propertyId,
        status: { $in: ['published', 'pending'] }
      });

      if (existingReview) {
        return res.status(409).json({ 
          success: false, 
          message: 'You have already submitted a review for this property' 
        });
      }

      // Create review
      const review = new Review({
        property: propertyId,
        reviewer: userId,
        landlord: application.property.landlord || application.landlord,
        application: applicationId || application._id,
        rating: parseInt(rating),
        title: title.trim(),
        comment: comment.trim(),
        isAnonymous: isAnonymous === true,
        isVerified: true, // Verified since they have approved application
        verifiedAt: new Date(),
        status: 'published'
      });

      await review.save();

      // Populate response
      await review.populate([
        { path: 'property', select: 'title address images' },
        { path: 'reviewer', select: 'firstName lastName avatar email' },
        { path: 'landlord', select: 'firstName lastName avatar' }
      ]);

      res.status(201).json({
        success: true,
        message: 'Review submitted successfully',
        data: review
      });
    } catch (error) {
      console.error('Error creating review:', error);
      res.status(500).json({ success: false, message: 'Failed to submit review' });
    }
  }
);

/**
 * @route   GET /api/reviews/property/:propertyId
 * @desc    Get reviews for a specific property
 * @access  Public
 */
router.get('/property/:propertyId', async (req, res) => {
  try {
    const { propertyId } = req.params;
    const { limit = 20, page = 1 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const reviews = await Review.find({
      property: propertyId,
      status: 'published'
    })
      .populate('reviewer', 'firstName lastName avatar email')
      .populate('landlord', 'firstName lastName avatar')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await Review.countDocuments({
      property: propertyId,
      status: 'published',
      moderationStatus: 'approved'
    });

    // Calculate average rating
    const ratings = await Review.aggregate([
      { $match: { property: new mongoose.Types.ObjectId(propertyId), status: 'published', moderationStatus: 'approved' } },
      { $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } }
    ]);

    res.json({
      success: true,
      data: reviews,
      averageRating: ratings[0]?.average || 0,
      totalReviews: ratings[0]?.count || 0,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching property reviews:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch property reviews' });
  }
});

/**
 * @route   GET /api/reviews/user/my-reviews
 * @desc    Get current user's reviews
 * @access  Private
 */
router.get('/user/my-reviews', verifyToken, async (req, res) => {
  try {
    const reviews = await Review.find({ reviewer: req.user._id })
      .populate('property', 'title address images')
      .populate('landlord', 'firstName lastName avatar')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: reviews });
  } catch (error) {
    console.error('Error fetching user reviews:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch your reviews' });
  }
});

/**
 * @route   PUT /api/reviews/:id
 * @desc    Update a review (only by reviewer)
 * @access  Private
 */
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    // Check if user owns the review
    if (review.reviewer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to update this review' });
    }

    const { rating, title, comment, isAnonymous } = req.body;

    if (rating) review.rating = parseInt(rating);
    if (title) review.title = title.trim();
    if (comment) review.comment = comment.trim();
    if (isAnonymous !== undefined) review.isAnonymous = isAnonymous === true;

    await review.save();

    await review.populate([
      { path: 'property', select: 'title address images' },
      { path: 'reviewer', select: 'firstName lastName avatar email' },
      { path: 'landlord', select: 'firstName lastName avatar' }
    ]);

    res.json({
      success: true,
      message: 'Review updated successfully',
      data: review
    });
  } catch (error) {
    console.error('Error updating review:', error);
    res.status(500).json({ success: false, message: 'Failed to update review' });
  }
});

/**
 * @route   DELETE /api/reviews/:id
 * @desc    Delete a review (soft delete - only by reviewer or admin)
 * @access  Private
 */
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    // Check if user owns the review or is admin
    if (review.reviewer.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this review' });
    }

    // Soft delete
    review.status = 'deleted';
    await review.save();

    res.json({ success: true, message: 'Review deleted successfully' });
  } catch (error) {
    console.error('Error deleting review:', error);
    res.status(500).json({ success: false, message: 'Failed to delete review' });
  }
});

/**
 * @route   POST /api/reviews/:id/helpful
 * @desc    Mark review as helpful
 * @access  Private
 */
router.post('/:id/helpful', verifyToken, async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    const userId = req.user._id.toString();

    // Check if user already marked as helpful
    const alreadyHelpful = review.helpfulUsers.some(id => id.toString() === userId);

    if (alreadyHelpful) {
      // Remove helpful
      review.helpfulUsers = review.helpfulUsers.filter(id => id.toString() !== userId);
      review.helpfulCount = Math.max(0, review.helpfulCount - 1);
    } else {
      // Add helpful
      review.helpfulUsers.push(userId);
      review.helpfulCount += 1;
    }

    await review.save();

    res.json({
      success: true,
      data: {
        helpfulCount: review.helpfulCount,
        isHelpful: !alreadyHelpful
      }
    });
  } catch (error) {
    console.error('Error toggling helpful:', error);
    res.status(500).json({ success: false, message: 'Failed to update helpful status' });
  }
});

/**
 * @route   POST /api/reviews/:id/landlord-response
 * @desc    Add landlord response to review
 * @access  Private (Landlord)
 */
router.post('/:id/landlord-response',
  verifyToken,
  authorize('landlord'),
  [
    body('comment').trim().isLength({ min: 10, max: 1000 }).withMessage('Response must be between 10 and 1000 characters')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const review = await Review.findById(req.params.id);

      if (!review) {
        return res.status(404).json({ success: false, message: 'Review not found' });
      }

      // Check if landlord owns the property
      if (review.landlord.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized to respond to this review' });
      }

      review.landlordResponse = {
        comment: req.body.comment.trim(),
        respondedAt: new Date()
      };

      await review.save();

      await review.populate([
        { path: 'property', select: 'title address images' },
        { path: 'reviewer', select: 'firstName lastName avatar email' },
        { path: 'landlord', select: 'firstName lastName avatar' }
      ]);

      res.json({
        success: true,
        message: 'Response added successfully',
        data: review
      });
    } catch (error) {
      console.error('Error adding landlord response:', error);
      res.status(500).json({ success: false, message: 'Failed to add response' });
    }
  }
);

module.exports = router;

