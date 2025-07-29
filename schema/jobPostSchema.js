const mongoose = require("mongoose");

const jobPostSchema = new mongoose.Schema(
    {
        company: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Company",
            required: true,
        },

        title: {
            type: String,
            required: true,
            trim: true,
        },

        description: {
            type: String,
            required: true,
        },

        workType: {
            type: String,
            enum: ["remote", "onsite", "hybrid"],
            required: true,
        },

        location: {
            provinsi: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Provinsi",
            },
            kabupaten: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Kabupaten",
            },
            kecamatan: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Kecamatan",
            },
        },

        requiredSkills: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Skill",
            },
        ],

        salaryRange: {
            min: Number,
            max: Number,
            currency: {
                type: String,
                default: "IDR",
            },
        },

        isActive: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("JobPost", jobPostSchema);
