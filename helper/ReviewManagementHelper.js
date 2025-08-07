// helper/reviewHelper.js

const Review = require("../schema/reviewSchema");
const Application = require("../schema/applicationSchema");
const JobPost = require("../schema/jobPostSchema");
const Notification = require("../schema/notificationSchema");

/**
 * Get pending reviews for a user or company
 */
async function getPendingReviews(userId, userRole) {
    let applications;

    if (userRole === "user") {
        // User needs to review companies they worked for
        applications = await Application.find({
            user: userId,
            status: { $in: ["ended", "accepted"] },
            userReviewed: { $ne: true },
        })
            .populate({
                path: "job",
                select: "title",
                populate: {
                    path: "company",
                    select: "companyName email profilePicture",
                },
            })
            .lean();
    } else {
        // Company needs to review users who worked for them
        const companyJobs = await JobPost.find({ company: userId }).select("_id");
        const jobIds = companyJobs.map((job) => job._id);

        applications = await Application.find({
            job: { $in: jobIds },
            status: { $in: ["ended", "accepted"] },
            companyReviewed: { $ne: true },
        })
            .populate("user", "fullName email profilePicture")
            .populate("job", "title")
            .lean();
    }

    // Format the response
    return applications.map((app) => ({
        _id: app._id,
        job: app.job,
        counterpartyType: userRole === "user" ? "Company" : "User",
        company: userRole === "user" ? app.job?.company : undefined,
        user: userRole === "company" ? app.user : undefined,
        completedDate: app.endedAt || app.updatedAt,
    }));
}

/**
 * Submit a review
 */
async function submitReview(reviewerId, reviewerRole, applicationId, rating, comment) {
    // Find the application
    const application = await Application.findById(applicationId)
        .populate("user")
        .populate({
            path: "job",
            populate: {
                path: "company",
            },
        });

    if (!application) {
        throw new Error("Application not found");
    }

    // Check if already reviewed
    const alreadyReviewed = await Review.findOne({
        reviewer: reviewerId,
        application: applicationId,
        reviewerType: reviewerRole === "user" ? "User" : "Company",
    });

    if (alreadyReviewed) {
        throw new Error("You already reviewed this application.");
    }

    // Determine who is being reviewed
    let revieweeId, revieweeType;

    if (reviewerRole === "user") {
        // User is reviewing the company
        revieweeId = application.job.company._id;
        revieweeType = "Company";
    } else {
        // Company is reviewing the user
        revieweeId = application.user._id;
        revieweeType = "User";
    }

    // Create the review
    const review = await Review.create({
        reviewer: reviewerId,
        reviewerType: reviewerRole === "user" ? "User" : "Company",
        reviewee: revieweeId,
        revieweeType: revieweeType,
        application: applicationId,
        rating,
        comment,
        job: application.job._id,
    });

    // Update the application
    if (reviewerRole === "user") {
        application.userReviewed = true;
    } else {
        application.companyReviewed = true;
    }
    await application.save();

    // Send notification
    await Notification.create({
        recipientType: revieweeType.toLowerCase(),
        recipient: revieweeId,
        type: "review",
        event: "review_received",
        message: `You received a new ${rating}-star review`,
        metadata: {
            reviewerId,
            applicationId,
            rating,
            jobId: application.job._id,
        },
    });

    return {
        message: "Review submitted successfully",
        reviewedEntity: revieweeType,
        review,
    };
}

/**
 * Get reviews for a user or company
 */
async function getReviews(entityId, entityType, options = {}) {
    const { page = 1, limit = 10, minRating, maxRating } = options;
    const offset = (page - 1) * limit;

    const query = {
        reviewee: entityId,
        revieweeType: entityType,
    };

    if (minRating || maxRating) {
        query.rating = {};
        if (minRating) query.rating.$gte = minRating;
        if (maxRating) query.rating.$lte = maxRating;
    }

    const reviews = await Review.find(query)
        .populate("reviewer", "fullName companyName profilePicture")
        .populate("job", "title")
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .lean();

    const total = await Review.countDocuments(query);

    // Calculate average rating
    const avgResult = await Review.aggregate([
        { $match: query },
        {
            $group: {
                _id: null,
                avgRating: { $avg: "$rating" },
                totalReviews: { $sum: 1 },
            },
        },
    ]);

    const stats = avgResult[0] || { avgRating: 0, totalReviews: 0 };

    return {
        reviews,
        total,
        page,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
        averageRating: Math.round(stats.avgRating * 10) / 10,
        totalReviews: stats.totalReviews,
    };
}

/**
 * Get review statistics for an entity
 */
async function getReviewStats(entityId, entityType) {
    const stats = await Review.aggregate([
        {
            $match: {
                reviewee: entityId,
                revieweeType: entityType,
            },
        },
        {
            $group: {
                _id: "$rating",
                count: { $sum: 1 },
            },
        },
        {
            $sort: { _id: -1 },
        },
    ]);

    const distribution = {
        5: 0,
        4: 0,
        3: 0,
        2: 0,
        1: 0,
    };

    let totalReviews = 0;
    let totalScore = 0;

    stats.forEach((stat) => {
        distribution[stat._id] = stat.count;
        totalReviews += stat.count;
        totalScore += stat._id * stat.count;
    });

    return {
        averageRating: totalReviews > 0 ? Math.round((totalScore / totalReviews) * 10) / 10 : 0,
        totalReviews,
        distribution,
        percentageDistribution: Object.keys(distribution).reduce((acc, key) => {
            acc[key] = totalReviews > 0 ? Math.round((distribution[key] / totalReviews) * 100) : 0;
            return acc;
        }, {}),
    };
}

module.exports = {
    getPendingReviews,
    submitReview,
    getReviews,
    getReviewStats,
};