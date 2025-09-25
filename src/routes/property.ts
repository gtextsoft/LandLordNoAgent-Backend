import express from 'express';
import {
  createPropertyController,
  getPropertyController,
  updatePropertyController,
  deletePropertyController,
  searchPropertiesController,
  getLandlordPropertiesController,
  togglePropertyAvailabilityController,
  verifyPropertyController,
  getPropertyStatisticsController,
  getAllPropertiesController,
} from '../controllers/propertyController';
import { authenticateToken, requireRole } from '../middleware/auth';
import { validationSchemas } from '../middleware/validation';

const router = express.Router();

router.get('/', searchPropertiesController); // Search and filter properties

/**
 * @swagger
 * /api/properties/{id}:
 *   get:
 *     summary: Get property details by ID
 *     tags: [Properties]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Property ID
 *         example: 507f1f77bcf86cd799439011
 *     responses:
 *       200:
 *         description: Property details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Property'
 *       404:
 *         description: Property not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id', getPropertyController); // Get property details

// Landlord routes (authentication required)
router.post('/', authenticateToken, requireRole(['LANDLORD']), validationSchemas.createProperty, createPropertyController);
router.put('/:id', authenticateToken, requireRole(['LANDLORD']), validationSchemas.updateProperty, updatePropertyController);
router.delete('/:id', authenticateToken, requireRole(['LANDLORD']), validationSchemas.propertyParams, deletePropertyController);
router.get('/landlord/my-properties', authenticateToken, requireRole(['LANDLORD']), getLandlordPropertiesController);
router.put('/:id/availability', authenticateToken, requireRole(['LANDLORD']), validationSchemas.propertyParams, togglePropertyAvailabilityController);

// Admin routes (admin authentication required)
router.get('/admin/all', authenticateToken, requireRole(['ADMIN']), getAllPropertiesController);
router.put('/:id/verify', authenticateToken, requireRole(['ADMIN']), validationSchemas.propertyParams, verifyPropertyController);
router.get('/admin/statistics', authenticateToken, requireRole(['ADMIN']), getPropertyStatisticsController);

export default router;
