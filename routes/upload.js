const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// Ensure upload directory exists
const uploadDir = process.env.UPLOAD_PATH || './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(uploadDir, req.user._id.toString());
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  // Define allowed file types
  const allowedTypes = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
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
// @desc    Upload a single file
// @access  Private
router.post('/single', verifyToken, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Generate public URL (in production, this would be your CDN or storage service URL)
    const publicUrl = `${process.env.API_BASE_URL || 'http://localhost:5001'}/uploads/${req.user._id}/${req.file.filename}`;

    res.json({
      message: 'File uploaded successfully',
      file: {
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        url: publicUrl,
        uploadedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ message: 'Server error while uploading file' });
  }
});

// @route   POST /api/upload/multiple
// @desc    Upload multiple files
// @access  Private
router.post('/multiple', verifyToken, upload.array('files', 10), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    const files = req.files.map(file => {
      const publicUrl = `${process.env.API_BASE_URL || 'http://localhost:5001'}/uploads/${req.user._id}/${file.filename}`;
      
      return {
        filename: file.filename,
        originalName: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        url: publicUrl,
        uploadedAt: new Date()
      };
    });

    res.json({
      message: 'Files uploaded successfully',
      files
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ message: 'Server error while uploading files' });
  }
});

// @route   POST /api/upload/property-images
// @desc    Upload property images
// @access  Private
router.post('/property-images', verifyToken, upload.array('images', 20), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No images uploaded' });
    }

    // Filter only image files
    const imageFiles = req.files.filter(file => 
      file.mimetype.startsWith('image/')
    );

    if (imageFiles.length === 0) {
      return res.status(400).json({ message: 'No valid image files uploaded' });
    }

    const images = imageFiles.map((file, index) => {
      const publicUrl = `${process.env.API_BASE_URL || 'http://localhost:5001'}/uploads/${req.user._id}/${file.filename}`;
      
      return {
        url: publicUrl,
        caption: req.body.captions ? req.body.captions[index] || '' : '',
        isPrimary: index === 0, // First image is primary by default
        filename: file.filename,
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
    res.status(500).json({ message: 'Server error while uploading property images' });
  }
});

// @route   POST /api/upload/documents
// @desc    Upload documents (KYC, application documents, etc.)
// @access  Private
router.post('/documents', verifyToken, upload.array('documents', 10), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No documents uploaded' });
    }

    const documents = req.files.map(file => {
      const publicUrl = `${process.env.API_BASE_URL || 'http://localhost:5001'}/uploads/${req.user._id}/${file.filename}`;
      
      return {
        type: req.body.type || 'other',
        url: publicUrl,
        name: file.originalname,
        filename: file.filename,
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
    res.status(500).json({ message: 'Server error while uploading documents' });
  }
});

// @route   DELETE /api/upload/:filename
// @desc    Delete uploaded file
// @access  Private
router.delete('/:filename', verifyToken, (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(uploadDir, req.user._id.toString(), filename);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'File not found' });
    }

    // Delete file
    fs.unlinkSync(filePath);

    res.json({ message: 'File deleted successfully' });

  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ message: 'Server error while deleting file' });
  }
});

// @route   GET /api/upload/files
// @desc    Get user's uploaded files
// @access  Private
router.get('/files', verifyToken, (req, res) => {
  try {
    const userDir = path.join(uploadDir, req.user._id.toString());
    
    if (!fs.existsSync(userDir)) {
      return res.json({ files: [] });
    }

    const files = fs.readdirSync(userDir).map(filename => {
      const filePath = path.join(userDir, filename);
      const stats = fs.statSync(filePath);
      
      return {
        filename,
        size: stats.size,
        uploadedAt: stats.birthtime,
        url: `${process.env.API_BASE_URL || 'http://localhost:5001'}/uploads/${req.user._id}/${filename}`
      };
    });

    res.json({ files });

  } catch (error) {
    console.error('Get files error:', error);
    res.status(500).json({ message: 'Server error while fetching files' });
  }
});

// Serve uploaded files
router.use('/uploads/:userId/:filename', (req, res) => {
  try {
    const { userId, filename } = req.params;
    const filePath = path.join(uploadDir, userId, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'File not found' });
    }

    res.sendFile(path.resolve(filePath));

  } catch (error) {
    console.error('Serve file error:', error);
    res.status(500).json({ message: 'Server error while serving file' });
  }
});

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
