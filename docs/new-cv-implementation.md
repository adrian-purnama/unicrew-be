# New CV Implementation with MongoDB Schema and TTL

This document describes the updated CV implementation that uses MongoDB schema for CV results with automatic TTL-based deletion.

## Overview

The new CV implementation provides:
- **MongoDB Schema**: CVMakeResult schema for tracking CV generation
- **MongoDB _id**: Uses native MongoDB ObjectId instead of crypto UUID
- **TTL Integration**: Automatic 30-minute expiration via MongoDB TTL
- **Status Tracking**: Complete lifecycle tracking (generating → completed → expired)
- **User Management**: User-specific CV listing and management
- **GridFS Storage**: Secure PDF storage with automatic cleanup

## Architecture

```
User Request → Authentication → CV Schema Creation → PDF Generation → GridFS Upload
     ↓              ↓                ↓                   ↓              ↓
PreHandler → User Validation → MongoDB Record → PDF Creation → File Storage
     ↓              ↓                ↓                   ↓              ↓
Role Check → Subscription → Status Update → GridFS ID → Download Ready
```

## Components

### 1. CVMakeResult Schema (`be/schema/cvMakeResultSchema.js`)

**Key Features:**
- **TTL Field**: `expiresAt` with automatic 30-minute expiration
- **Status Tracking**: generating, completed, failed, expired
- **User Association**: Linked to user via userId
- **GridFS Integration**: Stores GridFS file ID and metadata
- **Download Tracking**: Counts downloads and last download time

**Schema Structure:**
```javascript
{
  userId: ObjectId,           // Reference to User
  cvData: Mixed,              // Original CV data
  gridfsId: ObjectId,         // GridFS file ID
  filename: String,           // Generated filename
  downloadUrl: String,        // Download endpoint URL
  status: String,             // generating|completed|failed|expired
  errorMessage: String,       // Error details if failed
  expiresAt: Date,            // TTL expiration (30 minutes)
  fileSize: Number,           // PDF file size in bytes
  contentType: String,        // application/pdf
  downloadCount: Number,      // Number of downloads
  lastDownloadedAt: Date,     // Last download timestamp
  createdAt: Date,            // Creation timestamp
  updatedAt: Date             // Last update timestamp
}
```

### 2. Updated CV Routes (`be/route/cv/cvRoutes.js`)

**Enhanced Endpoints:**

#### POST `/cv/submit`
- **PreHandler**: `roleAuth(['admin', 'user'])`
- **Process**: Creates CV result → Generates PDF → Updates status
- **Response**: Returns cvResultId, downloadUrl, expiration info

#### GET `/cv/download/:cvResultId`
- **PreHandler**: `roleAuth(['user', 'admin'])`
- **Process**: Validates CV → Checks expiration → Streams PDF
- **Features**: Download count tracking, expiration validation

#### GET `/cv/status/:cvResultId`
- **PreHandler**: `roleAuth(['user', 'admin'])`
- **Response**: Status, expiration, download info

#### GET `/cv/list`
- **PreHandler**: `roleAuth(['user', 'admin'])`
- **Features**: Pagination, user-specific CVs, excludes cvData

### 3. MongoDB TTL Index

**Automatic Setup:**
```javascript
// TTL index on expiresAt field
{
  "expiresAt": 1
},
{
  "expireAfterSeconds": 0  // Uses expiresAt field directly
}
```

**Benefits:**
- Automatic cleanup after 30 minutes
- No manual maintenance required
- Persistent across server restarts
- Efficient background deletion

## API Usage

### Generate CV

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
    "softSkills": [ ... ],
    "hardSkills": [ ... ],
    "certifications": [ ... ],
    "languages": [ ... ]
  }
}
```

**Response:**
```javascript
{
  "success": true,
  "message": "CV data received and PDF generated successfully",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "userId": "user_id_here",
  "dataSize": 12345,
  "cvResultId": "mongodb_object_id",
  "downloadUrl": "http://localhost:4001/cv/download/cvResultId",
  "expiresAt": "2024-01-01T12:30:00.000Z",
  "minutesRemaining": 30
}
```

### Download CV

```javascript
GET /cv/download/:cvResultId
Authorization: Bearer <token>
```

**Response Headers:**
```
Content-Type: application/pdf
Content-Disposition: attachment; filename="cv-objectid.pdf"
Cache-Control: no-cache
X-Expires-At: 2024-01-01T12:30:00.000Z
X-Minutes-Remaining: 25
```

### Check CV Status

```javascript
GET /cv/status/:cvResultId
Authorization: Bearer <token>
```

**Response:**
```javascript
{
  "success": true,
  "cvResultId": "mongodb_object_id",
  "status": "completed",
  "expiresAt": "2024-01-01T12:30:00.000Z",
  "minutesRemaining": 25,
  "isExpired": false,
  "downloadCount": 1,
  "lastDownloadedAt": "2024-01-01T12:05:00.000Z",
  "errorMessage": null,
  "createdAt": "2024-01-01T12:00:00.000Z",
  "updatedAt": "2024-01-01T12:05:00.000Z"
}
```

### List User's CVs

```javascript
GET /cv/list?page=1&limit=10
Authorization: Bearer <token>
```

**Response:**
```javascript
{
  "success": true,
  "cvs": [
    {
      "cvResultId": "mongodb_object_id",
      "status": "completed",
      "expiresAt": "2024-01-01T12:30:00.000Z",
      "minutesRemaining": 25,
      "isExpired": false,
      "downloadCount": 1,
      "lastDownloadedAt": "2024-01-01T12:05:00.000Z",
      "filename": "cv-objectid.pdf",
      "fileSize": 123456,
      "downloadUrl": "http://localhost:4001/cv/download/objectid",
      "createdAt": "2024-01-01T12:00:00.000Z",
      "updatedAt": "2024-01-01T12:05:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "pages": 1
  }
}
```

## Key Improvements

### 1. MongoDB _id Usage
- **Before**: Used `crypto.randomUUID()` for PDF IDs
- **After**: Uses MongoDB's native `ObjectId` from CVMakeResult schema
- **Benefits**: Better integration, consistent with database, built-in validation

### 2. Schema-Based Tracking
- **Before**: Minimal tracking, setTimeout for cleanup
- **After**: Complete lifecycle tracking with status management
- **Benefits**: Better monitoring, error handling, user management

### 3. TTL Integration
- **Before**: Manual setTimeout cleanup
- **After**: MongoDB native TTL index
- **Benefits**: Persistent, reliable, server-restart safe

### 4. Enhanced Security
- **Before**: Basic authentication
- **After**: Role-based access with user validation
- **Benefits**: Better security, user-specific access control

## Status Lifecycle

```
generating → completed → expired
     ↓           ↓          ↓
   Error → failed → expired
```

1. **generating**: CV result created, PDF being generated
2. **completed**: PDF generated successfully, ready for download
3. **failed**: PDF generation failed, error stored
4. **expired**: CV expired after 30 minutes (automatic)

## Error Handling

### PDF Generation Errors
```javascript
{
  "success": false,
  "message": "Failed to generate PDF",
  "error": "Detailed error message"
}
```

### Expired CV
```javascript
{
  "success": false,
  "message": "CV has expired"
}
```

### Not Found
```javascript
{
  "success": false,
  "message": "CV not found or expired"
}
```

## Monitoring and Logging

### Key Logs
- CV result creation with MongoDB _id
- PDF generation progress
- GridFS upload completion
- Download attempts and counts
- Expiration events
- Error occurrences

### Metrics to Track
- CV generation success rate
- Average generation time
- Download frequency
- Expiration rate
- Error rates by type

## Testing

### Run Tests
```bash
# Test the new implementation
node be/test-new-cv-implementation.js
```

### Test Coverage
- ✅ Schema creation and validation
- ✅ PDF generation and GridFS upload
- ✅ Download functionality
- ✅ Status checking
- ✅ TTL expiration
- ✅ Error handling
- ✅ Cleanup operations

## Migration Notes

### Breaking Changes
1. **Download URL Format**: Changed from `/cv/download/:gridfsId` to `/cv/download/:cvResultId`
2. **Response Format**: Now returns `cvResultId` instead of `pdfId`
3. **Authentication**: Now requires both 'admin' and 'user' roles for submission

### Backward Compatibility
- GridFS integration remains the same
- PDF generation logic unchanged
- Download streaming unchanged

## Performance Considerations

### Database Indexes
- `userId` + `createdAt` for user CV listing
- `status` + `expiresAt` for status queries
- `gridfsId` for download lookups

### Memory Usage
- CV data excluded from listing queries
- Pagination for large result sets
- Automatic cleanup prevents storage bloat

## Security Features

### Authentication & Authorization
- Role-based access control
- User-specific CV access
- Expiration validation

### Data Protection
- 30-minute automatic deletion
- No long-term storage
- Secure GridFS storage

### Audit Trail
- Download count tracking
- Last download timestamps
- Status change logging

---

## Quick Start

1. **Start Server**: TTL index created automatically
2. **Generate CV**: POST to `/cv/submit` with CV data
3. **Check Status**: GET `/cv/status/:cvResultId`
4. **Download CV**: GET `/cv/download/:cvResultId` within 30 minutes
5. **List CVs**: GET `/cv/list` for user's CV history

The new implementation provides enterprise-grade CV management with automatic cleanup and comprehensive tracking!

