const mongoose = require("mongoose");

const AssetSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true, required: true },
    kind:  { type: String, enum: ["avatar", "cv", "portfolio"], required: true },

    provider: { type: String, default: "gridfs" },
    gridfsId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },

    filename: String,
    mime: String,
    size: Number,

    visibility: { type: String, enum: ["public", "private"], default: "private" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Asset", AssetSchema);
