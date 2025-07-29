const { default: mongoose, Types } = require("mongoose");

const otpSchema = new mongoose.Schema({
  otp: { type: String, required: true },
  userId: { type: Types.ObjectId, required: true, ref: 'User' },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 600
  }
});

module.exports = mongoose.model('Otp', otpSchema);
