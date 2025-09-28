const { verifyAndBuildAssetLink } = require("../../helper/assetAuth");
const { sendApplicantStatusEmail } = require("../../helper/emailHelper");
const { roleAuth } = require("../../helper/roleAuth");

module.exports = async function (fastify) {
  const Review = require("../../schema/reviewSchema");
  const Application = require("../../schema/applicationSchema");
  const JobPost = require("../../schema/jobPostSchema");
  const User = require("../../schema/userSchema");
  const ChatRoom = require("../../schema/chatRoomSchema");
  const Notification = require("../../schema/notificationSchema");
  const { calculateMatchScore } = require("../../helper/jobFeedHelper");

  const toProtectedUrl = async (req, assetId) => {
    if (!assetId) return null;
    try {
      const { url } = await verifyAndBuildAssetLink({ req, assetId });
      return url || null;
    } catch {
      return null;
    }
  };

  fastify.post(
    "/apply",
    {
      preHandler: roleAuth(["user"]),
    },
    async (req, res) => {
      const userId = req.userId;
      const { jobId } = req.body;
      
      const user = await User.findById(userId).select("isVerified email").lean();
      if (!user) {
        return res.code(401).send({ message: "User not found." });
      }
      if (!user.isVerified) {
        return res.code(403).send({
          message: "Please verify your email before applying.",
          action: "verify_required", // optional hint for frontend
        });
      }

      const existing = await Application.findOne({ user: userId, job: jobId });
      if (existing) {
        return res
          .code(400)
          .send({ message: "You already applied to this job." });
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
  fastify.post(
    "/cancel-apply",
    {
      preHandler: roleAuth(["user"]),
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
        res
          .code(500)
          .send({ message: "Server error while cancelling application." });
      }
    }
  );
// applicationRoutes.js — replace the body of GET /job/:jobId/applicants with this richer payload
fastify.get(
  "/job/:jobId/applicants",
  { preHandler: roleAuth(["company"]) },
  async (req, res) => {
    try {
      const { jobId } = req.params;

      const job = await JobPost.findOne({ _id: jobId, company: req.userId })
        .populate([
          { path: "location.provinsi", select: "name" },
          { path: "location.kabupaten", select: "name" },
          { path: "location.kecamatan", select: "name" },
          { path: "requiredSkills", select: "name" },
        ])
        .lean();
      if (!job) return res.code(404).send({ message: "Job not found" });

      const applications = await Application.find({ job: jobId })
        .populate({
          path: "user",
          // ✅ only populate active users
          match: { isActive: true },
          select:
            "fullName email aboutMe skills location curriculumVitae portfolio profilePicture university studyProgram workTypePreferences minExpectedSalary industries",
          populate: [
            { path: "skills", select: "name" },
            { path: "university", select: "name" },
            { path: "studyProgram", select: "name" },
            { path: "location.provinsi", select: "name" },
            { path: "location.kabupaten", select: "name" },
            { path: "location.kecamatan", select: "name" },
          ],
        })
        .sort({ submittedAt: -1 })
        .lean();

      // ✅ drop applications whose user didn’t populate (inactive/null)
      const activeApps = applications.filter((a) => a.user);

      const toTempUrl = async (assetId) => {
        if (!assetId) return null;
        if (typeof assetId === "string" && /^https?:\/\//i.test(assetId)) return assetId;
        try {
          const { url } = await verifyAndBuildAssetLink({
            req,
            assetId,
            ttlSeconds: 300,
            reuse: true,
          });
          return url || null;
        } catch {
          return null;
        }
      };

      const withChatAndMatch = await Promise.all(
        activeApps.map(async (app) => {
          const chatRoom = await ChatRoom.findOne({
            user: app.user._id,
            company: req.userId,
            job: jobId,
          }).lean();

          const { score, reasons } = calculateMatchScore(job, app.user, {
            location: app.user.location,
            workType: app.user.workTypePreferences || [],
            minSalary: app.user.minExpectedSalary,
            industries: app.user.industries || [],
          });

          const [cvUrl, portfolioUrl, avatarUrl] = await Promise.all([
            toProtectedUrl(req, app.user.curriculumVitae),
            toProtectedUrl(req, app.user.portfolio),
            toProtectedUrl(req, app.user.profilePicture),
          ]);

          const [recentReviews, ratingStats] = await Promise.all([
            Review.find({
              reviewee: app.user._id,
              revieweeType: "User",
            })
              .sort({ createdAt: -1 })
              .limit(3)
              .populate({ path: "reviewer", select: "companyName fullName" })
              .lean(),
            Review.aggregate([
              { $match: { reviewee: app.user._id, revieweeType: "User" } },
              { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
              { $project: { _id: 0, avg: 1, count: 1 } },
            ]),
          ]);

          const simplifiedReviews = recentReviews.map((r) => ({
            _id: r._id,
            rating: r.rating,
            comment: r.comment || "",
            createdAt: r.createdAt,
            by:
              r.reviewerType === "Company"
                ? r.reviewer?.companyName || "Company"
                : r.reviewer?.fullName || "User",
          }));

          const userRating = {
            average: Number((ratingStats?.[0]?.avg || 0).toFixed(2)),
            count: ratingStats?.[0]?.count || 0,
          };

          return {
            ...app,
            chatRoom: chatRoom ? { _id: chatRoom._id } : null,
            user: {
              ...app.user,
              aboutMe: app.user.aboutMe || "",
              curriculumVitae: cvUrl,
              portfolio: portfolioUrl,
              profilePicture: avatarUrl,
            },
            match: {
              percent: Math.min(100, Math.round(score ?? 0)),
              reasons,
            },
            reviews: {
              rating: userRating,
              recent: simplifiedReviews,
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
      if (!Array.isArray(user) || user.length === 0) {
        return res.code(400).send({ message: "No users specified" });
      }

      const job = await JobPost.findById(jobId).lean();
      if (!job) return res.code(404).send({ message: "Job not found" });

      // Build filter to catch only applications that will CHANGE
      const filter = {
        job: jobId,
        user: { $in: user },
        status: status === "accepted" ? "shortListed" : { $ne: status }, // accept only from shortlisted; avoid no-op updates
      };

      // Find affected applications first (to get user ids/emails and avoid emailing no-op)
      const targetApps = await Application.find(filter)
        .populate({ path: "user", select: "email fullName" })
        .select("_id user status")
        .lean();

      if (targetApps.length === 0) {
        return res.send({ message: "No applicants to update.", modified: 0 });
      }

      // Perform update
      const updateRes = await Application.updateMany(
        { _id: { $in: targetApps.map((a) => a._id) } },
        { $set: { status } }
      );

      // If shortlisted, ensure chat rooms exist
      if (status === "shortListed") {
        await Promise.allSettled(
          targetApps.map(async (app) => {
            const uId = app.user?._id || app.user;
            if (!uId) return;
            const exists = await ChatRoom.findOne({
              user: uId,
              company: job.company,
              job: job._id,
            })
              .select("_id")
              .lean();

            if (!exists) {
              await ChatRoom.create({
                user: uId,
                company: job.company,
                job: job._id,
              });
            }
          })
        );
      }

      // Notifications
      const notifications = targetApps.map((app) => ({
        recipientType: "user",
        recipient: app.user?._id || app.user,
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
          userId: app.user?._id || app.user,
          companyId: job.company,
        },
      }));
      await Notification.insertMany(notifications);

      if (status === "shortListed" || status === "accepted") {
        await Promise.allSettled(
          targetApps
            .map((app) => app.user?.email)
            .filter(Boolean)
            .map((email) =>
              sendApplicantStatusEmail(
                email,
                status,
                job.title,
                `${process.env.FE_LINK}/user/applications`
              )
            )
        );
      }

      return res.send({
        message: `Updated ${updateRes.modifiedCount} applicants.`,
        modified: updateRes.modifiedCount || 0,
        emailed:
          status === "shortListed" || status === "accepted"
            ? targetApps.filter((a) => a.user?.email).length
            : 0,
      });
    }
  );
  fastify.get(
    "/my-applications",
    { preHandler: roleAuth(["user"]) },
    async (req, res) => {
      const userId = req.userId;
      const { status } = req.query;

      const statusArray = status
        ? status.split(",")
        : ["shortListed", "accepted"];

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
    }
  );
  fastify.post(
    "/application/end",
    { preHandler: roleAuth(["user", "company"]) },
    async (req, res) => {
      const { applicationId } = req.body;
      const userId = req.userId;

      if (!applicationId) {
        return res.code(400).send({ message: "Missing applicationId." });
      }

      // Fetch by id (don't pre-filter by status so we can handle idempotency)
      const application = await Application.findById(applicationId).populate(
        "job"
      );
      if (!application) {
        return res.code(404).send({ message: "Application not found." });
      }

      // Helpers to compare ObjectId / populated docs
      const toId = (v) => v?._id?.toString?.() ?? v?.toString?.();

      // Authorization: user (applicant) or job owner (company)
      const isUser = toId(application.user) === userId;
      const jobOwnerIds = [
        toId(application.job?.company),
        toId(application.job?.postedBy),
      ].filter(Boolean);
      const isCompany = jobOwnerIds.includes(userId);

      if (!isUser && !isCompany) {
        return res
          .code(403)
          .send({ message: "You are not authorized to end this job." });
      }

      // Idempotent: already ended
      if (application.status === "ended") {
        return res.send({
          message: "Application already ended.",
          endedAt: application.endedAt,
        });
      }

      // Only allow ending from accepted
      if (application.status !== "accepted") {
        return res
          .code(400)
          .send({ message: "Only accepted applications can be ended." });
      }

      application.status = "ended";
      application.endedAt = new Date();
      await application.save();

      return res.send({
        message: "Application marked as ended.",
        endedAt: application.endedAt,
      });
    }
  );
};
