import { v2 as cloudinary } from 'cloudinary';
import { config } from './index';
import { logger } from './logger';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// File upload options
export const uploadOptions = {
  // Image upload options
  image: {
    folder: 'landlordnoagent/images',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: {
      quality: 'auto',
      fetch_format: 'auto',
    },
    max_bytes: 10 * 1024 * 1024, // 10MB
  },
  
  // Document upload options
  document: {
    folder: 'landlordnoagent/documents',
    allowed_formats: ['pdf', 'doc', 'docx'],
    resource_type: 'raw' as const,
    max_bytes: 10 * 1024 * 1024, // 10MB
  },
  
  // Video upload options
  video: {
    folder: 'landlordnoagent/videos',
    allowed_formats: ['mp4', 'mov', 'avi'],
    resource_type: 'video' as const,
    max_bytes: 100 * 1024 * 1024, // 100MB
  },
};

// Upload file to Cloudinary
export async function uploadFile(
  file: Buffer,
  options: {
    folder: string;
    allowed_formats?: string[];
    resource_type?: 'image' | 'video' | 'raw';
    transformation?: any;
    max_bytes?: number;
  }
): Promise<{
  public_id: string;
  secure_url: string;
  format: string;
  bytes: number;
}> {
  try {
    // Validate file size
    if (options.max_bytes && file.length > options.max_bytes) {
      throw new Error(`File size exceeds ${options.max_bytes} bytes`);
    }

    // Upload file
    const result = await cloudinary.uploader.upload(
      `data:application/octet-stream;base64,${file.toString('base64')}`,
      {
        folder: options.folder,
        resource_type: options.resource_type || 'image',
        transformation: options.transformation,
        allowed_formats: options.allowed_formats,
      }
    );

    logger.info(`File uploaded successfully: ${result.public_id}`);

    return {
      public_id: result.public_id,
      secure_url: result.secure_url,
      format: result.format,
      bytes: result.bytes,
    };
  } catch (error) {
    logger.error('File upload error:', error);
    throw error;
  }
}

// Upload image with optimization
export async function uploadImage(
  file: Buffer,
  folder: string = 'landlordnoagent/images'
): Promise<{
  public_id: string;
  secure_url: string;
  format: string;
  bytes: number;
}> {
  return uploadFile(file, {
    ...uploadOptions.image,
    folder,
  });
}

// Upload document
export async function uploadDocument(
  file: Buffer,
  folder: string = 'landlordnoagent/documents'
): Promise<{
  public_id: string;
  secure_url: string;
  format: string;
  bytes: number;
}> {
  return uploadFile(file, {
    ...uploadOptions.document,
    folder,
  });
}

// Upload video
export async function uploadVideo(
  file: Buffer,
  folder: string = 'landlordnoagent/videos'
): Promise<{
  public_id: string;
  secure_url: string;
  format: string;
  bytes: number;
}> {
  return uploadFile(file, {
    ...uploadOptions.video,
    folder,
  });
}

// Delete file from Cloudinary
export async function deleteFile(publicId: string): Promise<void> {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    
    if (result.result === 'ok') {
      logger.info(`File deleted successfully: ${publicId}`);
    } else {
      logger.warn(`File deletion failed: ${publicId}`);
    }
  } catch (error) {
    logger.error('File deletion error:', error);
    throw error;
  }
}

// Delete multiple files
export async function deleteFiles(publicIds: string[]): Promise<void> {
  try {
    const result = await cloudinary.api.delete_resources(publicIds);
    
    logger.info(`Multiple files deletion result:`, result);
  } catch (error) {
    logger.error('Multiple files deletion error:', error);
    throw error;
  }
}

// Get file info
export async function getFileInfo(publicId: string): Promise<any> {
  try {
    const result = await cloudinary.api.resource(publicId);
    return result;
  } catch (error) {
    logger.error('Get file info error:', error);
    throw error;
  }
}

// Generate signed upload URL
export function generateUploadUrl(
  folder: string,
  resourceType: 'image' | 'video' | 'raw' = 'image'
): string {
  const timestamp = Math.round(new Date().getTime() / 1000);
  
  const signature = cloudinary.utils.api_sign_request(
    {
      timestamp,
      folder,
      resource_type: resourceType,
    },
    process.env.CLOUDINARY_API_SECRET!
  );

  return cloudinary.url(
    `${folder}/temp`,
    {
      resource_type: resourceType,
      timestamp,
      signature,
      api_key: process.env.CLOUDINARY_API_KEY,
    }
  );
}

// Transform image URL
export function transformImageUrl(
  publicId: string,
  transformations: any = {}
): string {
  return cloudinary.url(publicId, {
    ...transformations,
    secure: true,
  });
}

export default cloudinary;
