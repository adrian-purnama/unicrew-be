const Company = require("../../schema/companySchema");
const kabupaten = require("../../schema/kabupatenSchema");
const kecamatan = require("../../schema/kecamatanSchema");
const provinsi = require("../../schema/provinsiSchema");

module.exports = async function (fastify) {
  const { roleAuth, optionalAuth } = require("../../helper/roleAuth");
  const JobPost = require("../../schema/jobPostSchema");
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
    // only this company's ACTIVE jobs
    const jobs = await JobPost.find({ company: req.userId, isActive: true })
      .sort({ createdAt: -1 })
      .populate([
        { path: "location.provinsi", select: "name" },
        { path: "location.kabupaten", select: "name" },
        { path: "location.kecamatan", select: "name" },
        { path: "requiredSkills", select: "name" },
      ])
      .lean();

    const jobIds = jobs.map((j) => j._id);
    if (jobIds.length === 0) return res.send([]);

    // count applications per status, but ONLY from ACTIVE users
    const USER_COLLECTION = User.collection.name; // usually "users"

    const aggregates = await Application.aggregate([
      { $match: { job: { $in: jobIds } } },
      {
        $lookup: {
          from: USER_COLLECTION,
          localField: "user",
          foreignField: "_id",
          as: "applicant",
        },
      },
      { $unwind: "$applicant" },
      { $match: { "applicant.isActive": true } },
      {
        $group: {
          _id: { job: "$job", status: "$status" },
          count: { $sum: 1 },
        },
      },
    ]);

    const emptyCounts = { applied: 0, shortListed: 0, accepted: 0, rejected: 0 };
    const countMap = Object.create(null);

    for (const { _id, count } of aggregates) {
      const key = String(_id.job);
      if (!countMap[key]) countMap[key] = { ...emptyCounts };
      countMap[key][_id.status] = count;
    }

    const enriched = jobs.map((job) => ({
      ...job,
      statusCounts: countMap[String(job._id)] || { ...emptyCounts },
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
  // add near your other requires at top of file

  fastify.get(
    "/job-feed",
    { preHandler: optionalAuth(["user"]), schema: jobFeedDto },
    async (req, reply) => {
      const startedAt = Date.now();

      // ───────── helpers ─────────
      const normalizeArray = (v) =>
        Array.isArray(v) ? v.filter(Boolean) : v ? [v] : [];
      const toObjectId = (v) => {
        try {
          return v ? new mongoose.Types.ObjectId(String(v)) : null;
        } catch {
          return null;
        }
      };
      const nowIso = () => new Date().toISOString();

      // collection names for lookups
      const COMPANY_COLLECTION = Company.collection.name; // usually "companies"
      const PROVINSI_COLLECTION = provinsi.collection.name; // e.g. "provinsis"
      const KABUPATEN_COLLECTION = kabupaten.collection.name; // e.g. "kabupatens"
      const KECAMATAN_COLLECTION = kecamatan.collection.name; // e.g. "kecamatans"

      // toggle: randomize non-matches only when filtered page has zero matches
      const randomizeNonWhenNoMatches = false;

      const q = req.query || {};
      const userId = req.userId; // undefined for guests
      const page = Math.max(1, Number(q.page) || 1);
      const limit = Math.min(50, Math.max(1, Number(q.limit) || 10));
      const offset = (page - 1) * limit;

      try {
        // =============== 1) USER FIRST (defaults) ===============
        let user = null;
        let interactedJobIds = [];
        if (userId) {
          user = await User.findById(userId)
            .populate([
              "skills",
              "location.provinsi",
              "location.kabupaten",
              "location.kecamatan",
            ])
            .lean();
          if (!user) return reply.code(404).send({ message: "User not found" });
          interactedJobIds = await Application.find({ user: userId }).distinct(
            "job"
          );
        }

        const userSkills = (user?.skills || [])
          .map((s) => (s?._id || s)?.toString())
          .filter(Boolean);
        const userLocation = user?.location
          ? {
              provinsi:
                user.location.provinsi?._id?.toString() ||
                user.location.provinsi?.toString() ||
                "",
              kabupaten:
                user.location.kabupaten?._id?.toString() ||
                user.location.kabupaten?.toString() ||
                "",
              kecamatan:
                user.location.kecamatan?._id?.toString() ||
                user.location.kecamatan?.toString() ||
                "",
            }
          : null;

        // =============== 2) QUERY FILTERS (explicit scope) ===============
        const skillsQ = normalizeArray(q.skills);
        const workTypeQ = normalizeArray(q.workType);
        const industriesQ = normalizeArray(q.industries);

        const keyword = typeof q.keyword === "string" ? q.keyword.trim() : "";
        const keywordActive = keyword.length >= 2;

        const minSalary = q.minSalary != null ? Number(q.minSalary) : undefined;
        const minSalaryActive = Number.isFinite(minSalary) && minSalary > 0;

        const locationQ = {
          provinsi: q?.location?.provinsi || q.provinsi,
          kabupaten: q?.location?.kabupaten || q.kabupaten,
          kecamatan: q?.location?.kecamatan || q.kecamatan,
        };
        const locationQCleaned =
          locationQ.provinsi || locationQ.kabupaten || locationQ.kecamatan
            ? locationQ
            : null;

        const filterActive =
          skillsQ.length > 0 ||
          workTypeQ.length > 0 ||
          industriesQ.length > 0 ||
          minSalaryActive ||
          !!locationQCleaned ||
          keywordActive;

        // =============== 3) BUILD SCOPE & USER-MATCH PREDICATES ===============
        const scopeMatch = { isActive: true };
        if (interactedJobIds.length)
          scopeMatch._id = {
            $nin: interactedJobIds.map(toObjectId).filter(Boolean),
          };

        if (filterActive) {
          if (skillsQ.length) {
            const ids = skillsQ.map(toObjectId).filter(Boolean);
            if (ids.length) scopeMatch.requiredSkills = { $in: ids };
          }
          if (workTypeQ.length) scopeMatch.workType = { $in: workTypeQ };
          if (industriesQ.length) scopeMatch.industry = { $in: industriesQ };
          if (minSalaryActive)
            scopeMatch["salaryRange.min"] = { $gte: minSalary };
          if (locationQCleaned) {
            for (const k of ["provinsi", "kabupaten", "kecamatan"]) {
              const id = toObjectId(locationQCleaned[k]);
              if (id) scopeMatch[`location.${k}`] = id;
            }
          }
        }

        const userMatchOr = [];
        if (user) {
          if (userSkills.length)
            userMatchOr.push({
              requiredSkills: {
                $in: userSkills.map(toObjectId).filter(Boolean),
              },
            });
          if (userLocation?.provinsi)
            userMatchOr.push({
              "location.provinsi": toObjectId(userLocation.provinsi),
            });
          if (userLocation?.kabupaten)
            userMatchOr.push({
              "location.kabupaten": toObjectId(userLocation.kabupaten),
            });
          if (userLocation?.kecamatan)
            userMatchOr.push({
              "location.kecamatan": toObjectId(userLocation.kecamatan),
            });
          userMatchOr.push({ workType: "remote" });
        }

        const postLookupKeyword = keywordActive
          ? {
              $or: [
                { title: { $regex: keyword, $options: "i" } },
                { "company.companyName": { $regex: keyword, $options: "i" } },
              ],
            }
          : null;

        // ───────── pretty header ─────────
        console.log(
          `\n┌──────────────────────── /job-feed ────────────────────────┐\n` +
            `│ time: ${nowIso()}   page: ${page}  limit: ${limit}  actor: ${
              user ? `user:${userId}` : "guest"
            }\n` +
            `│ mode: ${
              filterActive ? "FILTERED (strict scope)" : "UNFILTERED (global)"
            }\n` +
            `├──────────────────────────────── scope (query-only) ───────┤\n` +
            `│ skills    : ${JSON.stringify(skillsQ)}\n` +
            `│ location  : ${
              locationQCleaned ? JSON.stringify(locationQCleaned) : "[]"
            }\n` +
            `│ workType  : ${JSON.stringify(workTypeQ)}\n` +
            `│ industries: ${JSON.stringify(industriesQ)}\n` +
            `│ minSalary : ${String(minSalaryActive ? minSalary : "-")}\n` +
            `│ keyword   : ${String(keywordActive ? keyword : "-")}\n` +
            `├──────────────────────────── user-match signals ───────────┤\n` +
            `│ userSkills: ${JSON.stringify(userSkills)}\n` +
            `│ userLoc   : ${
              userLocation ? JSON.stringify(userLocation) : "(none)"
            }\n` +
            `└───────────────────────────────────────────────────────────┘`
        );

        // =============== 4) DEFINE BUCKET MATCHES ===============
        const matchedMatch = { ...scopeMatch };
        const nonMatch = { ...scopeMatch };
        if (userMatchOr.length) {
          matchedMatch.$or = userMatchOr;
          nonMatch.$nor = [{ $or: userMatchOr }];
        }

        // =============== 5) COUNT HELPERS (respect keyword) ===============
        const countWithKeyword = async (match) => {
          const pipe = [
            { $match: match },

            // join ONLY active companies
            {
              $lookup: {
                from: COMPANY_COLLECTION,
                let: { companyId: "$company" },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $eq: ["$_id", "$$companyId"] },
                          { $eq: ["$isActive", true] },
                        ],
                      },
                    },
                  },
                ],
                as: "company",
              },
            },
            { $unwind: "$company" },
          ];

          if (postLookupKeyword) pipe.push({ $match: postLookupKeyword });
          pipe.push({ $count: "total" });

          const out = await JobPost.aggregate(pipe);
          return out?.[0]?.total || 0;
        };

        // =============== 6) FILTERED SCOPE CHECK ===============
        if (filterActive) {
          const scopeCount = await countWithKeyword(scopeMatch);
          console.log(`│ scope count: ${scopeCount}`);
          if (scopeCount === 0) {
            console.log("└─> scope empty → returning empty feed (per spec)\n");
            return reply.send({
              jobs: [],
              total: 0,
              page,
              totalPages: 0,
              hasNextPage: false,
              hasPrevPage: page > 1,
              mode: "filtered-empty",
            });
          }
        }

        // =============== 7) BUCKET COUNTS & PLAN ===============
        const matchedTotal = await countWithKeyword(matchedMatch);
        const nonTotal = await countWithKeyword(nonMatch);
        const combinedTotal = matchedTotal + nonTotal;

        const matchedSkip = Math.min(matchedTotal, offset);
        const matchedTake = Math.max(0, Math.min(limit, matchedTotal - offset));
        const nonOffset = Math.max(0, offset - matchedTotal);
        const nonTake = Math.max(0, limit - matchedTake);

        console.log(
          `┌───────────────────────────── planning ─────────────────────────────┐\n` +
            `│ matchedTotal=${matchedTotal}  nonTotal=${nonTotal}  combined=${combinedTotal}\n` +
            `│ offset=${offset}  take=${limit}\n` +
            `│ page plan → matched: take=${matchedTake} (skip ${matchedSkip}) · non: take=${nonTake} (skip ${nonOffset})\n` +
            `└────────────────────────────────────────────────────────────────────┘`
        );

        // =============== 8) PIPELINE BUILDER (with LOCATION POPULATE) ===============
        const buildPipeline = (
          match,
          { skip = 0, take = 10, randomize = false } = {}
        ) => {
          const pipe = [
            { $match: match },
            // when randomizing *this bucket*, do it before lookups (note: breaks deterministic paging)
            ...(randomize ? [{ $sample: { size: take + (skip || 0) } }] : []),
            { $sort: randomize ? { _id: 1 } : { createdAt: -1, _id: -1 } }, // keep stable order
            // company
            {
              $lookup: {
                from: COMPANY_COLLECTION,
                let: { companyId: "$company" },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $eq: ["$_id", "$$companyId"] },
                          { $eq: ["$isActive", true] },
                        ],
                      },
                    },
                  },
                ],
                as: "company",
              },
            },
            { $unwind: "$company" },
            { $unwind: { path: "$company", preserveNullAndEmptyArrays: true } },
            // required skills
            {
              $lookup: {
                from: "skills",
                localField: "requiredSkills",
                foreignField: "_id",
                as: "requiredSkills",
              },
            },
            // LOCATION POPULATE
            {
              $lookup: {
                from: PROVINSI_COLLECTION,
                localField: "location.provinsi",
                foreignField: "_id",
                as: "provinsiDoc",
              },
            },
            {
              $unwind: {
                path: "$provinsiDoc",
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $lookup: {
                from: KABUPATEN_COLLECTION,
                localField: "location.kabupaten",
                foreignField: "_id",
                as: "kabupatenDoc",
              },
            },
            {
              $unwind: {
                path: "$kabupatenDoc",
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $lookup: {
                from: KECAMATAN_COLLECTION,
                localField: "location.kecamatan",
                foreignField: "_id",
                as: "kecamatanDoc",
              },
            },
            {
              $unwind: {
                path: "$kecamatanDoc",
                preserveNullAndEmptyArrays: true,
              },
            },
            // keyword AFTER company lookup (and doesn't interfere with location)
            ...(postLookupKeyword ? [{ $match: postLookupKeyword }] : []),
            // recent company reviews
            {
              $lookup: {
                from: "reviews",
                let: { companyId: "$company._id" },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $eq: ["$reviewee", "$$companyId"] },
                          { $eq: ["$revieweeType", "Company"] },
                        ],
                      },
                    },
                  },
                  { $sort: { createdAt: -1 } },
                  { $limit: 3 },
                  { $project: { _id: 1, rating: 1, comment: 1, createdAt: 1 } },
                ],
                as: "companyReviews",
              },
            },
            // derive rating + merge location objects
            {
              $addFields: {
                companyRatingAverage: {
                  $ifNull: [
                    "$company.rating.average",
                    { $avg: "$companyReviews.rating" },
                  ],
                },
                companyRatingCount: {
                  $ifNull: [
                    "$company.rating.count",
                    { $size: "$companyReviews" },
                  ],
                },
                location: {
                  provinsi: {
                    _id: {
                      $ifNull: ["$provinsiDoc._id", "$location.provinsi"],
                    },
                    name: "$provinsiDoc.name",
                  },
                  kabupaten: {
                    _id: {
                      $ifNull: ["$kabupatenDoc._id", "$location.kabupaten"],
                    },
                    name: "$kabupatenDoc.name",
                  },
                  kecamatan: {
                    _id: {
                      $ifNull: ["$kecamatanDoc._id", "$location.kecamatan"],
                    },
                    name: "$kecamatanDoc.name",
                  },
                },
              },
            },
            // clean temp fields
            { $project: { provinsiDoc: 0, kabupatenDoc: 0, kecamatanDoc: 0 } },
            // paging
            ...(randomize ? [] : [{ $skip: skip }]),
            ...(randomize ? [] : [{ $limit: take }]),
          ];

          // when randomized, we already sampled exact size; no skip/limit to keep it simple
          if (randomize) {
            // trim to page slice manually using $limit after sample if skip>0 (rare)
            if (skip > 0) pipe.push({ $skip: skip });
            pipe.push({ $limit: take });
          }

          return pipe;
        };

        // =============== 9) FETCH PAGE DATA ===============
        let matchedPage = [];
        let nonPage = [];

        if (matchedTake > 0) {
          matchedPage = await JobPost.aggregate(
            buildPipeline(matchedMatch, {
              skip: matchedSkip,
              take: matchedTake,
              randomize: false,
            })
          );
        }

        const shouldRandomizeNon =
          filterActive && matchedTake === 0 && randomizeNonWhenNoMatches;
        if (nonTake > 0) {
          nonPage = await JobPost.aggregate(
            buildPipeline(nonMatch, {
              skip: shouldRandomizeNon ? 0 : nonOffset,
              take: nonTake,
              randomize: shouldRandomizeNon,
            })
          );
        }

        // Unfiltered & nothing found → last resort latest active (also with location populate)
        if (
          !filterActive &&
          combinedTotal === 0 &&
          matchedPage.length + nonPage.length === 0
        ) {
          console.log("⚠️  no items globally → fallback to latest active");
          const latest = await JobPost.aggregate(
            buildPipeline(
              {
                isActive: true,
                ...(interactedJobIds.length
                  ? {
                      _id: {
                        $nin: interactedJobIds.map(toObjectId).filter(Boolean),
                      },
                    }
                  : {}),
              },
              { skip: offset, take: limit, randomize: false }
            )
          );
          matchedPage = latest;
        }

        // combine in order
        let pageJobs = [...matchedPage, ...nonPage];

        // =============== 10) ENRICH (matchScore for users) ===============
        if (user) {
          const maxSavedAllowed = user.subscription === "premium" ? 50 : 5;
          const userSavedCount = user.savedJobs?.length || 0;

          pageJobs = pageJobs
            .map((job) => {
              const userLoc = user.location || {};
              const { score, reasons } = calculateMatchScore(job, user, {
                location: {
                  provinsi: (
                    userLocation?.provinsi || userLoc.provinsi?._id
                  )?.toString(),
                  kabupaten: (
                    userLocation?.kabupaten || userLoc.kabupaten?._id
                  )?.toString(),
                  kecamatan: (
                    userLocation?.kecamatan || userLoc.kecamatan?._id
                  )?.toString(),
                },
                workType: workTypeQ,
                minSalary: minSalaryActive ? minSalary : undefined,
                industries: industriesQ,
              });
              const isSaved = user.savedJobs?.some(
                (e) => String(e.job) === String(job._id)
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
            })
            .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
        }

        // =============== 11) LOG RESULT ===============
        const tookMs = Date.now() - startedAt;
        const sampleMatched = matchedPage
          .slice(0, 3)
          .map(
            (j) =>
              `${j.title} · ${j.company?.companyName || "-"} · ${
                j.location?.kabupaten?.name || "-"
              }`
          );
        const sampleNon = nonPage
          .slice(0, 3)
          .map(
            (j) =>
              `${j.title} · ${j.company?.companyName || "-"} · ${
                j.location?.kabupaten?.name || "-"
              }`
          );

        console.log(
          `┌──────────────────────────── result ────────────────────────────┐\n` +
            `│ page=${page}  returned=${pageJobs.length}/${limit}  took=${tookMs}ms\n` +
            `│ matched: total=${matchedTotal} · thisPage=${
              matchedPage.length
            }  ex: ${sampleMatched.join(" | ") || "-"}\n` +
            `│ non    : total=${nonTotal}    · thisPage=${
              nonPage.length
            }      ex: ${sampleNon.join(" | ") || "-"}\n` +
            `└───────────────────────────────────────────────────────────────┘\n`
        );

        // =============== 12) RESPOND ===============
        const totalForClient = filterActive
          ? matchedTotal + nonTotal
          : matchedTotal + nonTotal || matchedPage.length + nonPage.length;

        return reply.send({
          jobs: pageJobs,
          total: totalForClient,
          page,
          totalPages: Math.ceil(totalForClient / limit) || 1,
          hasNextPage: offset + pageJobs.length < totalForClient,
          hasPrevPage: page > 1,
          mode: filterActive ? "filtered" : "unfiltered",
          buckets: {
            matchedTotal,
            nonMatchedTotal: nonTotal,
            matchedThisPage: matchedPage.length,
            nonMatchedThisPage: nonPage.length,
          },
        });
      } catch (err) {
        const tookMs = Date.now() - startedAt;
        console.log(`❌ /job-feed error: ${err.message} (took ${tookMs}ms)`);
        return reply.code(500).send({
          message: "Failed to fetch job feed",
          error: err.message,
          stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
        });
      }
    }
  );
};
