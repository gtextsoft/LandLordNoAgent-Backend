const express = require('express');
const multer = require('multer');
const { verifyToken } = require('../middleware/auth');
const { createCloudinaryStorage, deleteFromCloudinary, extractPublicIdFromUrl } = require('../config/cloudinary');

const router = express.Router();

// Configure multer to use Cloudinary storage
// Default storage for general uploads
const storage = createCloudinaryStorage('general');

// File filter to validate file types before upload
const fileFilter = (req, file, cb) => {
  // Define allowed file types (images, videos, documents)
  const allowedTypes = {
    // Images
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    // Videos
    'video/mp4': '.mp4',
    'video/mpeg': '.mpeg',
    'video/quicktime': '.mov',
    'video/x-msvideo': '.avi',
    'video/webm': '.webm',
    // Documents
    'application/pdf': '.pdf',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'text/plain': '.txt'
  };

  if (allowedTypes[file.mimetype]) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} is not allowed`), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB default
    files: 10 // Maximum 10 files per request
  }
});

// @route   POST /api/upload/single
// @desc    Upload a single file to Cloudinary
// @access  Private
router.post('/single', verifyToken, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // req.file.path is the Cloudinary URL when using CloudinaryStorage
    const cloudinaryUrl = req.file.path;
    const publicId = req.file.filename; // Cloudinary public ID

    res.json({
      message: 'File uploaded successfully',
      file: {
        publicId: publicId,
        filename: req.file.originalname,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        url: cloudinaryUrl,
        secureUrl: cloudinaryUrl, // Cloudinary URLs are already secure
        uploadedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ message: 'Server error while uploading file', error: error.message });
  }
});

// @route   POST /api/upload/multiple
// @desc    Upload multiple files to Cloudinary
// @access  Private
router.post('/multiple', verifyToken, upload.array('files', 10), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    const files = req.files.map(file => {
      const cloudinaryUrl = file.path;
      const publicId = file.filename;
      
      return {
        publicId: publicId,
        filename: file.originalname,
        originalName: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        url: cloudinaryUrl,
        secureUrl: cloudinaryUrl,
        uploadedAt: new Date()
      };
    });

    res.json({
      message: 'Files uploaded successfully',
      files
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ message: 'Server error while uploading files', error: error.message });
  }
});

// @route   POST /api/upload/property-images
// @desc    Upload property images to Cloudinary
// @access  Private
router.post('/property-images', verifyToken, (req, res, next) => {
  // Use property-specific folder storage
  const propertyStorage = createCloudinaryStorage('properties');
  const propertyUpload = multer({
    storage: propertyStorage,
    fileFilter: fileFilter,
    limits: {
      fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB default
      files: 20 // Maximum 20 files per request
    }
  }).array('images', 20);
  
  propertyUpload(req, res, next);
}, (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No images uploaded' });
    }

    // Filter only image files
    const imageFiles = req.files.filter(file => 
      file.mimetype && file.mimetype.startsWith('image/')
    );

    if (imageFiles.length === 0) {
      return res.status(400).json({ message: 'No valid image files uploaded' });
    }

    const images = imageFiles.map((file, index) => {
      const cloudinaryUrl = file.path;
      const publicId = file.filename;
      
      return {
        url: cloudinaryUrl,
        secureUrl: cloudinaryUrl,
        publicId: publicId,
        caption: req.body.captions ? req.body.captions[index] || '' : '',
        isPrimary: index === 0, // First image is primary by default
        filename: file.originalname,
        originalName: file.originalname,
        size: file.size,
        uploadedAt: new Date()
      };
    });

    res.json({
      message: 'Property images uploaded successfully',
      images
    });

  } catch (error) {
    console.error('Property images upload error:', error);
    res.status(500).json({ message: 'Server error while uploading property images', error: error.message });
  }
});

// @route   POST /api/upload/property-videos
// @desc    Upload property videos to Cloudinary
// @access  Private
router.post('/property-videos', verifyToken, (req, res, next) => {
  // Use property-specific folder storage for videos
  const videoStorage = createCloudinaryStorage('properties');
  const videoUpload = multer({
    storage: videoStorage,
    fileFilter: fileFilter,
    limits: {
      fileSize: parseInt(process.env.MAX_VIDEO_SIZE) || 50 * 1024 * 1024, // 50MB default for videos
      files: 5 // Maximum 5 videos per request
    }
  }).single('file');
  
  videoUpload(req, res, next);
}, (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No video uploaded' });
    }

    // Filter only video files
    if (!req.file.mimetype || !req.file.mimetype.startsWith('video/')) {
      return res.status(400).json({ message: 'File must be a video' });
    }

    const cloudinaryUrl = req.file.path;
    const publicId = req.file.filename;

    res.json({
      message: 'Video uploaded successfully',
      url: cloudinaryUrl,
      secureUrl: cloudinaryUrl,
      publicId: publicId,
      filename: req.file.originalname,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      uploadedAt: new Date()
    });

  } catch (error) {
    console.error('Property video upload error:', error);
    res.status(500).json({ message: 'Server error while uploading video', error: error.message });
  }
});

// @route   POST /api/upload/documents
// @desc    Upload documents (KYC, application documents, etc.) to Cloudinary
// @access  Private
router.post('/documents', verifyToken, (req, res, next) => {
  // Use documents-specific folder storage
  const documentsStorage = createCloudinaryStorage('documents');
  const documentsUpload = multer({
    storage: documentsStorage,
    fileFilter: fileFilter,
    limits: {
      fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB default
      files: 10 // Maximum 10 files per request
    }
  }).array('documents', 10);
  
  documentsUpload(req, res, next);
}, (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No documents uploaded' });
    }

    const documents = req.files.map(file => {
      const cloudinaryUrl = file.path;
      const publicId = file.filename;
      
      return {
        type: req.body.type || 'other',
        url: cloudinaryUrl,
        secureUrl: cloudinaryUrl,
        publicId: publicId,
        name: file.originalname,
        filename: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        uploadedAt: new Date()
      };
    });

    res.json({
      message: 'Documents uploaded successfully',
      documents
    });

  } catch (error) {
    console.error('Documents upload error:', error);
    res.status(500).json({ message: 'Server error while uploading documents', error: error.message });
  }
});

// @route   POST /api/upload/house-documents
// @desc    Upload house documents for properties to Cloudinary
// @access  Private
router.post('/house-documents', verifyToken, (req, res, next) => {
  // Use documents folder but specific for property documents
  const houseDocumentsStorage = createCloudinaryStorage('documents');
  const houseDocumentsUpload = multer({
    storage: houseDocumentsStorage,
    fileFilter: fileFilter,
    limits: {
      fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB default
      files: 10 // Maximum 10 files per request
    }
  }).array('documents', 10);
  
  houseDocumentsUpload(req, res, next);
}, (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No documents uploaded' });
    }

    const documents = req.files.map(file => {
      const cloudinaryUrl = file.path;
      const publicId = file.filename;
      
      return {
        type: 'house-document',
        url: cloudinaryUrl,
        secureUrl: cloudinaryUrl,
        publicId: publicId,
        name: file.originalname,
        filename: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        uploadedAt: new Date()
      };
    });

    res.json({
      message: 'House documents uploaded successfully',
      documents
    });

  } catch (error) {
    console.error('House documents upload error:', error);
    res.status(500).json({ message: 'Server error while uploading house documents', error: error.message });
  }
});

// @route   DELETE /api/upload
// @desc    Delete uploaded file from Cloudinary by URL or public ID
// @access  Private
router.delete('/', verifyToken, async (req, res) => {
  try {
    const { url, publicId } = req.body;

    if (!url && !publicId) {
      return res.status(400).json({ message: 'Either URL or publicId is required' });
    }

    // Extract public ID from URL if URL is provided
    let filePublicId = publicId;
    if (!filePublicId && url) {
      filePublicId = extractPublicIdFromUrl(url);
      if (!filePublicId) {
        return res.status(400).json({ message: 'Invalid Cloudinary URL. Could not extract public ID' });
      }
    }

    // Delete from Cloudinary
    // Try to detect resource type from URL
    let resourceType = 'image'; // default
    if (url) {
      if (url.includes('/video/')) {
        resourceType = 'video';
      } else if (url.includes('/raw/')) {
        resourceType = 'raw';
      } else {
        resourceType = 'image';
      }
    }
    const result = await deleteFromCloudinary(filePublicId, resourceType);

    if (result.result === 'ok') {
      res.json({ 
        message: 'File deleted successfully',
        publicId: filePublicId,
        result: result
      });
    } else if (result.result === 'not found') {
      res.status(404).json({ message: 'File not found in Cloudinary' });
    } else {
      res.status(500).json({ message: 'Failed to delete file from Cloudinary', result: result });
    }

  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ message: 'Server error while deleting file', error: error.message });
  }
});

// @route   GET /api/upload/files
// @desc    Get user's uploaded files (not applicable for Cloudinary - files are stored in database)
// @access  Private
router.get('/files', verifyToken, (req, res) => {
  // With Cloudinary, files are not stored locally, so we return empty array
  // Files should be tracked in the database with their Cloudinary URLs
  res.json({ 
    message: 'Files are stored in Cloudinary. Query files from your database records.',
    files: [] 
  });
});

// Note: Files are now served directly from Cloudinary CDN
// No need for a local file serving route
// Cloudinary URLs are accessible directly from the frontend

// Error handling middleware for multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'File too large' });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ message: 'Too many files' });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ message: 'Unexpected file field' });
    }
  }
  
  if (error.message.includes('File type')) {
    return res.status(400).json({ message: error.message });
  }

  console.error('Upload middleware error:', error);
  res.status(500).json({ message: 'Server error during file upload' });
});

module.exports = router;
