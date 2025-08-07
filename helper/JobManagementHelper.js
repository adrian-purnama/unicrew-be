// helper/jobHelper.js

const JobPost = require("../schema/jobPostSchema");
const Application = require("../schema/applicationSchema");
const { calculateMatchScore } = require("./jobFeedHelper");
const mongoose = require("mongoose");

/**
 * Create a new job posting
 */
async function createJobPost(companyId, jobData) {
    const {
        title,
        description,
        workType,
        location,
        requiredSkills,
        salaryMin,
        salaryMax,
        salaryCurrency,
    } = jobData;

    return await JobPost.create({
        company: companyId,
        title,
        description,
        workType,
        location,
        requiredSkills,
        salaryRange: {
            min: salaryMin,
            max: salaryMax,
            currency: salaryCurrency || "IDR",
        },
    });
}

/**
 * Get job postings with application counts
 */
async function getJobsWithCounts(companyId) {
    const jobs = await JobPost.find({ company: companyId })
        .sort({ createdAt: -1 })
        .populate([
            { path: "location.provinsi", select: "name" },
            { path: "location.kabupaten", select: "name" },
            { path: "location.kecamatan", select: "name" },
            { path: "requiredSkills", select: "name" },
        ])
        .lean();

    const jobIds = jobs.map((j) => j._id);

    // Get application counts grouped by status
    const aggregates = await Application.aggregate([
        { $match: { job: { $in: jobIds } } },
        {
            $group: {
                _id: { job: "$job", status: "$status" },
                count: { $sum: 1 },
            },
        },
    ]);

    // Build count map
    const countMap = {};
    aggregates.forEach((item) => {
        const { job, status } = item._id;
        if (!countMap[job]) {
            countMap[job] = {
                applied: 0,
                shortListed: 0,
                accepted: 0,
                rejected: 0,
            };
        }
        countMap[job][status] = item.count;
    });

    // Enrich jobs with counts
    return jobs.map((job) => ({
        ...job,
        statusCounts: countMap[job._id] || {
            applied: 0,
            shortListed: 0,
            accepted: 0,
            rejected: 0,
        },
        applicantCount: Object.values(countMap[job._id] || {}).reduce((a, b) => a + b, 0),
    }));
}

/**
 * Toggle job active status
 */
async function toggleJobStatus(jobId, companyId, isActive) {
    return await JobPost.findOneAndUpdate(
        { _id: jobId, company: companyId },
        { isActive },
        { new: true }
    );
}

/**
 * Delete a job posting
 */
async function deleteJob(jobId, companyId) {
    // Check if there are active applications
    const activeApplications = await Application.countDocuments({
        job: jobId,
        status: { $in: ["applied", "shortListed", "accepted"] },
    });

    if (activeApplications > 0) {
        throw new Error("Cannot delete job with active applications");
    }

    return await JobPost.findOneAndDelete({ _id: jobId, company: companyId });
}

/**
 * Populate location fields for jobs
 */
async function populateJobLocations(jobs) {
    for (let job of jobs) {
        for (const locField of ["provinsi", "kabupaten", "kecamatan"]) {
            const locId = job.location?.[locField];
            if (locId) {
                try {
                    const ModelName = locField.charAt(0).toUpperCase() + locField.slice(1);
                    const locDoc = await mongoose
                        .model(ModelName)
                        .findById(locId)
                        .select("name")
                        .lean();
                    if (locDoc) job.location[locField] = locDoc;
                } catch (err) {
                    console.log(`⚠️ Could not populate ${locField}:`, err.message);
                }
            }
        }
    }
    return jobs;
}

/**
 * Enrich jobs with match scores and saved status
 */
function enrichJobsWithUserData(jobs, user, filters = {}) {
    const maxSavedAllowed = user.subscription === "premium" ? 50 : 5;
    const userSavedCount = user.savedJobs?.length || 0;

    return jobs.map((job) => {
        const userLoc = user.location || {};
        const { score, reasons } = calculateMatchScore(job, user, {
            location: {
                provinsi: (filters.location?.provinsi || userLoc.provinsi?._id)?.toString(),
                kabupaten: (filters.location?.kabupaten || userLoc.kabupaten?._id)?.toString(),
                kecamatan: (filters.location?.kecamatan || userLoc.kecamatan?._id)?.toString(),
            },
            workType: filters.workType || [],
            minSalary: filters.minSalary,
            industries: filters.industries || [],
        });

        const isSaved = user.savedJobs?.some(
            (entry) => entry.job.toString() === job._id.toString()
        );

        return {
            ...job,
            matchScore: score,
            whyThisJob: reasons,
            isSaved,
            canSaveMore: isSaved || userSavedCount < maxSavedAllowed,
            userSavedCount,
            maxSavedAllowed,
            userSubscription: user.subscription,
        };
    });
}

module.exports = {
    createJobPost,
    getJobsWithCounts,
    toggleJobStatus,
    deleteJob,
    populateJobLocations,
    enrichJobsWithUserData,
};