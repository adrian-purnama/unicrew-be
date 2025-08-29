// schema/tempLinkSchema.js
const mongoose = require("mongoose");

const TempLinkSchema = new mongoose.Schema(
  {
    // Use _id as the link token (sid). It's already high-entropy and URL-safe.
    asset: { type: mongoose.Schema.Types.ObjectId, ref: "Asset", required: true, index: true },

    // Who created the link (for auditing / optional scoping)
    createdBy: { type: mongoose.Schema.Types.ObjectId, refPath: "creatorModel", required: true, index: true },
    creatorModel: { type: String, enum: ["User", "Company"], required: true },

    // Auto-expire after 5 minutes
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

// TTL index makes MongoDB delete rows automatically after expiry
TempLinkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("TempLink", TempLinkSchema);
