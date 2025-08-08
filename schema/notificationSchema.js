const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    recipientType: {
      type: String,
      enum: ["user", "company"],
      required: true,
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "recipientType",
    },
    type: {
      type: String,
      enum: [
        "application", 
        "status_update", 
        "message", 
        "review",        // Added for review notifications
        "system", 
        "custom"
      ],
      required: true,
    },
    event: {
      type: String,
      enum: [
        "applied",
        "shortlisted",
        "accepted",
        "rejected",
        "review_received",    // Added for review notifications
        "review_submitted",   // Added for review confirmations
        "message_received",
        "custom_event",
      ],
      required: true,
    },
    message: {
      type: String,
      required: true,
      maxlength: 500, // Added length limit for performance
    },
    metadata: {
      jobId: { type: mongoose.Schema.Types.ObjectId, ref: "JobPost" },
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company" },
      roomId: { type: mongoose.Schema.Types.ObjectId, ref: "ChatRoom" },
      applicationId: { type: mongoose.Schema.Types.ObjectId, ref: "Application" }, // Added for reviews
      reviewId: { type: mongoose.Schema.Types.ObjectId, ref: "Review" }, // Added for reviews
      rating: { type: Number, min: 1, max: 5 }, // Added for review notifications
      reviewerId: { type: mongoose.Schema.Types.ObjectId }, // Added for review notifications
      newAverageRating: { type: Number }, // Added for rating updates
      totalReviews: { type: Number }, // Added for review counts
      ratingChange: { type: Number }, // Added for rating change tracking
      additionalData: { type: mongoose.Schema.Types.Mixed }, // For any extra data
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
    },
    priority: {
      type: String,
      enum: ["low", "normal", "high", "urgent"],
      default: "normal"
    },
    expiresAt: {
      type: Date,
      // Auto-expire notifications after 90 days
      default: function() {
        return new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      }
    }
  },
  { timestamps: true }
);

// Indexes for performance
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ recipientType: 1, recipient: 1 });
notificationSchema.index({ type: 1, event: 1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

// Virtual for recipient model
notificationSchema.virtual("recipientModel", {
    ref: function() {
        return this.recipientType === "user" ? "User" : "Company";
    },
    localField: "recipient",
    foreignField: "_id",
    justOne: true
});

// Pre-save middleware to set priority based on type
notificationSchema.pre('save', function(next) {
    if (this.isNew) {
        switch (this.type) {
            case 'review':
                this.priority = 'normal';
                break;
            case 'status_update':
                if (['accepted', 'rejected'].includes(this.event)) {
                    this.priority = 'high';
                } else {
                    this.priority = 'normal';
                }
                break;
            case 'application':
                this.priority = 'normal';
                break;
            case 'system':
                this.priority = 'high';
                break;
            default:
                this.priority = 'normal';
        }
    }
    next();
});

module.exports = mongoose.model("Notification", notificationSchema);