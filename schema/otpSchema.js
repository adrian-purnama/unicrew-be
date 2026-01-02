const { default: mongoose, Types } = require("mongoose");

const otpSchema = new mongoose.Schema({
  otp: { type: String, required: true },
  userId: { 
    type: Types.ObjectId, 
    required: false, 
    ref: 'User',
    default: null
  },
  email: { 
    type: String, 
    required: false,
    lowercase: true,
    trim: true,
    index: true
  },
  role: { 
    type: String, 
    required: false,
    enum: ['user', 'company', 'admin']
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 600 // 10 minutes
  }
});

// Validation: require either userId OR (email + role)
otpSchema.pre('save', function(next) {
  const hasUserId = this.userId != null;
  const hasEmailAndRole = this.email != null && this.role != null;
  
  if (!hasUserId && !hasEmailAndRole) {
    return next(new Error('Either userId or (email + role) must be provided'));
  }
  if (hasUserId && hasEmailAndRole) {
    return next(new Error('Cannot provide both userId and email/role'));
  }
  next();
});

// Compound index for email+role lookups
otpSchema.index({ email: 1, role: 1 });

module.exports = mongoose.model('Otp', otpSchema);

