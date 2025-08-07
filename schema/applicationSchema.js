// models/Application.js
const mongoose = require("mongoose");

const applicationSchema = new mongoose.Schema({
    job: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "JobPost",
        required: true,
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    status: {
        type: String,
        enum: ["applied", "shortlisted", "accepted", "rejected" ,"ended"],
        default: "applied",
    },
    chatRoom: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ChatRoom",
    },
    submittedAt: {
        type: Date,
        default: Date.now,
    },
    endedAt: Date,
    userReviewed: { type: Boolean, default: false },
    companyReviewed: { type: Boolean, default: false },
});

module.exports = mongoose.model("Application", applicationSchema);
