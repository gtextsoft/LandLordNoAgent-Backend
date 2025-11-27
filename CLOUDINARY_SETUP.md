# Cloudinary Setup Guide

This project now uses Cloudinary for image and file storage instead of local disk storage.

## Environment Variables

Add the following environment variables to your `.env` file:

```env
# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

## Getting Cloudinary Credentials

1. Sign up for a free account at [https://cloudinary.com](https://cloudinary.com)
2. Navigate to your Dashboard
3. Copy your credentials from the dashboard:
   - **Cloud Name**: Found at the top of the dashboard
   - **API Key**: Listed in the Account Details section
   - **API Secret**: Listed in the Account Details section (click "Reveal" to see it)

## Folder Structure

Files uploaded to Cloudinary are organized in the following folders:

- `landlord-no-agent/general` - General file uploads
- `landlord-no-agent/properties` - Property images
- `landlord-no-agent/documents` - KYC and application documents
- `landlord-no-agent/users` - User profile images
- `landlord-no-agent/messages` - Message attachments
- `landlord-no-agent/maintenance` - Maintenance request images

## Features

- **Automatic image optimization**: Images are automatically optimized for quality and format (WebP when supported)
- **CDN delivery**: Files are served from Cloudinary's global CDN for fast loading
- **Automatic transformations**: Large images are automatically resized to a maximum of 1920x1920 pixels
- **Secure URLs**: All Cloudinary URLs use HTTPS by default

## API Changes

### Upload Response

The upload response now includes:
- `url`: The Cloudinary CDN URL (HTTPS)
- `secureUrl`: Same as `url` (for backward compatibility)
- `publicId`: The Cloudinary public ID (used for deletion)

Example response:
```json
{
  "message": "File uploaded successfully",
  "file": {
    "publicId": "landlord-no-agent/general/filename-1234567890",
    "url": "https://res.cloudinary.com/your-cloud/image/upload/v1234567890/landlord-no-agent/general/filename-1234567890.jpg",
    "secureUrl": "https://res.cloudinary.com/your-cloud/image/upload/v1234567890/landlord-no-agent/general/filename-1234567890.jpg",
    "originalName": "original-filename.jpg",
    "size": 123456,
    "uploadedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### Delete Endpoint

To delete a file, send a DELETE request to `/api/upload` with either:

```json
{
  "url": "https://res.cloudinary.com/...",
  "publicId": "landlord-no-agent/folder/filename"
}
```

Either `url` or `publicId` is required. The public ID will be extracted from the URL if only the URL is provided.

## Frontend Considerations

- Cloudinary URLs are accessible directly from any origin (no CORS issues)
- Images load from Cloudinary's CDN automatically
- No need to prepend API base URL to Cloudinary URLs
- Old local upload URLs (`/uploads/...`) will no longer work

## Migration Notes

- Old files stored locally in the `uploads/` directory will not be accessible through the new system
- Consider migrating existing file URLs in your database to Cloudinary URLs
- The `uploads/` directory is no longer used for new uploads

