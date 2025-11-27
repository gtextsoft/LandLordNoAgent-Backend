const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Configure Cloudinary with credentials from environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Verify Cloudinary configuration
if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
  console.warn('⚠️  Warning: Cloudinary credentials not found in environment variables. Image uploads will fail.');
}

/**
 * Create Cloudinary storage for multer based on folder type
 * @param {string} folder - The folder name in Cloudinary (e.g., 'properties', 'users', 'documents')
 * @returns {CloudinaryStorage} Multer storage configuration
 */
const createCloudinaryStorage = (folder = 'general') => {
  return new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: `landlord-no-agent/${folder}`, // Organize uploads by folder
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'txt', 'mp4', 'mov', 'avi', 'webm', 'mpeg', 'quicktime'],
      resource_type: 'auto', // Automatically detect if it's an image, video, or raw file
      transformation: [
        // Apply transformations only for images
        {
          if: 'w > 1920 || h > 1920',
          width: 1920,
          height: 1920,
          crop: 'limit'
        },
        {
          quality: 'auto:good', // Optimize quality automatically
          fetch_format: 'auto' // Convert to modern formats like WebP when supported
        }
      ]
    }
  });
};

/**
 * Upload file to Cloudinary
 * @param {string} filePath - Path to local file
 * @param {string} folder - Folder name in Cloudinary
 * @param {object} options - Additional upload options
 * @returns {Promise} Cloudinary upload result
 */
const uploadToCloudinary = async (filePath, folder = 'general', options = {}) => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: `landlord-no-agent/${folder}`,
      resource_type: 'auto',
      ...options
    });
    return result;
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw error;
  }
};

/**
 * Upload file buffer to Cloudinary
 * @param {Buffer} buffer - File buffer
 * @param {string} folder - Folder name in Cloudinary
 * @param {object} options - Additional upload options
 * @returns {Promise} Cloudinary upload result
 */
const uploadBufferToCloudinary = async (buffer, folder = 'general', options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `landlord-no-agent/${folder}`,
        resource_type: 'auto',
        ...options
      },
      (error, result) => {
        if (error) {
          console.error('Cloudinary upload error:', error);
          reject(error);
        } else {
          resolve(result);
        }
      }
    );
    uploadStream.end(buffer);
  });
};

/**
 * Delete file from Cloudinary
 * @param {string} publicId - Public ID of the file in Cloudinary
 * @param {string} resourceType - Resource type ('image', 'video', 'raw', 'auto')
 * @returns {Promise} Cloudinary delete result
 */
const deleteFromCloudinary = async (publicId, resourceType = 'image') => {
  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType
    });
    return result;
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    throw error;
  }
};

/**
 * Extract public ID from Cloudinary URL
 * @param {string} url - Cloudinary URL
 * @returns {string|null} Public ID or null if not a Cloudinary URL
 */
const extractPublicIdFromUrl = (url) => {
  try {
    // Cloudinary URLs typically look like:
    // https://res.cloudinary.com/{cloud_name}/image/upload/{version}/{public_id}.{format}
    // https://res.cloudinary.com/{cloud_name}/video/upload/{version}/{public_id}.{format}
    // https://res.cloudinary.com/{cloud_name}/raw/upload/{version}/{public_id}.{format}
    const match = url.match(/\/(image|video|raw)\/upload\/(?:v\d+\/)?(.+?)(?:\.[^.]+)?$/);
    if (match && match[2]) {
      // Remove the folder prefix if present
      return match[2].replace(/^landlord-no-agent\//, '');
    }
    // Fallback for old format
    const fallbackMatch = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[^.]+)?$/);
    if (fallbackMatch && fallbackMatch[1]) {
      return fallbackMatch[1].replace(/^landlord-no-agent\//, '');
    }
    return null;
  } catch (error) {
    console.error('Error extracting public ID:', error);
    return null;
  }
};

module.exports = {
  cloudinary,
  createCloudinaryStorage,
  uploadToCloudinary,
  uploadBufferToCloudinary,
  deleteFromCloudinary,
  extractPublicIdFromUrl
};

