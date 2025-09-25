import { uploadFile, deleteFile, getFileInfo as getCloudinaryFileInfo, generateUploadUrl } from '../config/cloudinary';
import { ApiResponse } from '../types';
import { logger } from '../config/logger';
import { ValidationError } from '../middleware/errorHandler';

// Upload result interface
export interface UploadResult {
  files: Array<{
    publicId: string;
    url: string;
    secureUrl: string;
    fileName: string;
    fileSize: number;
    fileType: string;
  }>;
  totalFiles: number;
  totalSize: number;
}

/**
 * Upload files to Cloudinary
 */
export async function uploadToCloudinary(
  files: Express.Multer.File[] | { [fieldname: string]: Express.Multer.File[] },
  folder: string,
  context?: string
): Promise<ApiResponse<UploadResult>> {
  try {
    const fileArray: Express.Multer.File[] = [];
    let totalSize = 0;

    // Handle both array of files and object of files
    if (Array.isArray(files)) {
      fileArray.push(...files);
    } else {
      // Handle field-based uploads (like KYC documents)
      Object.values(files).forEach(fileGroup => {
        fileArray.push(...fileGroup);
      });
    }

    if (fileArray.length === 0) {
      throw new ValidationError('No files provided');
    }

    const uploadPromises = fileArray.map(async (file) => {
      // Validate file size (10MB limit)
      if (file.size > 10 * 1024 * 1024) {
        throw new ValidationError(`File ${file.originalname} exceeds 10MB limit`);
      }

      // Determine resource type based on file type
      let resourceType: 'image' | 'video' | 'raw' = 'raw';
      if (file.mimetype.startsWith('image/')) {
        resourceType = 'image';
      } else if (file.mimetype.startsWith('video/')) {
        resourceType = 'video';
      }

      // Create folder path
      const folderPath = context ? `${folder}/${context}` : folder;

      // Upload file
      const result = await uploadFile(file.buffer, {
        folder: folderPath,
        resource_type: resourceType,
      });

      totalSize += file.size;

      return {
        publicId: result.public_id,
        url: result.secure_url,
        secureUrl: result.secure_url,
        fileName: file.originalname,
        fileSize: file.size,
        fileType: file.mimetype,
      };
    });

    const uploadedFiles = await Promise.all(uploadPromises);

    logger.info(`Successfully uploaded ${uploadedFiles.length} files to folder: ${folder}`);

    return {
      success: true,
      data: {
        files: uploadedFiles,
        totalFiles: uploadedFiles.length,
        totalSize,
      },
      message: 'Files uploaded successfully',
    };
  } catch (error) {
    logger.error('Upload to Cloudinary error:', error);
    throw error;
  }
}

/**
 * Delete file from Cloudinary
 */
export async function deleteFromCloudinary(publicId: string): Promise<ApiResponse<null>> {
  try {
    await deleteFile(publicId);

    logger.info(`Successfully deleted file: ${publicId}`);

    return {
      success: true,
      data: null,
      message: 'File deleted successfully',
    };
  } catch (error) {
    logger.error('Delete from Cloudinary error:', error);
    throw error;
  }
}

/**
 * Get file information from Cloudinary
 */
export async function getFileInfo(publicId: string): Promise<ApiResponse<any>> {
  try {
    const result = await getCloudinaryFileInfo(publicId);

    return {
      success: true,
      data: result,
      message: 'File information retrieved successfully',
    };
  } catch (error) {
    logger.error('Get file info error:', error);
    throw error;
  }
}

/**
 * Generate signed upload URL
 */
export async function generateSignedUploadUrl(
  folder: string,
  resourceType: 'image' | 'video' | 'raw' = 'image'
): Promise<ApiResponse<{ uploadUrl: string; publicId: string }>> {
  try {
    const publicId = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const uploadUrl = generateUploadUrl(folder, resourceType);

    return {
      success: true,
      data: {
        uploadUrl,
        publicId,
      },
      message: 'Signed upload URL generated successfully',
    };
  } catch (error) {
    logger.error('Generate upload URL error:', error);
    throw error;
  }
}

/**
 * Batch delete files
 */
export async function batchDeleteFiles(publicIds: string[]): Promise<ApiResponse<{ deleted: string[]; failed: string[] }>> {
  try {
    const deletePromises = publicIds.map(async (publicId) => {
      try {
        await deleteFile(publicId);
        return { success: true, publicId };
      } catch (error) {
        return { success: false, publicId, error };
      }
    });

    const results = await Promise.all(deletePromises);

    const deleted = results.filter(r => r.success).map(r => r.publicId);
    const failed = results.filter(r => !r.success).map(r => r.publicId);

    logger.info(`Batch delete completed: ${deleted.length} deleted, ${failed.length} failed`);

    return {
      success: true,
      data: {
        deleted,
        failed,
      },
      message: `Batch delete completed: ${deleted.length} files deleted`,
    };
  } catch (error) {
    logger.error('Batch delete error:', error);
    throw error;
  }
}

/**
 * Validate file type
 */
export function validateFileType(file: Express.Multer.File, allowedTypes: string[]): boolean {
  return allowedTypes.includes(file.mimetype);
}

/**
 * Validate file size
 */
export function validateFileSize(file: Express.Multer.File, maxSizeInMB: number): boolean {
  const maxSizeInBytes = maxSizeInMB * 1024 * 1024;
  return file.size <= maxSizeInBytes;
}

/**
 * Get file extension
 */
export function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || '';
}

/**
 * Sanitize filename
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/_{2,}/g, '_')
    .toLowerCase();
}
