const JobPost = require("../../schema/jobPostSchema");
const roleAuth = require("../../helper/roleAuth");
const { jobPostDto, jobFeedDto, cancelApplyJobDto, applyJobDto } = require("./dto");
const User = require("../../schema/userSchema");
const Application = require("../../schema/applicationSchema");
const { default: mongoose } = require("mongoose");
const { calculateMatchScore } = require("../../helper/jobFeedHelper");
const Notification = require("../../schema/notificationSchema");
const ChatRoom = require("../../schema/chatRoomSchema");
const { getMaxSavedJobs } = require("../../helper/subscriptionHelper");
const Review = require("../../schema/reviewSchema");

async function jobRoutes(fastify, options) {
    // Create new job post
    fastify.post(
        "/job",
        {
            preHandler: roleAuth(["company"]),
            schema: jobPostDto,
        },
        async (req, res) => {
            try {
                const companyId = req.userId;
                const {
                    title,
                    description,
                    workType,
                    location,
                    requiredSkills,
                    salaryMin,
                    salaryMax,
                    salaryCurrency,
                } = req.body;

                const newJob = await JobPost.create({
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

                res.code(201).send({ message: "Job created", job: newJob });
            } catch (err) {
                console.error("Error creating job:", err);
                res.code(500).send({ message: "Failed to create job" });
            }
        }
    );

    // Get all public job posts
    fastify.get("/job", async (req, res) => {
        const jobs = await JobPost.find({ isActive: true })
            .populate("company requiredSkills")
            .sort({ createdAt: -1 });

        res.send(jobs);
    });

    fastify.get("/job/:jobId", { preHandler: roleAuth(["company"]) }, async (req, res) => {
        const job = await JobPost.findOne({ _id: req.params.jobId, company: req.userId }).populate(
            "requiredSkills location.provinsi location.kabupaten location.kecamatan"
        );

        if (!job) return res.code(404).send({ message: "Job not found" });

        res.send(job);
    });

    fastify.get("/job-postings", { preHandler: roleAuth(["company"]) }, async (req, res) => {
        const jobs = await JobPost.find({ company: req.userId })
            .sort({ createdAt: -1 })
            .populate([
                {
                    path: "location.provinsi",
                    select: "name",
                },
                {
                    path: "location.kabupaten",
                    select: "name",
                },
                {
                    path: "location.kecamatan",
                    select: "name",
                },
                {
                    path: "requiredSkills",
                    select: "name",
                },
            ])
            .lean();

        const jobIds = jobs.map((j) => j._id);

        const aggregates = await Application.aggregate([
            { $match: { job: { $in: jobIds } } },
            {
                $group: {
                    _id: { job: "$job", status: "$status" },
                    count: { $sum: 1 },
                },
            },
        ]);

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

        const enriched = jobs.map((job) => ({
            ...job,
            statusCounts: countMap[job._id] || {
                applied: 0,
                shortListed: 0,
                accepted: 0,
                rejected: 0,
            },
        }));

        res.send(enriched);
    });

    // route/company/jobRoutes.js (additions)

    fastify.delete("/job/:id", { preHandler: roleAuth(["company"]) }, async (req, res) => {
        const { id } = req.params;
        await JobPost.findOneAndDelete({ _id: id, company: req.userId });
        res.send({ message: "Job deleted" });
    });

    fastify.patch("/job/:id/disable", { preHandler: roleAuth(["company"]) }, async (req, res) => {
        const { id } = req.params;
        await JobPost.findOneAndUpdate({ _id: id, company: req.userId }, { isActive: false });
        res.send({ message: "Job disabled" });
    });

    fastify.patch("/job/:id/enable", { preHandler: roleAuth(["company"]) }, async (req, res) => {
        const { id } = req.params;
        await JobPost.findOneAndUpdate({ _id: id, company: req.userId }, { isActive: true });
        res.send({ message: "Job enabled" });
    });

    fastify.get(
        "/job-postings/enabled",
        { preHandler: roleAuth(["company"]) },
        async (req, res) => {
            const jobs = await JobPost.find({ company: req.userId, isActive: true }).populate(
                "requiredSkills location.provinsi location.kabupaten location.kecamatan"
            );
            res.send(jobs);
        }
    );

    fastify.get(
        "/job-postings/disabled",
        { preHandler: roleAuth(["company"]) },
        async (req, res) => {
            const jobs = await JobPost.find({ company: req.userId, isActive: false }).populate(
                "requiredSkills location.provinsi location.kabupaten location.kecamatan"
            );
            res.send(jobs);
        }
    );

    // Fixed job-feed route with debugging and simplified aggregation
    fastify.get(
        "/job-feed",
        {
            preHandler: roleAuth(["user"]),
            schema: jobFeedDto,
        },
        async (req, res) => {
            const userId = req.userId;
            const rawQuery = req.query;

            const location = {
                provinsi: rawQuery["location[provinsi]"],
                kabupaten: rawQuery["location[kabupaten]"],
                kecamatan: rawQuery["location[kecamatan]"],
            };
            const locationCleaned = Object.values(location).some(Boolean) ? location : undefined;

            const normalizeArray = (val) => (Array.isArray(val) ? val : val ? [val] : []);
            const skillFilter = normalizeArray(rawQuery.skills);
            const workTypeFilterArray = normalizeArray(rawQuery.workType);
            const industryFilterArray = normalizeArray(rawQuery.industries);
            const minSalary = rawQuery.minSalary ? parseInt(rawQuery.minSalary) : undefined;
            const keyword = rawQuery.keyword?.toLowerCase()?.trim();

            const page = parseInt(rawQuery.page) || 1;
            const limit = parseInt(rawQuery.limit) || 10;
            const offset = (page - 1) * limit;

            const hasExplicitFilters =
                skillFilter.length > 0 ||
                workTypeFilterArray.length > 0 ||
                industryFilterArray.length > 0 ||
                locationCleaned ||
                typeof minSalary === "number" ||
                !!keyword;

            try {
                const user = await User.findById(userId)
                    .populate([
                        "skills",
                        "location.provinsi",
                        "location.kabupaten",
                        "location.kecamatan",
                    ])
                    .lean();

                if (!user) return res.code(404).send({ message: "User not found" });

                const interactedJobIds = await Application.find({ user: userId }).distinct("job");

                let finalMatch = { isActive: true };
                if (keyword) {
                    finalMatch.$or = [
                        { title: { $regex: keyword, $options: "i" } },
                        { "company.companyName": { $regex: keyword, $options: "i" } },
                    ];
                }

                let searchStrategy = "all_active";
                if (interactedJobIds.length > 0) {
                    finalMatch._id = {
                        $nin: interactedJobIds.map((id) => new mongoose.Types.ObjectId(id)),
                    };
                    searchStrategy = "exclude_applied";
                }

                const basicCount = await JobPost.countDocuments(finalMatch);
                if (basicCount === 0) {
                    const totalJobsInDB = await JobPost.countDocuments({});
                    const activeJobsInDB = await JobPost.countDocuments({ isActive: true });

                    if (activeJobsInDB === 0) {
                        return res.send({
                            jobs: [],
                            total: 0,
                            page,
                            totalPages: 0,
                            hasNextPage: false,
                            hasPrevPage: false,
                            searchStrategy: "no_active_jobs",
                            isFiltered: hasExplicitFilters,
                            message: "No active jobs available",
                        });
                    }
                }

                // User-based filtering only if no filters or search provided
                if (basicCount > 0 && !hasExplicitFilters) {
                    const userBasedQuery = { ...finalMatch };
                    const orConditions = [];

                    if (user.skills?.length > 0) {
                        const userSkillIds = user.skills.map(
                            (s) => new mongoose.Types.ObjectId(s._id)
                        );
                        orConditions.push({ requiredSkills: { $in: userSkillIds } });
                    }

                    orConditions.push({ workType: "remote" });

                    if (user.location?.provinsi) {
                        orConditions.push({
                            "location.provinsi": new mongoose.Types.ObjectId(
                                user.location.provinsi._id
                            ),
                        });
                    }

                    orConditions.push({
                        $or: [
                            { requiredSkills: { $exists: false } },
                            { requiredSkills: { $size: 0 } },
                        ],
                    });

                    if (orConditions.length > 0) {
                        userBasedQuery.$or = orConditions;
                        const userBasedCount = await JobPost.countDocuments(userBasedQuery);
                        if (userBasedCount > 0) {
                            finalMatch = userBasedQuery;
                            searchStrategy = "user_based";
                        }
                    }
                }

                const totalCount = await JobPost.countDocuments(finalMatch);
                if (totalCount === 0) {
                    return res.send({
                        jobs: [],
                        total: 0,
                        page,
                        totalPages: 0,
                        hasNextPage: false,
                        hasPrevPage: false,
                        searchStrategy,
                        isFiltered: hasExplicitFilters,
                        message: "No jobs match the current criteria",
                    });
                }

                const jobs = await JobPost.aggregate([
                    { $match: finalMatch },
                    { $skip: offset },
                    { $limit: limit },
                    {
                        $lookup: {
                            from: "users",
                            localField: "company",
                            foreignField: "_id",
                            as: "company",
                        },
                    },
                    { $unwind: { path: "$company", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup: {
                            from: "skills",
                            localField: "requiredSkills",
                            foreignField: "_id",
                            as: "requiredSkills",
                        },
                    },
                ]);

                for (let job of jobs) {
                    for (const locField of ["provinsi", "kabupaten", "kecamatan"]) {
                        const locId = job.location?.[locField];
                        if (locId) {
                            try {
                                const locDoc = await mongoose
                                    .model(locField.charAt(0).toUpperCase() + locField.slice(1))
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

                const maxSavedAllowed = user.subscription === "premium" ? 50 : 5;
                const userSavedCount = user.savedJobs?.length || 0;

                const enrichedJobs = jobs.map((job) => {
                    const userLoc = user.location || {};
                    const { score, reasons } = calculateMatchScore(job, user, {
                        location: {
                            provinsi: (
                                locationCleaned?.provinsi || userLoc.provinsi?._id
                            )?.toString(),
                            kabupaten: (
                                locationCleaned?.kabupaten || userLoc.kabupaten?._id
                            )?.toString(),
                            kecamatan: (
                                locationCleaned?.kecamatan || userLoc.kecamatan?._id
                            )?.toString(),
                        },
                        workType: workTypeFilterArray,
                        minSalary,
                        industries: industryFilterArray,
                    });

                    const isSaved = user.savedJobs?.some(
                        (entry) => entry.job.toString() === job._id.toString()
                    );

                    return {
                        ...job,
                        matchScore: score,
                        whyThisJob: reasons,
                        searchStrategy,
                        isSaved,
                        canSaveMore: isSaved || userSavedCount < maxSavedAllowed,
                        userSavedCount,
                        maxSavedAllowed,
                    };
                });

                const sortedJobs = enrichedJobs.sort((a, b) => b.matchScore - a.matchScore);

                res.send({
                    jobs: sortedJobs,
                    total: totalCount,
                    page,
                    totalPages: Math.ceil(totalCount / limit),
                    hasNextPage: page < Math.ceil(totalCount / limit),
                    hasPrevPage: page > 1,
                    searchStrategy,
                    isFiltered: hasExplicitFilters,
                    debug: {
                        appliedJobsCount: interactedJobIds.length,
                        queryUsed: searchStrategy,
                        aggregationWorked: true,
                    },
                });
            } catch (err) {
                console.error("❌ Error in /job-feed:", err);
                res.code(500).send({
                    message: "Failed to fetch job feed",
                    error: err.message,
                    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
                });
            }
        }
    );

    fastify.post(
        "/apply",
        {
            preHandler: roleAuth(["user"]),
            schema: applyJobDto,
        },
        async (req, res) => {
            const userId = req.userId;
            const { jobId } = req.body;

            const existing = await Application.findOne({ user: userId, job: jobId });
            if (existing) {
                return res.code(400).send({ message: "You already applied to this job." });
            }

            const job = await JobPost.findById(jobId);
            if (!job || !job.isActive) {
                return res.code(404).send({ message: "Job not found or inactive." });
            }

            const application = await Application.create({
                user: userId,
                job: jobId,
                status: "applied",
            });

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

            res.code(201).send({ message: "Applied successfully", application });
        }
    );

    // Cancel Application
    // Cancel Application (only if still applied)
    fastify.post(
        "/cancel-apply",
        {
            preHandler: roleAuth(["user"]),
            schema: cancelApplyJobDto,
        },
        async (req, res) => {
            const userId = req.userId;
            const { jobId } = req.body;

            try {
                const application = await Application.findOne({
                    user: userId,
                    job: jobId,
                    status: "applied",
                });

                if (!application) {
                    return res
                        .code(404)
                        .send({ message: "Only 'applied' applications can be canceled." });
                }

                await application.deleteOne();

                res.send({ message: "Application successfully canceled." });
            } catch (err) {
                console.error("Error cancelling application:", err);
                res.code(500).send({ message: "Server error while cancelling application." });
            }
        }
    );

    fastify.get(
        "/job/:jobId/applicants",
        { preHandler: roleAuth(["company"]) },
        async (req, res) => {
            const { jobId } = req.params;

            try {
                const job = await JobPost.findById(jobId).populate("requiredSkills", "name").lean();
                if (!job) return res.code(404).send({ message: "Job not found" });

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

                const withChatAndMatch = await Promise.all(
                    applications.map(async (app) => {
                        const chatRoom = await ChatRoom.findOne({
                            user: app.user._id,
                            company: req.userId,
                            job: jobId,
                        }).lean();

                        const { score, reasons } = calculateMatchScore(job, app.user, {
                            location: app.user.location,
                            workType: app.user.workTypePreferences || [], // optional
                            minSalary: app.user.minExpectedSalary, // optional
                            industries: app.user.industries || [], // optional
                        });

                        return {
                            ...app,
                            chatRoom: chatRoom ? { _id: chatRoom._id } : null,
                            user: app.user,
                            match: {
                                percent: Math.min(100, Math.round(score)),
                                reasons,
                            },
                        };
                    })
                );

                res.send(withChatAndMatch);
            } catch (err) {
                console.error("❌ Failed to fetch applicants:", err);
                res.code(500).send({ message: "Failed to fetch applicants" });
            }
        }
    );

    fastify.patch(
        "/job/:jobId/applicants/status",
        { preHandler: roleAuth(["company"]) },
        async (req, res) => {
            const { jobId } = req.params;
            const { user = [], status } = req.body;

            const allowedStatuses = ["shortListed", "accepted", "rejected"];
            if (!allowedStatuses.includes(status)) {
                return res.code(400).send({ message: "Invalid status" });
            }

            const job = await JobPost.findById(jobId);
            if (!job) return res.code(404).send({ message: "Job not found" });

            const filter = {
                job: jobId,
                user: { $in: user },
            };

            if (status === "accepted") {
                filter.status = "shortListed"; // only accept if already shortlisted
            }

            // PATCH /job/:jobId/applicants/status
            const result = await Application.updateMany(filter, { $set: { status } });

            if (status === "shortListed") {
                for (const userId of user) {
                    const existingRoom = await ChatRoom.findOne({
                        user: userId,
                        company: job.company,
                        job: job._id,
                    });

                    if (!existingRoom) {
                        console.log(
                            `🔨 Creating chat room for user ${userId} and company ${job.company}`
                        );
                        await ChatRoom.create({
                            user: userId,
                            company: job.company,
                            job: job._id,
                        });
                    } else {
                        console.log(
                            `✅ Chat room already exists for user ${userId}: ${existingRoom._id}`
                        );
                    }
                }
            }

            // ✅ Add notifications
            const notifications = user.map((userId) => ({
                recipientType: "user",
                recipient: userId,
                type: "status_update",
                event:
                    status === "shortListed"
                        ? "shortlisted"
                        : status === "accepted"
                        ? "accepted"
                        : "rejected",
                message: `You have been ${status} for job: ${job.title}`,
                metadata: {
                    jobId: job._id,
                    userId,
                    companyId: job.company,
                },
            }));

            await Notification.insertMany(notifications);

            res.send({ message: `Updated ${result.modifiedCount} applicants.` });
        }
    );

    fastify.get("/my-applications", { preHandler: roleAuth(["user"]) }, async (req, res) => {
        const userId = req.userId;
        const { status } = req.query;

        const statusArray = status ? status.split(",") : ["shortListed", "accepted"];

        const applications = await Application.find({
            user: userId,
            status: { $in: statusArray },
        })
            .populate({
                path: "job",
                populate: [
                    {
                        path: "company",
                        select: "companyName profilePicture",
                    },
                ],
            })
            .lean();

        const mapped = await Promise.all(
            applications.map(async (a) => {
                const room = await ChatRoom.findOne({
                    user: userId,
                    company: a.job?.company?._id,
                    job: a.job?._id,
                }).lean();

                return {
                    _id: a._id,
                    status: a.status,
                    job: {
                        _id: a.job?._id,
                        title: a.job?.title,
                    },
                    company: {
                        _id: a.job?.company?._id,
                        name: a.job?.company?.companyName,
                        profilePicture: a.job?.company?.profilePicture,
                    },
                    chatRoom: room ? { _id: room._id } : null,
                };
            })
        );

        return res.send(mapped);
    });

    fastify.post(
        "/save-job",
        {
            preHandler: roleAuth(["user"]),
            schema: {
                body: {
                    type: "object",
                    required: ["jobId"],
                    properties: {
                        jobId: { type: "string" },
                    },
                },
            },
        },
        async (req, res) => {
            const userId = req.userId;
            const { jobId } = req.body;

            try {
                const user = await User.findById(userId);
                if (!user) {
                    return res.code(404).send({ message: "User not found" });
                }

                // Check if job exists and is active
                const job = await JobPost.findOne({ _id: jobId, isActive: true });
                if (!job) {
                    return res.code(404).send({ message: "Job not found or inactive" });
                }

                // Check if job is already saved
                const isAlreadySaved = user.savedJobs.some(
                    (savedJob) => savedJob.job.toString() === jobId
                );
                if (isAlreadySaved) {
                    return res.code(400).send({ message: "Job already saved" });
                }

                // Check subscription limits
                const maxSaved = getMaxSavedJobs(user.subscription);
                if (user.savedJobs.length >= maxSaved) {
                    return res.code(403).send({
                        message: `Maximum saved jobs limit reached (${maxSaved} jobs). ${
                            user.subscription === "free" ? "Upgrade to premium for more saves." : ""
                        }`,
                        currentCount: user.savedJobs.length,
                        maxAllowed: maxSaved,
                        subscription: user.subscription,
                    });
                }

                // Add job to saved jobs
                user.savedJobs.push({
                    job: jobId,
                    savedAt: new Date(),
                });

                await user.save();

                res.code(201).send({
                    message: "Job saved successfully",
                    savedCount: user.savedJobs.length,
                    maxAllowed: maxSaved,
                    subscription: user.subscription,
                });
            } catch (err) {
                console.error("Error saving job:", err);
                res.code(500).send({ message: "Failed to save job" });
            }
        }
    );

    // Remove saved job
    fastify.delete(
        "/save-job/:jobId",
        {
            preHandler: roleAuth(["user"]),
        },
        async (req, res) => {
            const userId = req.userId;
            const { jobId } = req.params;

            try {
                const user = await User.findById(userId);
                if (!user) {
                    return res.code(404).send({ message: "User not found" });
                }

                const originalLength = user.savedJobs.length;
                user.savedJobs = user.savedJobs.filter(
                    (savedJob) => savedJob.job.toString() !== jobId
                );

                if (user.savedJobs.length === originalLength) {
                    return res.code(404).send({ message: "Saved job not found" });
                }

                await user.save();

                const maxAllowed = getMaxSavedJobs(user.subscription);

                res.send({
                    message: "Job removed from saved list",
                    savedCount: user.savedJobs.length,
                    maxAllowed,
                });
            } catch (err) {
                console.error("Error removing saved job:", err);
                res.code(500).send({ message: "Failed to remove saved job" });
            }
        }
    );

    // Get all saved jobs
    fastify.get(
        "/saved-jobs",
        {
            preHandler: roleAuth(["user"]),
        },
        async (req, res) => {
            const userId = req.userId;
            const { page = 1, limit = 10 } = req.query;
            const offset = (parseInt(page) - 1) * parseInt(limit);

            try {
                const user = await User.findById(userId)
                    .populate({
                        path: "savedJobs.job",
                        select: "title description workType location salaryRange company isActive createdAt",
                        populate: [
                            {
                                path: "company",
                                select: "companyName profilePicture",
                            },
                            {
                                path: "location.provinsi",
                                select: "name",
                            },
                            {
                                path: "location.kabupaten",
                                select: "name",
                            },
                            {
                                path: "location.kecamatan",
                                select: "name",
                            },
                            {
                                path: "requiredSkills",
                                select: "name",
                            },
                        ],
                    })
                    .lean();

                if (!user) {
                    return res.code(404).send({ message: "User not found" });
                }

                // Filter out inactive jobs and sort by savedAt (newest first)
                const activeSavedJobs = user.savedJobs
                    .filter((savedJob) => savedJob.job && savedJob.job.isActive)
                    .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));

                // Apply pagination
                const paginatedJobs = activeSavedJobs.slice(offset, offset + parseInt(limit));

                // Check if user has applied to any of these jobs
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
                    applicationStatus: applicationMap[savedJob.job._id.toString()] || null,
                }));

                res.send({
                    savedJobs: enrichedJobs,
                    total: activeSavedJobs.length,
                    page: parseInt(page),
                    totalPages: Math.ceil(activeSavedJobs.length / parseInt(limit)),
                    hasNextPage:
                        parseInt(page) < Math.ceil(activeSavedJobs.length / parseInt(limit)),
                    hasPrevPage: parseInt(page) > 1,
                    savedCount: activeSavedJobs.length,
                    maxAllowed: user.subscription === "premium" ? 50 : 5,
                    subscription: user.subscription,
                });
            } catch (err) {
                console.error("Error fetching saved jobs:", err);
                res.code(500).send({ message: "Failed to fetch saved jobs" });
            }
        }
    );

    // Check if a specific job is saved
    fastify.get(
        "/job/:jobId/is-saved",
        {
            preHandler: roleAuth(["user"]),
        },
        async (req, res) => {
            const userId = req.userId;
            const { jobId } = req.params;

            try {
                const user = await User.findById(userId).select("savedJobs subscription").lean();
                if (!user) {
                    return res.code(404).send({ message: "User not found" });
                }

                const isSaved = user.savedJobs.some(
                    (savedJob) => savedJob.job.toString() === jobId
                );

                res.send({
                    isSaved,
                    savedCount: user.savedJobs.length,
                    maxAllowed: user.subscription === "premium" ? 50 : 5,
                    canSaveMore: user.savedJobs.length < (user.subscription === "premium" ? 50 : 5),
                });
            } catch (err) {
                console.error("Error checking saved job:", err);
                res.code(500).send({ message: "Failed to check saved job status" });
            }
        }
    );

    // routes/endApplication.js
    fastify.post(
        "/application/end",
        { preHandler: roleAuth(["user", "company"]) },
        async (req, res) => {
            const { applicationId } = req.body;
            const userId = req.userId;

            if (!applicationId) {
                return res.code(400).send({ message: "Missing applicationId." });
            }

            const application = await Application.findOne({
                _id: applicationId,
                status: "accepted",
            }).populate("job");

            if (!application) {
                return res.code(404).send({ message: "Accepted application not found." });
            }

            const isUser = application.user?.toString() === userId;
            const isCompany = application.job?.postedBy?.toString() === userId;

            if (!isUser && !isCompany) {
                return res.code(403).send({ message: "You are not authorized to end this job." });
            }

            application.status = "ended";
            application.endedAt = new Date();
            await application.save();

            return res.send({ message: "Application marked as ended." });
        }
    );

    // Fixed pending-reviews and review endpoints

    fastify.get(
        "/pending-reviews",
        { preHandler: roleAuth(["user", "company"]) },
        async (req, res) => {
            const userId = req.userId;
            const userRole = req.userRole; // 'user' or 'company'

            try {
                // Find applications where the job has ended (status: 'ended' or 'accepted' with endedAt)
                let applications;

                if (userRole === "user") {
                    // User needs to review companies they worked for
                    applications = await Application.find({
                        user: userId,
                        status: { $in: ["ended", "accepted"] }, // Jobs that are completed
                        userReviewed: { $ne: true }, // User hasn't reviewed yet
                    })
                        .populate({
                            path: "job",
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
                        status: { $in: ["ended", "accepted"] }, // Jobs that are completed
                        companyReviewed: { $ne: true }, // Company hasn't reviewed yet
                    })
                        .populate("user", "fullName email profilePicture")
                        .populate("job", "title")
                        .lean();
                }

                // Format the response based on who needs to be reviewed
                const pendingReviews = applications.map((app) => ({
                    _id: app._id,
                    job: app.job,
                    // For users: they review the company
                    // For companies: they review the user
                    counterpartyType: userRole === "user" ? "Company" : "User",
                    company: userRole === "user" ? app.job?.company : undefined,
                    user: userRole === "company" ? app.user : undefined,
                    completedDate: app.endedAt || app.updatedAt,
                }));

                res.send(pendingReviews);
            } catch (err) {
                console.error("Error fetching pending reviews:", err);
                res.code(500).send({ message: "Failed to fetch pending reviews" });
            }
        }
    );

    fastify.post("/review", { preHandler: roleAuth(["user", "company"]) }, async (req, res) => {
        const { applicationId, rating, comment } = req.body;
        const reviewerId = req.userId;
        const reviewerRole = req.userRole; // 'user' or 'company'

        try {
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
                return res.code(404).send({ message: "Application not found" });
            }

            // Check if already reviewed
            const alreadyReviewed = await Review.findOne({
                reviewer: reviewerId,
                application: applicationId,
                reviewerType: reviewerRole === "user" ? "User" : "Company",
            });

            if (alreadyReviewed) {
                return res.code(400).send({ message: "You already reviewed this application." });
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
            await Review.create({
                reviewer: reviewerId,
                reviewerType: reviewerRole === "user" ? "User" : "Company",
                reviewee: revieweeId,
                revieweeType: revieweeType,
                application: applicationId,
                rating,
                comment,
                job: application.job._id, // Add job reference for context
            });

            // Update the application to mark as reviewed
            if (reviewerRole === "user") {
                application.userReviewed = true;
            } else {
                application.companyReviewed = true;
            }
            await application.save();

            // Create notification for the reviewee
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

            res.send({
                message: "Review submitted successfully",
                reviewedEntity: revieweeType,
            });
        } catch (err) {
            console.error("Error submitting review:", err);
            res.code(500).send({ message: "Failed to submit review" });
        }
    });
}

module.exports = jobRoutes;
