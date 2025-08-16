module.exports = async function (fastify) {
  const JobPost = require("../../schema/jobPostSchema");
  const roleAuth = require("../../helper/roleAuth");
  const { jobPostDto, jobFeedDto } = require("./dto");
  const mongoose = require("mongoose");
  const User = require("../../schema/userSchema");
  const Application = require("../../schema/applicationSchema");
  const { calculateMatchScore } = require("../../helper/jobFeedHelper");

  //create new job post
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
  fastify.get("/job", async (req, res) => {
    const jobs = await JobPost.find({ isActive: true })
      .populate("company requiredSkills")
      .sort({ createdAt: -1 });

    res.send(jobs);
  });

  fastify.get(
    "/job/:jobId",
    { preHandler: roleAuth(["company"]) },
    async (req, res) => {
      const job = await JobPost.findOne({
        _id: req.params.jobId,
        company: req.userId,
      }).populate(
        "requiredSkills location.provinsi location.kabupaten location.kecamatan"
      );

      if (!job) return res.code(404).send({ message: "Job not found" });

      res.send(job);
    }
  );

  fastify.get(
    "/job-postings",
    { preHandler: roleAuth(["company"]) },
    async (req, res) => {
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
    }
  );

  fastify.delete(
    "/job/:id",
    { preHandler: roleAuth(["company"]) },
    async (req, res) => {
      const { id } = req.params;
      await JobPost.findOneAndDelete({ _id: id, company: req.userId });
      res.send({ message: "Job deleted" });
    }
  );

  fastify.patch(
    "/job/:id/disable",
    { preHandler: roleAuth(["company"]) },
    async (req, res) => {
      const { id } = req.params;
      await JobPost.findOneAndUpdate(
        { _id: id, company: req.userId },
        { isActive: false }
      );
      res.send({ message: "Job disabled" });
    }
  );

  fastify.patch(
    "/job/:id/enable",
    { preHandler: roleAuth(["company"]) },
    async (req, res) => {
      const { id } = req.params;
      await JobPost.findOneAndUpdate(
        { _id: id, company: req.userId },
        { isActive: true }
      );
      res.send({ message: "Job enabled" });
    }
  );
  fastify.get(
    "/job-postings/enabled",
    { preHandler: roleAuth(["company"]) },
    async (req, res) => {
      const jobs = await JobPost.find({
        company: req.userId,
        isActive: true,
      }).populate(
        "requiredSkills location.provinsi location.kabupaten location.kecamatan"
      );
      res.send(jobs);
    }
  );

  fastify.get(
    "/job-postings/disabled",
    { preHandler: roleAuth(["company"]) },
    async (req, res) => {
      const jobs = await JobPost.find({
        company: req.userId,
        isActive: false,
      }).populate(
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
      const userId = req.userId; // undefined if not logged in
      const rawQuery = req.query;

      // Parse location filters
      const location = {
        provinsi: rawQuery["location[provinsi]"],
        kabupaten: rawQuery["location[kabupaten]"],
        kecamatan: rawQuery["location[kecamatan]"],
      };
      const locationCleaned = Object.values(location).some(Boolean)
        ? location
        : undefined;

      // Helper to normalize array query params
      const normalizeArray = (val) =>
        Array.isArray(val) ? val : val ? [val] : [];
      const skillFilter = normalizeArray(rawQuery.skills);
      const workTypeFilterArray = normalizeArray(rawQuery.workType);
      const industryFilterArray = normalizeArray(rawQuery.industries);
      const minSalary = rawQuery.minSalary
        ? parseInt(rawQuery.minSalary)
        : undefined;
      const keyword = rawQuery.keyword?.toLowerCase()?.trim();

      // Pagination params
      const page = parseInt(rawQuery.page) || 1;
      const limit = parseInt(rawQuery.limit) || 10;
      const offset = (page - 1) * limit;

      // Detect if user applied any explicit filters/search
      const hasExplicitFilters =
        skillFilter.length > 0 ||
        workTypeFilterArray.length > 0 ||
        industryFilterArray.length > 0 ||
        locationCleaned ||
        typeof minSalary === "number" ||
        !!keyword;

      try {
        let user = null;
        let interactedJobIds = [];

        if (userId) {
          // Fetch user data for logged-in user
          user = await User.findById(userId)
            .populate([
              "skills",
              "location.provinsi",
              "location.kabupaten",
              "location.kecamatan",
            ])
            .lean();

          if (!user) return res.code(404).send({ message: "User not found" });

          interactedJobIds = await Application.find({ user: userId }).distinct(
            "job"
          );
        }

        // Base filter: only active jobs
        let finalMatch = { isActive: true };

        // Keyword search filter
        if (keyword) {
          finalMatch.$or = [
            { title: { $regex: keyword, $options: "i" } },
            { "company.companyName": { $regex: keyword, $options: "i" } },
          ];
        }

        // Exclude already applied jobs for logged in users
        if (interactedJobIds.length > 0) {
          finalMatch._id = {
            $nin: interactedJobIds.map((id) => new mongoose.Types.ObjectId(id)),
          };
        }

        // User-based filtering only if logged in and no explicit filters/search applied
        if (user && !hasExplicitFilters) {
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
            searchStrategy: userId ? "user_based" : "all_active",
            isFiltered: hasExplicitFilters,
            message: "No jobs match the current criteria",
          });
        }

        // Query jobs with aggregation to lookup company and skills
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

        // Populate location names for each job
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

        // If logged in, calculate match scores and saved status
        let enrichedJobs;
        if (user) {
          const maxSavedAllowed = user.subscription === "premium" ? 50 : 5;
          const userSavedCount = user.savedJobs?.length || 0;

          enrichedJobs = jobs.map((job) => {
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
              isSaved,
              canSaveMore: isSaved || userSavedCount < maxSavedAllowed,
              userSavedCount,
              maxSavedAllowed,
            };
          });

          enrichedJobs.sort((a, b) => b.matchScore - a.matchScore);
        } else {
          enrichedJobs = jobs;
        }

        res.send({
          jobs: enrichedJobs,
          total: totalCount,
          page,
          totalPages: Math.ceil(totalCount / limit),
          hasNextPage: page < Math.ceil(totalCount / limit),
          hasPrevPage: page > 1,
          searchStrategy: userId ? "user_based" : "all_active",
          isFiltered: hasExplicitFilters,
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
};
