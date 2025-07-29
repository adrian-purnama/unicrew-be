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
      enum: ["application", "status_update", "message", "system", "custom"],
      required: true,
    },
    event: {
      type: String,
      enum: [
        "applied",
        "shortlisted",
        "accepted",
        "rejected",
        "message_received",
        "custom_event",
      ],
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    metadata: {
      jobId: { type: mongoose.Schema.Types.ObjectId, ref: "JobPost" },
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company" },
      roomId: { type: mongoose.Schema.Types.ObjectId, ref: "ChatRoom" },
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Notification", notificationSchema);
