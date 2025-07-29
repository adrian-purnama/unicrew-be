const JobPost = require("../../schema/jobPostSchema");
const roleAuth = require("../../helper/roleAuth");
const { jobPostDto, jobFeedDto, cancelApplyJobDto, applyJobDto } = require("./dto");
const User = require("../../schema/userSchema");
const Application = require("../../schema/applicationSchema");
const { default: mongoose } = require("mongoose");
const { calculateMatchScore } = require("../../helper/jobFeedHelper");
const Notification = require("../../schema/notificationSchema");
const ChatRoom = require("../../schema/chatRoomSchema");

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

    fastify.get(
        "/job-feed",
        {
            preHandler: roleAuth(["user"]),
            schema: jobFeedDto,
        },
        async (req, res) => {
            const userId = req.userId;

            // ⛏️ Extract raw query
            const rawQuery = req.query;

            // ✅ Manually extract location (since Fastify doesn't parse nested query objects by default)
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

            const page = parseInt(rawQuery.page) || 1;
            const limit = parseInt(rawQuery.limit) || 10;

            try {
                const user = await User.findById(userId).populate(
                    "skills location.provinsi location.kabupaten location.kecamatan"
                );

                const userSkills = skillFilter.length
                    ? skillFilter
                    : user.skills.map((s) => s._id.toString());

                const userLocation = user.location || {};

                const interactedJobIdsRaw = await Application.find({ user: userId })
                    .where("job")
                    .ne(null)
                    .distinct("job");

                const interactedJobIds = interactedJobIdsRaw.map(
                    (id) => new mongoose.Types.ObjectId(id)
                );

                const workTypeFilter = workTypeFilterArray.length
                    ? { workType: { $in: workTypeFilterArray } }
                    : {};

                const industryFilter = industryFilterArray.length
                    ? { industries: { $in: industryFilterArray } }
                    : {};

                const provId = locationCleaned?.provinsi || userLocation.provinsi?._id;
                const kabId = locationCleaned?.kabupaten || userLocation.kabupaten?._id;
                const kecId = locationCleaned?.kecamatan || userLocation.kecamatan?._id;

                const isRemoteFilter = workTypeFilterArray.includes("remote");
                const isWorkTypeFiltered = workTypeFilterArray.length > 0;

                console.log("\u{1F4E5} Incoming Filters:", {
                    location: locationCleaned,
                    skills: skillFilter,
                    workType: workTypeFilterArray,
                    industries: industryFilterArray,
                });

                console.log("\u{1F9E0} Generating location fallbacks...");

                const locationFallbacks = [];

                if (!isRemoteFilter) {
                    if (provId && kabId && kecId) {
                        locationFallbacks.push({
                            "location.provinsi": provId,
                            "location.kabupaten": kabId,
                            "location.kecamatan": kecId,
                        });
                    }
                    if (provId && kabId) {
                        locationFallbacks.push({
                            "location.provinsi": provId,
                            "location.kabupaten": kabId,
                        });
                    }
                    if (provId) {
                        locationFallbacks.push({
                            "location.provinsi": provId,
                        });
                    }
                }

                if (isRemoteFilter || !isWorkTypeFiltered) {
                    locationFallbacks.push({ workType: "remote" });
                }

                locationFallbacks.push({}); // Catch-all

                const userSkillsObjectIds = userSkills.map((id) => new mongoose.Types.ObjectId(id));
                const jobMap = new Map();

                for (const [index, locFilter] of locationFallbacks.entries()) {
                    const matchStage = {
                        $match: {
                            isActive: true,
                            _id: { $nin: interactedJobIds },
                            ...industryFilter,
                        },
                    };

                    if (locFilter.workType === "remote") {
                        matchStage.$match.workType = "remote";
                    } else {
                        Object.assign(matchStage.$match, locFilter);
                        if (isWorkTypeFiltered) {
                            matchStage.$match.workType = {
                                $in: workTypeFilterArray,
                            };
                        }
                    }

                    const jobsRaw = await JobPost.aggregate([
                        matchStage,
                        {
                            $addFields: {
                                skillMatchCount: {
                                    $size: {
                                        $setIntersection: ["$requiredSkills", userSkillsObjectIds],
                                    },
                                },
                                totalSkillCount: { $size: "$requiredSkills" },
                            },
                        },
                        {
                            $addFields: {
                                matchPercentage: {
                                    $cond: [
                                        { $eq: ["$totalSkillCount", 0] },
                                        0,
                                        {
                                            $divide: ["$skillMatchCount", "$totalSkillCount"],
                                        },
                                    ],
                                },
                            },
                        },
                        {
                            $facet: {
                                highMatch: [
                                    { $match: { matchPercentage: { $gte: 0.8 } } },
                                    {
                                        $sample: {
                                            size: Math.ceil(limit * 0.5),
                                        },
                                    },
                                ],
                                mediumMatch: [
                                    {
                                        $match: {
                                            matchPercentage: { $gte: 0.4, $lt: 0.8 },
                                        },
                                    },
                                    {
                                        $sample: {
                                            size: Math.floor(limit * 0.3),
                                        },
                                    },
                                ],
                                exploratory: [
                                    {
                                        $match: {
                                            matchPercentage: { $lt: 0.4 },
                                        },
                                    },
                                    {
                                        $sample: {
                                            size: Math.floor(limit * 0.2),
                                        },
                                    },
                                ],
                            },
                        },
                        {
                            $project: {
                                combined: {
                                    $concatArrays: ["$highMatch", "$mediumMatch", "$exploratory"],
                                },
                            },
                        },
                        { $unwind: "$combined" },
                        { $replaceRoot: { newRoot: "$combined" } },
                    ]);

                    for (const job of jobsRaw) {
                        const id = job._id.toString();
                        if (!jobMap.has(id)) {
                            jobMap.set(id, job);
                        }
                    }
                }

                const uniqueJobs = Array.from(jobMap.values());

                const jobs = await JobPost.populate(
                    uniqueJobs.slice((page - 1) * limit, page * limit),
                    [
                        {
                            path: "company",
                            select: "companyName profilePicture industries description socialLinks.website socialLinks.instagram socialLinks.linkedin socialLinks.twitter",
                            populate: {
                                path: "industries",
                                select: "name",
                            },
                        },
                        { path: "requiredSkills", select: "name" },
                        { path: "location.provinsi", select: "name" },
                        { path: "location.kabupaten", select: "name" },
                        { path: "location.kecamatan", select: "name" },
                    ]
                );

                const enrichedJobs = jobs.map((job) => {
                    const { score, reasons } = calculateMatchScore(job, user, {
                        location: {
                            provinsi: provId?.toString(),
                            kabupaten: kabId?.toString(),
                            kecamatan: kecId?.toString(),
                        },
                        workType: workTypeFilterArray,
                        minSalary,
                        industries: industryFilterArray,
                    });

                    return {
                        ...job,
                        matchScore: score,
                        whyThisJob: reasons,
                    };
                });

                const sorted = enrichedJobs.sort((a, b) => b.matchScore - a.matchScore);
                const paginated = sorted.slice((page - 1) * limit, page * limit);

                res.send({
                    jobs: paginated,
                    total: sorted.length,
                    page: Number(page),
                });
            } catch (err) {
                console.error("\u{274C} Error in /job-feed:", err);
                res.code(500).send({ message: "Failed to fetch job feed" });
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

            // 🔔 Notify company
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
    fastify.post(
        "/cancel-apply",
        {
            preHandler: roleAuth(["user"]),
            schema: cancelApplyJobDto,
        },
        async (req, res) => {
            const userId = req.userId;
            const { jobId } = req.body;

            const application = await Application.findOne({
                user: userId,
                job: jobId,
                status: { $in: ["applied", "shortlisted"] },
            });

            if (!application) {
                return res.code(404).send({ message: "No cancellable application found." });
            }

            await application.deleteOne();
            res.send({ message: "Application cancelled." });
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
}

module.exports = jobRoutes;
