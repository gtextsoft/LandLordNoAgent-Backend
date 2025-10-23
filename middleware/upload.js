const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadsDir = './uploads';
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Create subdirectories
const subdirs = ['properties', 'users', 'documents', 'messages', 'maintenance'];
subdirs.forEach(subdir => {
  const subdirPath = path.join(uploadsDir, subdir);
  if (!fs.existsSync(subdirPath)) {
    fs.mkdirSync(subdirPath, { recursive: true });
  }
});

// Storage configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    let uploadPath = uploadsDir;
    
    // Determine upload path based on file type or route
    if (req.route?.path?.includes('property')) {
      uploadPath = path.join(uploadsDir, 'properties');
    } else if (req.route?.path?.includes('user')) {
      uploadPath = path.join(uploadsDir, 'users');
    } else if (req.route?.path?.includes('document')) {
      uploadPath = path.join(uploadsDir, 'documents');
    } else if (req.route?.path?.includes('message')) {
      uploadPath = path.join(uploadsDir, 'messages');
    } else if (req.route?.path?.includes('maintenance')) {
      uploadPath = path.join(uploadsDir, 'maintenance');
    }
    
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    const basename = path.basename(file.originalname, extension);
    const filename = `${basename}-${uniqueSuffix}${extension}`;
    cb(null, filename);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'text/plain': 'txt'
  };

  if (allowedMimeTypes[file.mimetype]) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} is not allowed`), false);
  }
};

// Upload configuration
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB default
    files: 10 // Maximum 10 files per request
  }
});

// Error handling middleware for multer
const handleUploadError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 10MB.'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files. Maximum 10 files allowed.'
      });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected field name for file upload.'
      });
    }
  }
  
  if (error.message.includes('File type')) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
  
  next(error);
};

// Single file upload
const uploadSingle = (fieldName) => [
  upload.single(fieldName),
  handleUploadError
];

// Multiple files upload
const uploadMultiple = (fieldName, maxCount = 10) => [
  upload.array(fieldName, maxCount),
  handleUploadError
];

// Mixed files upload
const uploadMixed = (fields) => [
  upload.fields(fields),
  handleUploadError
];

// Property images upload
const uploadPropertyImages = uploadMultiple('images', 10);

// User profile image upload
const uploadProfileImage = uploadSingle('profileImage');

// Document upload
const uploadDocuments = uploadMultiple('documents', 5);

// Message attachment upload
const uploadMessageAttachment = uploadSingle('attachment');

// Maintenance request images upload
const uploadMaintenanceImages = uploadMultiple('images', 5);

// Helper function to delete file
const deleteFile = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error deleting file:', error);
    return false;
  }
};

// Helper function to get file URL
const getFileUrl = (req, filePath) => {
  if (!filePath) return null;
  
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const relativePath = filePath.replace(/\\/g, '/');
  return `${baseUrl}/${relativePath}`;
};

module.exports = {
  upload,
  uploadSingle,
  uploadMultiple,
  uploadMixed,
  uploadPropertyImages,
  uploadProfileImage,
  uploadDocuments,
  uploadMessageAttachment,
  uploadMaintenanceImages,
  handleUploadError,
  deleteFile,
  getFileUrl
};
