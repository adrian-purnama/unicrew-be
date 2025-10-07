const mongoose = require('mongoose');

const cvMakeResultSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    
    cvData: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    },
    
    gridfsId: {
      type: mongoose.Schema.Types.ObjectId,
      required: false,
      default: null
    },
    
    filename: {
      type: String,
      required: false,
      default: null
    },
    
    downloadUrl: {
      type: String,
      required: false,
      default: null
    },
    
    status: {
      type: String,
      enum: ['generating', 'completed', 'failed', 'expired'],
      default: 'generating',
      index: true
    },
    
    errorMessage: {
      type: String,
      default: null
    },
    
    // TTL field - documents will be automatically deleted after 30 minutes
    expiresAt: {
      type: Date,
      default: function() {
        return new Date(Date.now() + 30 * 60 * 1000); // 30 minutes from now
      },
      index: { expireAfterSeconds: 0 } // MongoDB TTL index
    },
    
    // Metadata
    fileSize: {
      type: Number,
      default: 0
    },
    
    contentType: {
      type: String,
      default: 'application/pdf'
    },
    
    downloadCount: {
      type: Number,
      default: 0
    },
    
    lastDownloadedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true // Adds createdAt and updatedAt
  }
);

// Indexes for better performance
cvMakeResultSchema.index({ userId: 1, createdAt: -1 });
cvMakeResultSchema.index({ status: 1, expiresAt: 1 });
cvMakeResultSchema.index({ gridfsId: 1 });

// Virtual for checking if CV is expired
cvMakeResultSchema.virtual('isExpired').get(function() {
  return this.expiresAt && new Date() > this.expiresAt;
});

// Virtual for time remaining in minutes
cvMakeResultSchema.virtual('minutesRemaining').get(function() {
  if (!this.expiresAt) return 0;
  const now = new Date();
  const diff = this.expiresAt - now;
  return Math.max(0, Math.floor(diff / (1000 * 60)));
});

// Method to check if CV can be downloaded
cvMakeResultSchema.methods.canDownload = function() {
  return this.status === 'completed' && !this.isExpired;
};

// Method to increment download count
cvMakeResultSchema.methods.incrementDownload = function() {
  this.downloadCount += 1;
  this.lastDownloadedAt = new Date();
  return this.save();
};

// Pre-save middleware to update status based on expiration
cvMakeResultSchema.pre('save', function(next) {
  if (this.isExpired && this.status !== 'expired') {
    this.status = 'expired';
  }
  next();
});

module.exports = mongoose.model('CVMakeResult', cvMakeResultSchema);
