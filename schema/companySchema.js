const mongoose = require("mongoose");

const companySchema = new mongoose.Schema(
    {
        companyName: { type: String, required: true, unique: true},
        industries: {
            type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Industry", required: true }],
            validate: {
                validator: function (val) {
                    return val.length <= 3;
                },
                message: "Max 3 industries allowed",
            },
        },
        role: { type: String, required: true, default: "company" },
        description: {type: String},

        location: {
            provinsi: { type: mongoose.Schema.Types.ObjectId, ref: "Provinsi" },
            kabupaten: { type: mongoose.Schema.Types.ObjectId, ref: "Kabupaten" },
            kecamatan: { type: mongoose.Schema.Types.ObjectId, ref: "Kecamatan" },
        },

        socialLinks: {
            website: { type: String, default : null },
            instagram: { type: String, default : null },
            twitter: { type: String, default : null },
            linkedin: { type: String, default : null },
        },

        // Account
        email: {type: String, required: true, unique: true},
        password: {
            type: String,
            required: true,
        },
        profilePicture: {
            type: String,
        },
        isVerified: {
            type: Boolean,
            default: false,
        },
        loginMethod: {
            type: String,
            enum: ["email", "google", "linkedin"],
            default: "email",
        },

        subscription: { type: String, enum: ["free", "premium"], default: "free" },
        subscriptionExpiresAt: { type: Date },
        billing: {
            stripeCustomerId: String,
            planId: String,
            lastPaymentDate: Date,
            subscriptionStatus: String,
        },

        loginStats: {
            loginTries: { type: Number, default: 0 },
            loginLimit: { type: Number, default: 10 },
            lastLoginAttempt: { type: Date },
        },
        jobPostingStats: {
            createJobTries: { type: Number, default: 0 },
            createJobLimit: { type: Number, default: 5 },
            lastCreateJobAttempt: { type: Date },
        },

        isActive: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Company", companySchema);
