const { default: mongoose } = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        // Core
        fullName: { type: String, required: true },
        birthDate: { type: Date, required: true },
        email: { type: String, required: true, unique: true, trim : true, lowercase : true },
        password: { type: String, required: true },
        profilePicture: { type: String, default : 'https://cdn.vectorstock.com/i/500p/58/15/male-silhouette-profile-picture-vector-35845815.jpg' },
        aboutMe: {type: String, trim: true,maxlength: 1000,},

        role: { type: String, required: true, default: "user" },

        // Relationships
        university: { type: mongoose.Schema.Types.ObjectId, ref: "University"},
        studyProgram: { type: mongoose.Schema.Types.ObjectId, ref: "StudyProgram"},
        skills: {
            type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Skill" }],
            validate: {
                validator: function (val) {
                    return val.length <= 10;
                },
                message: "You can only have up to 10 skills.",
            },
        },

        // Account
        isVerified: { type: Boolean, default: false },
        loginMethod: { type: String, enum: ["email", "google", "linkedin"], default: "email" },
        externalSystemId: { type: String, default: null },
        curriculumVitae: { type: String, default : null },
        portfolio: { type: String, default : null },
        location: {
            provinsi: { type: mongoose.Schema.Types.ObjectId, ref: "Provinsi" },
            kabupaten: { type: mongoose.Schema.Types.ObjectId, ref: "Kabupaten" },
            kecamatan: { type: mongoose.Schema.Types.ObjectId, ref: "Kecamatan" },
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

        // Rate Limits & Attempts
        loginStats: {
            loginTries: { type: Number, required : true, default: 0 },
            loginLimit: { type: Number,reguired : true, default: 10 },
            lastLoginAttempt: { type: Date },
        },
        applyStats: {
            applyTries: { type: Number, default: 0, required : true },
            applyLimit: { type: Number, default: 5, required : true },
            lastApplyAttempt: { type: Date },
        },

        isActive: { type: Boolean,required : true, default: true },
    },
    { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
