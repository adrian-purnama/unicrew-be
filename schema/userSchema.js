const { default: mongoose } = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        // Core
        fullName: { type: String, required: true },
        birthDate: { type: Date, required: true },
        email: { type: String, required: true, unique: true, trim: true, lowercase: true },
        password: { type: String, required: true },
        profilePicture: {
             type: mongoose.Schema.Types.ObjectId, ref: "Asset",
             default : null
        },
        aboutMe: { type: String, trim: true, maxlength: 1000 },

        role: { type: String, required: true, default: "user" },

        // Relationships
        university: { type: mongoose.Schema.Types.ObjectId, ref: "University" },
        studyProgram: { type: mongoose.Schema.Types.ObjectId, ref: "StudyProgram" },
        skills: {
            type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Skill" }],
            validate: {
                validator: function (val) {
                    return val.length <= 10;
                },
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
                    // Dynamic validation based on subscription
                    const maxSaved = this.subscription === "premium" ? 50 : 5;
                    return val.length <= maxSaved;
                },
                message: function (props) {
                    const maxSaved = props.instance.subscription === "premium" ? 50 : 5;
                    return `You can only save up to ${maxSaved} jobs with your ${props.instance.subscription} subscription.`;
                },
            },
        },

        // Account
        isVerified: { type: Boolean, default: false },
        loginMethod: { type: String, enum: ["email", "google", "linkedin"], default: "email" },
        externalSystemId: { type: String, default: null },
        curriculumVitae: {  type: mongoose.Schema.Types.ObjectId, ref: "Asset" , default: null },
        portfolio: {  type: mongoose.Schema.Types.ObjectId, ref: "Asset" , default: null },
        location: {
            provinsi: { type: mongoose.Schema.Types.ObjectId, ref: "Provinsi" },
            kabupaten: { type: mongoose.Schema.Types.ObjectId, ref: "Kabupaten" },
            kecamatan: { type: mongoose.Schema.Types.ObjectId, ref: "Kecamatan" },
        },

        expiresAt: {
            type: Date,
            default: function () {
                return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
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
            loginLimit: { type: Number, reguired: true, default: 10 },
            lastLoginAttempt: { type: Date },
        },
        applyStats: {
            applyTries: { type: Number, default: 0, required: true },
            applyLimit: { type: Number, default: 5, required: true },
            lastApplyAttempt: { type: Date },
        },

        isActive: { type: Boolean, required: true, default: true },
    },
    { timestamps: true }
);

// Pre-save middleware to remove expiresAt when user is verified
userSchema.pre("save", function (next) {
    if (this.isVerified && this.expiresAt) {
        this.expiresAt = undefined;
    }
    next();
});

// Index for TTL - MongoDB will automatically delete documents when expiresAt is reached
userSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("User", userSchema);
