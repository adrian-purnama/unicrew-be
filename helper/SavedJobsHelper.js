// helper/savedJobsHelper.js

const User = require("../schema/userSchema");
const JobPost = require("../schema/jobPostSchema");
const Application = require("../schema/applicationSchema");
const { getMaxSavedJobs } = require("./subscriptionHelper");

/**
 * Save a job for a user
 */
async function saveJob(userId, jobId) {
    const user = await User.findById(userId);
    if (!user) {
        throw new Error("User not found");
    }

    // Check if job exists and is active
    const job = await JobPost.findOne({ _id: jobId, isActive: true });
    if (!job) {
        throw new Error("Job not found or inactive");
    }

    // Check if already saved
    const isAlreadySaved = user.savedJobs.some(
        (savedJob) => savedJob.job.toString() === jobId
    );
    if (isAlreadySaved) {
        throw new Error("Job already saved");
    }

    // Check subscription limits
    const maxSaved = getMaxSavedJobs(user.subscription);
    if (user.savedJobs.length >= maxSaved) {
        const error = new Error(
            `Maximum saved jobs limit reached (${maxSaved} jobs). ${
                user.subscription === "free" ? "Upgrade to premium for more saves." : ""
            }`
        );
        error.statusCode = 403;
        error.data = {
            currentCount: user.savedJobs.length,
            maxAllowed: maxSaved,
            subscription: user.subscription,
        };
        throw error;
    }

    // Add job to saved jobs
    user.savedJobs.push({
        job: jobId,
        savedAt: new Date(),
    });

    await user.save();

    return {
        message: "Job saved successfully",
        savedCount: user.savedJobs.length,
        maxAllowed: maxSaved,
        subscription: user.subscription,
    };
}

/**
 * Remove a saved job
 */
async function unsaveJob(userId, jobId) {
    const user = await User.findById(userId);
    if (!user) {
        throw new Error("User not found");
    }

    const originalLength = user.savedJobs.length;
    user.savedJobs = user.savedJobs.filter(
        (savedJob) => savedJob.job.toString() !== jobId
    );

    if (user.savedJobs.length === originalLength) {
        throw new Error("Saved job not found");
    }

    await user.save();

    const maxAllowed = getMaxSavedJobs(user.subscription);

    return {
        message: "Job removed from saved list",
        savedCount: user.savedJobs.length,
        maxAllowed,
    };
}

/**
 * Get user's saved jobs with pagination
 */
async function getSavedJobs(userId, page = 1, limit = 10) {
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const user = await User.findById(userId)
        .populate({
            path: "savedJobs.job",
            select: "title description workType location salaryRange company isActive createdAt",
            populate: [
                { path: "company", select: "companyName profilePicture" },
                { path: "location.provinsi", select: "name" },
                { path: "location.kabupaten", select: "name" },
                { path: "location.kecamatan", select: "name" },
                { path: "requiredSkills", select: "name" },
            ],
        })
        .lean();

    if (!user) {
        throw new Error("User not found");
    }

    // Filter out inactive jobs and sort by savedAt
    const activeSavedJobs = user.savedJobs
        .filter((savedJob) => savedJob.job && savedJob.job.isActive)
        .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));

    // Apply pagination
    const paginatedJobs = activeSavedJobs.slice(offset, offset + parseInt(limit));

    // Check application status for each saved job
    const jobIds = paginatedJobs.map((saved) => saved.job._id);
    const applications = await Application.find({
        user: userId,
        job: { $in: jobIds },
    })
        .select("job status")
        .lean();

    const applicationMap = {};
    applications.forEach((app) => {
        applicationMap[app.job.toString()] = app.status;
    });

    // Enrich with application status
    const enrichedJobs = paginatedJobs.map((savedJob) => ({
        _id: savedJob.job._id,
        title: savedJob.job.title,
        description: savedJob.job.description,
        workType: savedJob.job.workType,
        location: savedJob.job.location,
        salaryRange: savedJob.job.salaryRange,
        company: savedJob.job.company,
        requiredSkills: savedJob.job.requiredSkills,
        savedAt: savedJob.savedAt,
        createdAt: savedJob.job.createdAt,
        isSaved: true,
        hasApplied: !!applicationMap[savedJob.job._id.toString()],
        applicationStatus: applicationMap[savedJob.job._id.toString()] || null,
    }));

    return {
        savedJobs: enrichedJobs,
        total: activeSavedJobs.length,
        page: parseInt(page),
        totalPages: Math.ceil(activeSavedJobs.length / parseInt(limit)),
        hasNextPage: parseInt(page) < Math.ceil(activeSavedJobs.length / parseInt(limit)),
        hasPrevPage: parseInt(page) > 1,
        savedCount: activeSavedJobs.length,
        maxAllowed: user.subscription === "premium" ? 50 : 5,
        subscription: user.subscription,
        upgradeMessage:
            user.subscription === "free" && activeSavedJobs.length >= 2
                ? "Upgrade to Premium to save up to 50 jobs!"
                : null,
    };
}

/**
 * Check if a job is saved
 */
async function checkJobSaved(userId, jobId) {
    const user = await User.findById(userId).select("savedJobs subscription").lean();
    if (!user) {
        throw new Error("User not found");
    }

    const isSaved = user.savedJobs.some((savedJob) => savedJob.job.toString() === jobId);
    const maxAllowed = user.subscription === "premium" ? 50 : 5;

    return {
        isSaved,
        savedCount: user.savedJobs.length,
        maxAllowed,
        canSaveMore: user.savedJobs.length < maxAllowed,
    };
}

/**
 * Get saved jobs stats
 */
async function getSavedJobsStats(userId) {
    const user = await User.findById(userId).select("savedJobs subscription").lean();
    if (!user) {
        throw new Error("User not found");
    }

    const maxAllowed = getMaxSavedJobs(user.subscription);

    return {
        savedCount: user.savedJobs.length,
        maxAllowed,
        subscription: user.subscription,
        percentUsed: Math.round((user.savedJobs.length / maxAllowed) * 100),
        canSaveMore: user.savedJobs.length < maxAllowed,
        upgradeMessage:
            user.subscription === "free" && user.savedJobs.length >= 2
                ? "You're close to your limit! Upgrade to Premium for 50 saved jobs."
                : null,
    };
}

module.exports = {
    saveJob,
    unsaveJob,
    getSavedJobs,
    checkJobSaved,
    getSavedJobsStats,
};