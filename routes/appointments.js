const express = require('express');
const ViewingAppointment = require('../models/ViewingAppointment');
const Property = require('../models/Property');
const { verifyToken, authorize } = require('../middleware/auth');
const { notifyViewingAppointment } = require('../utils/notifications');

const router = express.Router();

// @route   GET /api/appointments
// @desc    Get appointments for current user
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
      // Admin can see all appointments
    } else {
      return res.status(403).json({ message: 'Invalid user role' });
    }

    if (status) {
      filters.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const appointments = await ViewingAppointment.find(filters)
      .populate('property', 'title address images price')
      .populate('client', 'firstName lastName email phone')
      .populate('landlord', 'firstName lastName email phone')
      .sort({ scheduledDate: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await ViewingAppointment.countDocuments(filters);

    res.json({
      appointments,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total,
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Get appointments error:', error);
    res.status(500).json({ message: 'Server error while fetching appointments' });
  }
});

// @route   GET /api/appointments/:id
// @desc    Get single appointment
// @access  Private
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const appointment = await ViewingAppointment.findById(req.params.id)
      .populate('property', 'title address images price landlord')
      .populate('client', 'firstName lastName email phone')
      .populate('landlord', 'firstName lastName email phone');

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    // Check if user has access to this appointment
    const hasAccess = 
      req.user.role === 'admin' ||
      appointment.client._id.toString() === req.user._id.toString() ||
      appointment.landlord._id.toString() === req.user._id.toString();

    if (!hasAccess) {
      return res.status(403).json({ message: 'Not authorized to view this appointment' });
    }

    res.json({ appointment });

  } catch (error) {
    console.error('Get appointment error:', error);
    res.status(500).json({ message: 'Server error while fetching appointment' });
  }
});

// @route   POST /api/appointments
// @desc    Create new viewing appointment
// @access  Private (Client)
router.post('/', verifyToken, authorize('client'), async (req, res) => {
  try {
    const { 
      propertyId, 
      scheduledDate, 
      scheduledTime, 
      duration = 60, 
      notes 
    } = req.body;

    // Validate required fields
    if (!propertyId || !scheduledDate || !scheduledTime) {
      return res.status(400).json({ 
        message: 'Property ID, scheduled date, and scheduled time are required' 
      });
    }

    // Check if property exists and is available for viewings
    const property = await Property.findById(propertyId);
    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }

    if (!property.viewingsEnabled || !property.isAvailable) {
      return res.status(400).json({ message: 'Property is not available for viewings' });
    }

    // Check for conflicting appointments
    const appointmentDateTime = new Date(`${scheduledDate}T${scheduledTime}`);
    const endDateTime = new Date(appointmentDateTime.getTime() + duration * 60000);

    const conflictingAppointment = await ViewingAppointment.findOne({
      property: propertyId,
      status: { $in: ['pending', 'confirmed'] },
      $or: [
        {
          scheduledDate: appointmentDateTime,
          scheduledTime: { $gte: scheduledTime, $lt: endDateTime.toTimeString().slice(0, 5) }
        },
        {
          scheduledDate: endDateTime,
          scheduledTime: { $lt: endDateTime.toTimeString().slice(0, 5) }
        }
      ]
    });

    if (conflictingAppointment) {
      return res.status(400).json({ 
        message: 'There is already an appointment scheduled at this time' 
      });
    }

    // Create appointment
    const appointment = new ViewingAppointment({
      property: propertyId,
      client: req.user._id,
      landlord: property.landlord,
      scheduledDate: new Date(scheduledDate),
      scheduledTime,
      duration,
      notes,
      status: 'pending'
    });

    await appointment.save();

    // Populate the response
    await appointment.populate([
      { path: 'property', select: 'title address images price' },
      { path: 'client', select: 'firstName lastName email phone' },
      { path: 'landlord', select: 'firstName lastName email phone' }
    ]);

    // Notify landlord about new viewing appointment
    try {
      await notifyViewingAppointment(appointment, 'scheduled', property.landlord.toString());
    } catch (notifError) {
      console.error('Error sending notification:', notifError);
      // Don't fail the request if notification fails
    }

    // Notify client
    try {
      await notifyViewingAppointment(appointment, 'scheduled', req.user._id.toString());
    } catch (notifError) {
      console.error('Error sending notification:', notifError);
      // Don't fail the request if notification fails
    }

    res.status(201).json({
      message: 'Viewing appointment requested successfully',
      appointment
    });

  } catch (error) {
    console.error('Create appointment error:', error);
    res.status(500).json({ message: 'Server error while creating appointment' });
  }
});

// @route   PUT /api/appointments/:id
// @desc    Update appointment status
// @access  Private
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const appointment = await ViewingAppointment.findById(req.params.id);

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    // Check if user can update this appointment
    const canUpdate = 
      req.user.role === 'admin' ||
      (req.user.role === 'client' && appointment.client.toString() === req.user._id.toString()) ||
      (req.user.role === 'landlord' && appointment.landlord.toString() === req.user._id.toString());

    if (!canUpdate) {
      return res.status(403).json({ message: 'Not authorized to update this appointment' });
    }

    // Restrict what fields can be updated based on role
    const allowedUpdates = {};
    
    if (req.user.role === 'client') {
      // Clients can cancel appointments or update notes
      if (req.body.status === 'cancelled') {
        allowedUpdates.status = 'cancelled';
        allowedUpdates.cancelledAt = new Date();
        allowedUpdates.cancelledBy = req.user._id;
      }
      if (req.body.notes !== undefined) {
        allowedUpdates.notes = req.body.notes;
      }
    } else if (req.user.role === 'landlord' || req.user.role === 'admin') {
      // Landlords can confirm, reject, or mark as completed
      const allowedStatuses = ['confirmed', 'rejected', 'completed'];
      if (allowedStatuses.includes(req.body.status)) {
        allowedUpdates.status = req.body.status;
        if (req.body.status === 'completed') {
          allowedUpdates.completedAt = new Date();
        }
      }
      if (req.body.notes !== undefined) {
        allowedUpdates.notes = req.body.notes;
      }
    }

    const updatedAppointment = await ViewingAppointment.findByIdAndUpdate(
      req.params.id,
      allowedUpdates,
      { new: true, runValidators: true }
    ).populate([
      { path: 'property', select: 'title address images price' },
      { path: 'client', select: 'firstName lastName email phone' },
      { path: 'landlord', select: 'firstName lastName email phone' }
    ]);

    res.json({
      message: 'Appointment updated successfully',
      appointment: updatedAppointment
    });

  } catch (error) {
    console.error('Update appointment error:', error);
    res.status(500).json({ message: 'Server error while updating appointment' });
  }
});

// @route   DELETE /api/appointments/:id
// @desc    Cancel appointment
// @access  Private (Client/Owner or Admin)
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const appointment = await ViewingAppointment.findById(req.params.id);

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    // Check if user can cancel this appointment
    const canCancel = 
      req.user.role === 'admin' ||
      (req.user.role === 'client' && appointment.client.toString() === req.user._id.toString()) ||
      (req.user.role === 'landlord' && appointment.landlord.toString() === req.user._id.toString());

    if (!canCancel) {
      return res.status(403).json({ message: 'Not authorized to cancel this appointment' });
    }

    // Update status to cancelled instead of deleting
    appointment.status = 'cancelled';
    appointment.cancelledAt = new Date();
    appointment.cancelledBy = req.user._id;
    await appointment.save();

    res.json({ message: 'Appointment cancelled successfully' });

  } catch (error) {
    console.error('Cancel appointment error:', error);
    res.status(500).json({ message: 'Server error while cancelling appointment' });
  }
});

// @route   GET /api/appointments/property/:propertyId
// @desc    Get appointments for a specific property
// @access  Private (Landlord/Owner or Admin)
router.get('/property/:propertyId', verifyToken, async (req, res) => {
  try {
    const { propertyId } = req.params;
    const { status, page = 1, limit = 12 } = req.query;

    // Check if user has access to this property's appointments
    if (req.user.role !== 'admin') {
      const property = await Property.findById(propertyId);
      if (!property || property.landlord.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Not authorized to view appointments for this property' });
      }
    }

    const filters = { property: propertyId };
    if (status) filters.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const appointments = await ViewingAppointment.find(filters)
      .populate('client', 'firstName lastName email phone')
      .sort({ scheduledDate: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await ViewingAppointment.countDocuments(filters);

    res.json({
      appointments,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total,
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Get property appointments error:', error);
    res.status(500).json({ message: 'Server error while fetching appointments' });
  }
});

module.exports = router;
