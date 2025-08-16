module.exports = async function (fastify) {
  const roleAuth = require("../../helper/roleAuth");
  const User = require("../../schema/userSchema");
  const JobPost = require("../../schema/jobPostSchema");
  const Application = require("../../schema/applicationSchema");
  const { getMaxSavedJobs, isPremium, getSubscriptionLabel } = require("../../helper/subscriptionHelper");

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
                                path: "requiredSkills",
                                select: "name",
                            },
                        ],
                    })
                    .lean();

                if (!user) {
                    return res.code(404).send({ message: "User not found" });
                }

                const userSubscription = user.subscription || "free";

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

                // Use subscription helper for stats calculation
                const maxAllowed = getMaxSavedJobs(userSubscription);
                const savedCount = activeSavedJobs.length;
                const percentageUsed = Math.round((savedCount / maxAllowed) * 100);
                const isUserPremium = isPremium(userSubscription);
                const subscriptionLabel = getSubscriptionLabel(userSubscription);

                // Generate upgrade message using subscription helper logic
                let upgradeMessage = null;
                if (!isUserPremium && savedCount >= 1) {
                    // Changed from 3 to 1 since free limit is now 2
                    upgradeMessage = `You're using ${savedCount} of ${maxAllowed} saved job slots. Upgrade to Premium for 50 slots!`;
                } else if (savedCount >= maxAllowed * 0.8) {
                    upgradeMessage = `You're running low on saved job slots (${savedCount}/${maxAllowed}).`;
                }

                // Generate stats object using subscription helper
                const stats = {
                    savedCount,
                    maxAllowed,
                    percentageUsed,
                    remainingSlots: maxAllowed - savedCount,
                    isNearLimit: savedCount >= maxAllowed * 0.8,
                    isAtLimit: savedCount >= maxAllowed,
                    subscription: userSubscription,
                    subscriptionLabel,
                    isPremium: isUserPremium,
                    upgradeMessage,
                };

                res.send({
                    savedJobs: enrichedJobs,
                    total: activeSavedJobs.length,
                    page: parseInt(page),
                    totalPages: Math.ceil(activeSavedJobs.length / parseInt(limit)),
                    hasNextPage:
                        parseInt(page) < Math.ceil(activeSavedJobs.length / parseInt(limit)),
                    hasPrevPage: parseInt(page) > 1,
                    // Integrated stats using subscription helper
                    stats,
                    // Legacy fields for backward compatibility
                    savedCount: activeSavedJobs.length,
                    maxAllowed,
                    subscription: userSubscription,
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
};
