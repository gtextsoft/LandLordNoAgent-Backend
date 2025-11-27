const multer = require('multer');
const { createCloudinaryStorage, deleteFromCloudinary, extractPublicIdFromUrl } = require('../config/cloudinary');

// Storage configuration using Cloudinary
// Note: Files are now stored in Cloudinary instead of local disk
const getStorageForFolder = (folder) => {
  return createCloudinaryStorage(folder);
};

// Default storage for general uploads
const storage = getStorageForFolder('general');

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

// Upload configuration with Cloudinary storage
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

// Single file upload with folder-specific storage
const uploadSingle = (fieldName, folder = 'general') => {
  const folderStorage = getStorageForFolder(folder);
  const folderUpload = multer({
    storage: folderStorage,
    fileFilter: fileFilter,
    limits: {
      fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024,
      files: 1
    }
  });
  return [folderUpload.single(fieldName), handleUploadError];
};

// Multiple files upload with folder-specific storage
const uploadMultiple = (fieldName, maxCount = 10, folder = 'general') => {
  const folderStorage = getStorageForFolder(folder);
  const folderUpload = multer({
    storage: folderStorage,
    fileFilter: fileFilter,
    limits: {
      fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024,
      files: maxCount
    }
  });
  return [folderUpload.array(fieldName, maxCount), handleUploadError];
};

// Mixed files upload with folder-specific storage
const uploadMixed = (fields, folder = 'general') => {
  const folderStorage = getStorageForFolder(folder);
  const folderUpload = multer({
    storage: folderStorage,
    fileFilter: fileFilter,
    limits: {
      fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024
    }
  });
  return [folderUpload.fields(fields), handleUploadError];
};

// Property images upload (uses 'properties' folder in Cloudinary)
const uploadPropertyImages = uploadMultiple('images', 10, 'properties');

// User profile image upload (uses 'users' folder in Cloudinary)
const uploadProfileImage = uploadSingle('profileImage', 'users');

// Document upload (uses 'documents' folder in Cloudinary)
const uploadDocuments = uploadMultiple('documents', 5, 'documents');

// Message attachment upload (uses 'messages' folder in Cloudinary)
const uploadMessageAttachment = uploadSingle('attachment', 'messages');

// Maintenance request images upload (uses 'maintenance' folder in Cloudinary)
const uploadMaintenanceImages = uploadMultiple('images', 5, 'maintenance');

// Helper function to delete file from Cloudinary
const deleteFile = async (urlOrPublicId) => {
  try {
    // Extract public ID from URL if URL is provided
    let publicId = urlOrPublicId;
    if (urlOrPublicId && urlOrPublicId.startsWith('http')) {
      publicId = extractPublicIdFromUrl(urlOrPublicId);
      if (!publicId) {
        console.error('Could not extract public ID from URL:', urlOrPublicId);
        return false;
      }
    }
    
    // Determine resource type (default to image)
    const resourceType = urlOrPublicId && urlOrPublicId.includes('/raw/') ? 'raw' : 'image';
    const result = await deleteFromCloudinary(publicId, resourceType);
    
    return result.result === 'ok';
  } catch (error) {
    console.error('Error deleting file from Cloudinary:', error);
    return false;
  }
};

// Helper function to get file URL (now returns Cloudinary URL directly)
// For Cloudinary, the URL is already provided by req.file.path after upload
const getFileUrl = (cloudinaryUrl) => {
  // Cloudinary URLs are already complete URLs, just return them
  return cloudinaryUrl || null;
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
