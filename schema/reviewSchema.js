// models/Review.js
const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema({
    reviewer: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: "reviewerType",
        required: true,
    },
    reviewerType: {
        type: String,
        enum: ["User", "Company"],
        required: true,
    },
    reviewee: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: "revieweeType",
        required: true,
    },
    revieweeType: {
        type: String,
        enum: ["User", "Company"],
        required: true,
    },
    application: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Application",
        required: true,
    },
    rating: {
        type: Number,
        min: 1,
        max: 5,
        required: true,
    },
    comment: String,
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model("Review", reviewSchema);
