// schema/userSchema.js
const { default: mongoose } = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    // Core
    fullName: { type: String, required: true },
    birthDate: { type: Date, required: true },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: { type: String, required: true },
    profilePicture: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Asset",
      default: null,
    },
    aboutMe: { type: String, trim: true, maxlength: 1000 },

    role: { type: String, required: true, default: "user" },

    // Relationships
    university: { type: mongoose.Schema.Types.ObjectId, ref: "University" },
    studyProgram: { type: mongoose.Schema.Types.ObjectId, ref: "StudyProgram" },

    skills: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Skill" }],
      default: [], // ensure array exists so validator runs consistently
      validate: {
        validator: (val) => val.length <= 10,
        message: "You can only have up to 10 skills.",
      },
    },

    // Saved Jobs
    savedJobs: {
      type: [
        {
          job: { type: mongoose.Schema.Types.ObjectId, ref: "JobPost" },
          savedAt: { type: Date, default: Date.now },
        },
      ],
      validate: {
        validator: function (val) {
          const maxSaved = this.subscription === "premium" ? 50 : 5;
          return val.length <= maxSaved;
        },
        message: function () {
          const maxSaved = this.subscription === "premium" ? 50 : 5;
          return `You can only save up to ${maxSaved} jobs with your ${this.subscription} subscription.`;
        },
      },
    },

    // Account
    isVerified: { type: Boolean, default: false },
    loginMethod: {
      type: String,
      enum: ["email", "google", "linkedin"],
      default: "email",
    },
    externalSystemId: { type: String, default: null },
    curriculumVitae: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Asset",
      default: null,
    },
    portfolio: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Asset",
      default: null,
    },
    location: {
      provinsi: { type: mongoose.Schema.Types.ObjectId, ref: "Provinsi" },
      kabupaten: { type: mongoose.Schema.Types.ObjectId, ref: "Kabupaten" },
      kecamatan: { type: mongoose.Schema.Types.ObjectId, ref: "Kecamatan" },
    },

    // Soft-TTL for unverified users
    expiresAt: {
      type: Date,
      default: function () {
        return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
      },
      expires: 0, // MongoDB TTL index
    },

    // Subscription & Billing
    subscription: { type: String, enum: ["free", "premium"], default: "free" },
    subscriptionExpiresAt: { type: Date },
    billing: {
      stripeCustomerId: String,
      planId: String,
      lastPaymentDate: Date,
      subscriptionStatus: String,
    },
    rating: {
      average: { type: Number, default: 0 },
      count: { type: Number, default: 0 },
    },

    // Rate Limits & Attempts
    loginStats: {
      loginTries: { type: Number, required: true, default: 0 },
      loginLimit: { type: Number, required: true, default: 10 }, // fixed typo
      lastLoginAttempt: { type: Date },
    },
    applyStats: {
      applyTries: { type: Number, required: true, default: 0 },
      applyLimit: { type: Number, required: true, default: 5 },
      lastApplyAttempt: { type: Date },
    },

    isActive: { type: Boolean, required: true, default: true },
  },
  { timestamps: true }
);

// Pre-save: clear TTL when verified
userSchema.pre("save", function (next) {
  if (this.isVerified && this.expiresAt) {
    this.expiresAt = undefined;
  }
  next();
});

// TTL index
userSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("User", userSchema);
