module.exports = async function (fastify) {
  const roleAuth = require("../../helper/roleAuth");
  const Application = require("../../schema/applicationSchema");
  const JobPost = require("../../schema/jobPostSchema");
  const Review = require("../../schema/reviewSchema");
  const Notification = require("../../schema/notificationSchema");
  const { recalculateRatings } = require("../../helper/ratingHelper");

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
                            select: "title description company",
                            populate: {
                                path: "company",
                                select: "companyName email profilePicture", // Ensure profilePicture is included
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
                        .populate("user", "fullName email profilePicture") // Include user profile picture
                        .populate("job", "title description")
                        .lean();
                }

                // Format the response based on who needs to be reviewed
                const pendingReviews = applications.map((app) => {
                    const baseReview = {
                        _id: app._id,
                        job: {
                            _id: app.job._id,
                            title: app.job.title,
                            description: app.job.description,
                        },
                        counterpartyType: userRole === "user" ? "Company" : "User",
                        completedDate: app.endedAt || app.updatedAt,
                        applicationStatus: app.status,
                    };

                    if (userRole === "user") {
                        // User is reviewing the company
                        baseReview.company = {
                            _id: app.job?.company?._id,
                            companyName: app.job?.company?.companyName,
                            name: app.job?.company?.companyName, // Alias for consistency
                            email: app.job?.company?.email,
                            profilePicture: app.job?.company?.profilePicture,
                        };
                    } else {
                        // Company is reviewing the user
                        baseReview.user = {
                            _id: app.user._id,
                            fullName: app.user.fullName,
                            email: app.user.email,
                            profilePicture: app.user.profilePicture,
                        };
                    }

                    return baseReview;
                });

                res.send(pendingReviews);
            } catch (err) {
                console.error("Error fetching pending reviews:", err);
                res.code(500).send({ message: "Failed to fetch pending reviews" });
            }
        }
    );

    fastify.post("/review", { preHandler: roleAuth(["user", "company"]) }, async (req, res) => {
        const { applicationId, rating, comment, tags = [], wouldRecommend } = req.body;
        const reviewerId = req.userId;
        const reviewerRole = req.userRole; // 'user' or 'company'
        console.log(reviewerId, reviewerRole)

        try {
            // Validate rating
            if (!rating || rating < 1 || rating > 5) {
                return res.code(400).send({
                    message: "Rating must be between 1 and 5",
                });
            }

            // Find the application with full population
            const application = await Application.findById(applicationId)
                .populate("user", "fullName email profilePicture rating")
                .populate({
                    path: "job",
                    populate: {
                        path: "company",
                        select: "companyName email profilePicture rating",
                    },
                });

            if (!application) {
                return res.code(404).send({ message: "Application not found" });
            }

            // Verify application status allows reviews
            if (!["ended", "accepted"].includes(application.status)) {
                return res.code(400).send({
                    message: "Can only review completed applications",
                });
            }

            // Check authorization
            if (reviewerRole === "user" && application.user._id.toString() !== reviewerId) {
                return res.code(403).send({ message: "Not authorized to review this application" });
            }

            if (
                reviewerRole === "company" &&
                application.job.company._id.toString() !== reviewerId
            ) {
                return res.code(403).send({ message: "Not authorized to review this application" });
            }

            // Check if already reviewed
            const existingReview = await Review.findOne({
                reviewer: reviewerId,
                application: applicationId,
                reviewerType: reviewerRole === "user" ? "User" : "Company",
            });

            if (existingReview) {
                return res
                    .code(400)
                    .send({ message: "You have already reviewed this application" });
            }

            // Determine who is being reviewed
            let revieweeId, revieweeType, revieweeName;

            if (reviewerRole === "user") {
                // User is reviewing the company
                revieweeId = application.job.company._id;
                revieweeType = "Company";
                revieweeName = application.job.company.companyName;
            } else {
                // Company is reviewing the user
                revieweeId = application.user._id;
                revieweeType = "User";
                revieweeName = application.user.fullName;
            }

            // Create the review
            const newReview = await Review.create({
                reviewer: reviewerId,
                reviewerType: reviewerRole === "user" ? "User" : "Company",
                reviewee: revieweeId,
                revieweeType: revieweeType,
                application: applicationId,
                job: application.job._id,
                rating,
                comment: comment || "",
                tags: tags || [],
                wouldRecommend: wouldRecommend || null,
            });

            // Update the application to mark as reviewed
            if (reviewerRole === "user") {
                application.userReviewed = true;
            } else {
                application.companyReviewed = true;
            }
            await application.save();

            // Recalculate and update ratings
            const updatedRating = await recalculateRatings(revieweeId, revieweeType);

            // Create notification for the reviewee
            await Notification.create({
                recipientType: revieweeType.toLowerCase(),
                recipient: revieweeId,
                type: "review",
                event: "review_received",
                message: `You received a new ${rating}-star review from ${
                    reviewerRole === "user"
                        ? application.user.fullName
                        : application.job.company.companyName
                }`,
                metadata: {
                    reviewerId,
                    applicationId,
                    rating,
                    jobId: application.job._id,
                    reviewId: newReview._id,
                    averageRating: updatedRating.average,
                    totalReviews: updatedRating.count,
                },
            });

            // Log the review activity
            console.log(
                `Review submitted: ${reviewerRole} ${reviewerId} rated ${revieweeType} ${revieweeId} with ${rating} stars`
            );

            res.send({
                success: true,
                message: "Review submitted successfully",
                data: {
                    review: {
                        _id: newReview._id,
                        rating,
                        comment,
                        reviewedEntity: revieweeType,
                        revieweeName,
                    },
                    updatedRating: {
                        average: updatedRating.average,
                        count: updatedRating.count,
                    },
                },
            });
        } catch (err) {
            console.error("Error submitting review:", err);
            res.code(500).send({
                message: "Failed to submit review",
                error: process.env.NODE_ENV === "development" ? err.message : undefined,
            });
        }
    });
};
