# CV PDF GridFS Integration with TTL

This document describes the implementation of CV PDF storage in MongoDB GridFS with automatic TTL-based deletion.

## Overview

The CV PDF integration provides:
- **Secure PDF Generation**: Creates professional CVs from user data
- **GridFS Storage**: Stores PDFs in MongoDB GridFS for scalability
- **TTL Auto-Deletion**: Automatically deletes PDFs after 30 minutes
- **Authorized Downloads**: Only authenticated users can download PDFs
- **Subscription Limits**: Respects user subscription tier limits

## Architecture

```
User Request → CV Generation → GridFS Upload → TTL Index → Auto-Deletion
     ↓              ↓              ↓            ↓           ↓
Authentication → PDF Creation → MongoDB → 30min Timer → Cleanup
```

## Components

### 1. GridFS Helper (`be/helper/gridfsHelper.js`)

**New Functions:**
- `uploadCVToGridFS()`: Uploads CV PDFs to dedicated `cv_files` bucket
- `streamCVFromGridFS()`: Streams CV PDFs for download
- `deleteCVFromGridFS()`: Deletes CV PDFs from GridFS
- `getCVMetadata()`: Retrieves CV metadata including expiration
- `setupTTLIndex()`: Creates MongoDB TTL index for auto-deletion

**TTL Implementation:**
```javascript
// 30-minute expiration
const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

// Metadata with TTL
metadata: {
  userId: userId,
  expiresAt: expiresAt,
  createdAt: new Date()
}
```

### 2. CV Routes (`be/route/cv/cvRoutes.js`)

**Enhanced Features:**
- **Authentication Required**: Only logged-in users can generate/download CVs
- **Subscription Validation**: Checks user subscription limits
- **Metadata Validation**: Verifies file existence and expiration
- **Secure Downloads**: Validates expiration before serving files

**Key Endpoints:**
- `POST /cv/submit`: Generate and upload CV PDF
- `GET /cv/download/:pdfId`: Download CV PDF (with authorization)

### 3. TTL Index Setup (`be/index.js`)

**Automatic Setup:**
```javascript
// Creates TTL index on cv_files.files.metadata.expiresAt
await setupTTLIndex();
```

**MongoDB Index:**
```javascript
{
  "metadata.expiresAt": 1
},
{
  "expireAfterSeconds": 0  // Uses expiresAt field directly
}
```

## Security Features

### 1. Authentication
- All CV operations require user authentication
- User ID is stored in file metadata for tracking

### 2. Authorization
- Download endpoint validates user authentication
- Files are tied to specific users (extensible for user-specific access)

### 3. TTL Security
- Files automatically expire after 30 minutes
- Prevents long-term storage of sensitive data
- Reduces storage costs and security risks

## Subscription Integration

### Free Tier
- **CV Generations**: 3 per month
- **Download Window**: 30 minutes

### Premium Tier
- **CV Generations**: 50 per month
- **Download Window**: 30 minutes
- **Additional Features**: Enhanced analytics, priority support

## API Usage

### Generate CV PDF

```javascript
POST /cv/submit
Authorization: Bearer <token>
Content-Type: application/json

{
  "cvData": {
    "personalInfo": { ... },
    "summary": "...",
    "experience": [ ... ],
    "education": [ ... ],
    // ... other CV sections
  }
}
```

**Response:**
```javascript
{
  "success": true,
  "message": "CV data received and PDF generated successfully",
  "pdfId": "uuid-here",
  "downloadUrl": "http://localhost:4001/cv/download/gridfs-id"
}
```

### Download CV PDF

```javascript
GET /cv/download/:pdfId
Authorization: Bearer <token>
```

**Response:**
- **Success**: PDF file stream with headers
- **Expired**: 404 with expiration message
- **Not Found**: 404 with not found message

**Headers:**
```
Content-Type: application/pdf
Content-Disposition: attachment; filename="CV_uuid.pdf"
Cache-Control: no-cache
X-Expires-At: 2024-01-01T12:30:00.000Z
```

## TTL Mechanism

### How It Works
1. **Upload**: File stored with `metadata.expiresAt` timestamp
2. **Index**: MongoDB TTL index monitors expiration
3. **Cleanup**: MongoDB automatically deletes expired files
4. **Validation**: Download endpoint checks expiration before serving

### Benefits
- **Automatic**: No manual cleanup required
- **Persistent**: Works across server restarts
- **Efficient**: MongoDB handles deletion in background
- **Reliable**: Built-in MongoDB feature

## Testing

### Manual Testing
```bash
# Run the integration test
node be/test-cv-integration.js
```

### Test Coverage
- ✅ GridFS upload/download
- ✅ TTL metadata handling
- ✅ File expiration logic
- ✅ Authorization validation
- ✅ Cleanup operations

## Monitoring

### Logs to Monitor
- CV generation requests
- GridFS upload/download operations
- TTL index creation
- File expiration events
- Authentication failures

### Key Metrics
- CV generation rate
- Storage usage in `cv_files` bucket
- Download success rate
- Average file lifetime

## Troubleshooting

### Common Issues

1. **TTL Index Not Created**
   - Check MongoDB connection
   - Verify index creation logs
   - Manually create index if needed

2. **Files Not Auto-Deleting**
   - Verify TTL index exists
   - Check `metadata.expiresAt` format
   - Ensure MongoDB TTL is enabled

3. **Download Failures**
   - Check file existence in GridFS
   - Verify expiration timestamps
   - Confirm user authentication

### Debug Commands

```javascript
// Check TTL index
db.cv_files.files.getIndexes()

// Find expired files
db.cv_files.files.find({
  "metadata.expiresAt": { $lt: new Date() }
})

// Check file metadata
db.cv_files.files.findOne({ _id: ObjectId("...") })
```

## Future Enhancements

### Planned Features
- User-specific CV access control
- CV generation analytics
- Bulk CV operations
- Custom expiration times per subscription
- CV template system

### Scalability Considerations
- GridFS chunk size optimization
- CDN integration for downloads
- Load balancing for high volume
- Database sharding for large scale

## Security Considerations

### Data Protection
- PDFs contain sensitive personal information
- 30-minute TTL minimizes exposure window
- No long-term storage of CV data
- User authentication required for all operations

### Compliance
- GDPR compliance through automatic deletion
- Data minimization principles
- User consent for CV generation
- Audit trail for security monitoring

---

## Quick Start

1. **Start the server**: The TTL index will be created automatically
2. **Generate CV**: POST to `/cv/submit` with CV data
3. **Download CV**: GET from `/cv/download/:pdfId` within 30 minutes
4. **Monitor**: Check logs for TTL operations and file lifecycle

The integration is now ready for production use with automatic TTL-based cleanup!

