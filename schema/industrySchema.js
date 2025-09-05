const mongoose = require("mongoose");

const industrySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  normName: { type: String, index: true },
}, { timestamps: true });

module.exports = mongoose.model("Industry", industrySchema);
