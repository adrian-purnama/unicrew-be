// helper/applicationHelper.js

const Application = require("../schema/applicationSchema");
const JobPost = require("../schema/jobPostSchema");
const ChatRoom = require("../schema/chatRoomSchema");
const Notification = require("../schema/notificationSchema");
const { calculateMatchScore } = require("./jobFeedHelper");

/**
 * Apply to a job
 */
async function applyToJob(userId, jobId) {
    // Check if already applied
    const existing = await Application.findOne({ user: userId, job: jobId });
    if (existing) {
        throw new Error("You already applied to this job.");
    }

    // Check if job exists and is active
    const job = await JobPost.findById(jobId);
    if (!job || !job.isActive) {
        throw new Error("Job not found or inactive.");
    }

    // Create application
    const application = await Application.create({
        user: userId,
        job: jobId,
        status: "applied",
    });

    // Create notification for company
    await Notification.create({
        recipientType: "company",
        recipient: job.company,
        type: "application",
        event: "applied",
        message: `New applicant for job: ${job.title}`,
        metadata: {
            jobId: job._id,
            userId,
            companyId: job.company,
        },
    });

    return application;
}

/**
 * Cancel an application
 */
async function cancelApplication(userId, jobId) {
    const application = await Application.findOne({
        user: userId,
        job: jobId,
        status: "applied",
    });

    if (!application) {
        throw new Error("Only 'applied' applications can be canceled.");
    }

    await application.deleteOne();
    return { message: "Application successfully canceled." };
}

/**
 * Get applicants for a job with enriched data
 */
async function getJobApplicants(jobId, companyId) {
    const job = await JobPost.findById(jobId).populate("requiredSkills", "name").lean();
    if (!job) {
        throw new Error("Job not found");
    }

    const applications = await Application.find({ job: jobId })
        .populate({
            path: "user",
            select: "fullName email skills location curriculumVitae portfolio university studyProgram",
            populate: [
                { path: "skills", select: "name" },
                { path: "university", select: "name" },
                { path: "studyProgram", select: "name" },
            ],
        })
        .sort({ submittedAt: -1 })
        .lean();

    // Enrich with chat rooms and match scores
    const enrichedApplications = await Promise.all(
        applications.map(async (app) => {
            const chatRoom = await ChatRoom.findOne({
                user: app.user._id,
                company: companyId,
                job: jobId,
            }).lean();

            const { score, reasons } = calculateMatchScore(job, app.user, {
                location: app.user.location,
                workType: app.user.workTypePreferences || [],
                minSalary: app.user.minExpectedSalary,
                industries: app.user.industries || [],
            });

            return {
                ...app,
                chatRoom: chatRoom ? { _id: chatRoom._id } : null,
                match: {
                    percent: Math.min(100, Math.round(score)),
                    reasons,
                },
            };
        })
    );

    return enrichedApplications;
}

/**
 * Update applicant status (shortlist, accept, reject)
 */
async function updateApplicantStatus(jobId, userIds, status) {
    const allowedStatuses = ["shortListed", "accepted", "rejected"];
    if (!allowedStatuses.includes(status)) {
        throw new Error("Invalid status");
    }

    const job = await JobPost.findById(jobId);
    if (!job) {
        throw new Error("Job not found");
    }

    const filter = {
        job: jobId,
        user: { $in: userIds },
    };

    // Only accept if already shortlisted
    if (status === "accepted") {
        filter.status = "shortListed";
    }

    const result = await Application.updateMany(filter, { $set: { status } });

    // Create chat rooms for shortlisted applicants
    if (status === "shortListed") {
        await createChatRoomsForApplicants(userIds, job.company, job._id);
    }

    // Send notifications
    await sendStatusUpdateNotifications(userIds, status, job);

    return {
        message: `Updated ${result.modifiedCount} applicants.`,
        modifiedCount: result.modifiedCount,
    };
}

/**
 * Create chat rooms for shortlisted applicants
 */
async function createChatRoomsForApplicants(userIds, companyId, jobId) {
    for (const userId of userIds) {
        const existingRoom = await ChatRoom.findOne({
            user: userId,
            company: companyId,
            job: jobId,
        });

        if (!existingRoom) {
            console.log(`🔨 Creating chat room for user ${userId} and company ${companyId}`);
            await ChatRoom.create({
                user: userId,
                company: companyId,
                job: jobId,
            });
        }
    }
}

/**
 * Send status update notifications
 */
async function sendStatusUpdateNotifications(userIds, status, job) {
    const notifications = userIds.map((userId) => ({
        recipientType: "user",
        recipient: userId,
        type: "status_update",
        event: status === "shortListed" ? "shortlisted" : status === "accepted" ? "accepted" : "rejected",
        message: `You have been ${status} for job: ${job.title}`,
        metadata: {
            jobId: job._id,
            userId,
            companyId: job.company,
        },
    }));

    await Notification.insertMany(notifications);
}

/**
 * Get user's applications
 */
async function getUserApplications(userId, statusFilter = ["shortListed", "accepted"]) {
    const applications = await Application.find({
        user: userId,
        status: { $in: statusFilter },
    })
        .populate({
            path: "job",
            populate: {
                path: "company",
                select: "companyName profilePicture",
            },
        })
        .lean();

    // Enrich with chat rooms
    const enriched = await Promise.all(
        applications.map(async (app) => {
            const room = await ChatRoom.findOne({
                user: userId,
                company: app.job?.company?._id,
                job: app.job?._id,
            }).lean();

            return {
                _id: app._id,
                status: app.status,
                job: {
                    _id: app.job?._id,
                    title: app.job?.title,
                    location: app.job?.location,
                    salaryRange: app.job?.salaryRange,
                },
                company: {
                    _id: app.job?.company?._id,
                    name: app.job?.company?.companyName,
                    profilePicture: app.job?.company?.profilePicture,
                },
                chatRoom: room ? { _id: room._id } : null,
            };
        })
    );

    return enriched;
}

/**
 * End an application/job
 */
async function endApplication(applicationId, userId) {
    const application = await Application.findOne({
        _id: applicationId,
        status: "accepted",
    }).populate("job");

    if (!application) {
        throw new Error("Accepted application not found.");
    }

    // Verify authorization
    const isUser = application.user?.toString() === userId;
    const isCompany = application.job?.company?.toString() === userId;

    if (!isUser && !isCompany) {
        throw new Error("You are not authorized to end this job.");
    }

    application.status = "ended";
    application.endedAt = new Date();
    await application.save();

    return { message: "Application marked as ended." };
}

module.exports = {
    applyToJob,
    cancelApplication,
    getJobApplicants,
    updateApplicantStatus,
    createChatRoomsForApplicants,
    sendStatusUpdateNotifications,
    getUserApplications,
    endApplication,
};