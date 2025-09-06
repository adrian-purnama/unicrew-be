// routes/userRoutes.js
const multer = require("fastify-multer");
const path = require("path");
const fs = require("fs");
const { default: mongoose } = require("mongoose");

const User = require("../../schema/userSchema");
const Skill = require("../../schema/skillSchema");
const Asset = require("../../schema/assetSchema");
const Application = require("../../schema/applicationSchema");

const { roleAuth } = require("../../helper/roleAuth");
const { isUserProfileComplete } = require("../../helper/userHelper");
const { normalizeName } = require("../../helper/normalizeHelper");
const { verifyAndBuildAssetLink } = require("../../helper/assetAuth");
const { uploadToGridFS, deleteFromGridFS } = require("../../helper/gridfsHelper");

const dotenv = require("dotenv");
dotenv.config();

const profileFolderId = process.env.GDRIVE_FOLDER_PROFILE;
const cvFolderId = process.env.GDRIVE_FOLDER_CV;
const portfolioFolderId = process.env.GDRIVE_FOLDER_PORTFOLIO;

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────
const MAX_BYTES = 100 * 1024 * 1024; // 100MB

const FIELD_CONFIG = {
  profilePicture: {
    kind: "avatar",
    visibility: "private",
    mimes: ["image/jpeg", "image/png", "image/webp"],
  },
  cv: {
    kind: "cv",
    visibility: "private",
    mimes: ["application/pdf"],
  },
  portfolio: {
    kind: "portfolio",
    visibility: "private",
    mimes: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
  },
};

const upload = multer({
  dest: "temp/",
  limits: { fileSize: MAX_BYTES },
  fileFilter: (req, file, cb) => {
    const cfg = FIELD_CONFIG[file.fieldname];
    const ok = !!cfg && cfg.mimes.includes(file.mimetype);
    cb(ok ? null : new Error(`Invalid file type for ${file.fieldname}`), ok);
  },
});

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
async function createAsset({ userId, kind, visibility, file }) {
  const filename = `${kind}-${userId}-${Date.now()}${path.extname(
    file.originalname || ""
  )}`;
  const gridfsId = await uploadToGridFS({
    path: file.path,
    filename,
    contentType: file.mimetype,
  });
  // remove temp file
  fs.unlink(file.path, () => {});

  return Asset.create({
    owner: userId,
    kind, // 'avatar' | 'cv' | 'portfolio'
    provider: "gridfs",
    gridfsId,
    filename,
    mime: file.mimetype,
    size: file.size,
    visibility, // 'public' | 'private'
  });
}

async function deleteAssetById(assetId) {
  if (!assetId) return;
  const old = await Asset.findById(assetId).lean();
  if (old?.gridfsId) await deleteFromGridFS(old.gridfsId);
  await Asset.deleteOne({ _id: assetId });
}

async function userRoutes(fastify, options) {
  // Update profile (with assets + skills)
  fastify.patch(
    "/profile",
    {
      preHandler: [
        roleAuth(["user", "admin"]),
        upload.fields([
          { name: "profilePicture", maxCount: 1 },
          { name: "cv", maxCount: 1 },
          { name: "portfolio", maxCount: 1 },
        ]),
      ],
    },
    async (req, reply) => {
      const userId = req.userId;
      const user = await User.findById(userId);
      if (!user) return reply.code(404).send({ message: "User not found" });

      try {
        const files = req.files || {};
        const p = files.profilePicture?.[0];
        const c = files.cv?.[0];
        const f = files.portfolio?.[0];

        // Upload new assets where provided
        const avatarAsset = p
          ? await createAsset({
              userId,
              kind: FIELD_CONFIG.profilePicture.kind,
              visibility: FIELD_CONFIG.profilePicture.visibility,
              file: p,
            })
          : null;
        const cvAsset = c
          ? await createAsset({
              userId,
              kind: FIELD_CONFIG.cv.kind,
              visibility: FIELD_CONFIG.cv.visibility,
              file: c,
            })
          : null;
        const portfolioAsset = f
          ? await createAsset({
              userId,
              kind: FIELD_CONFIG.portfolio.kind,
              visibility: FIELD_CONFIG.portfolio.visibility,
              file: f,
            })
          : null;

        const updates = { ...req.body };

        // Prepare skills update (set full array so validator runs)
        let toAdd = [];
        let toRemove = [];
        if (typeof updates.skills !== "undefined") {
          let nextIds = Array.isArray(updates.skills)
            ? updates.skills
            : [updates.skills];
          nextIds = nextIds.map((id) => String(id));

          const currentIds = (user.skills || []).map((id) => String(id));

          toAdd = nextIds.filter((id) => !currentIds.includes(id));
          toRemove = currentIds.filter((id) => !nextIds.includes(id));

          updates.skills = nextIds; // set full array (validator <=10 will run)
        }

        if (avatarAsset) {
          await deleteAssetById(user.profilePicture);
          updates.profilePicture = avatarAsset._id;
        }
        if (cvAsset) {
          await deleteAssetById(user.curriculumVitae);
          updates.curriculumVitae = cvAsset._id;
        }
        if (portfolioAsset) {
          await deleteAssetById(user.portfolio);
          updates.portfolio = portfolioAsset._id;
        }

        // IMPORTANT: runValidators ensures the skills length rule is enforced
        const updated = await User.findByIdAndUpdate(userId, updates, {
          new: true,
          runValidators: true,
        });

        // Only adjust Skill.usageCount AFTER successful user update
        if (toAdd.length) {
          await Skill.updateMany(
            { _id: { $in: toAdd } },
            { $inc: { usageCount: 1 } }
          );
        }
        if (toRemove.length) {
          await Skill.updateMany(
            { _id: { $in: toRemove }, usageCount: { $gt: 0 } },
            { $inc: { usageCount: -1 } }
          );
        }

        // Minimal logs
        if (avatarAsset)
          console.log("[profile] avatar set:", String(avatarAsset._id));
        if (cvAsset) console.log("[profile] cv set:", String(cvAsset._id));
        if (portfolioAsset)
          console.log("[profile] portfolio set:", String(portfolioAsset._id));

        return reply.send({ message: "Profile updated", user: updated });
      } catch (err) {
        console.log(err);
        for (const arr of Object.values(req.files || {}))
          (arr || []).forEach((f) => fs.unlink(f.path, () => {}));
        return reply.code(400).send({ message: err.message });
      }
    }
  );

  // Profile completeness
  fastify.get(
    "/profile-check",
    { preHandler: roleAuth(["user"]) },
    async (req, res) => {
      try {
        const user = await User.findById(req.userId);
        if (!user) return res.code(404).send({ message: "User not found" });

        const result = isUserProfileComplete(user);
        result.isVerified = user.isVerified;

        if (!user.isVerified && user.expiresAt) {
          result.daysRemainingUntilDeletion = Math.max(
            0,
            Math.floor((user.expiresAt - Date.now()) / (1000 * 60 * 60 * 24))
          );
        }

        return res.code(200).send(result);
      } catch (err) {
        console.error("Error checking profile completeness:", err);
        return res.code(500).send({ message: "Internal server error" });
      }
    }
  );

  // Get profile
  fastify.get(
    "/profile",
    { preHandler: roleAuth(["user", "admin"]) },
    async (req, res) => {
      const user = await User.findById(req.userId)
        .populate({ path: "skills", select: "name usageCount" })
        .populate(
          "university studyProgram location.provinsi location.kabupaten location.kecamatan"
        );

      if (!user) return res.code(404).send({ message: "User not found" });

      const maskEmail = (email) => {
        const [userPart, domain] = email.split("@");
        const visibleStart = userPart.slice(0, 2);
        const visibleEnd = userPart.slice(-2);
        return `${visibleStart}****${visibleEnd}@${domain}`;
      };

      const userObj = user.toObject();
      userObj.email = maskEmail(user.email);

      const buildUrl = async (assetId) => {
        if (!assetId) return null;
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

      userObj.profilePicture = await buildUrl(user.profilePicture);
      userObj.curriculumVitae = await buildUrl(user.curriculumVitae);
      userObj.portfolio = await buildUrl(user.portfolio);

      userObj.skills = (userObj.skills || []).map((s) =>
        s && s._id
          ? { _id: s._id, name: s.name, usageCount: s.usageCount ?? 0 }
          : s
      );

      return res.send(userObj);
    }
  );

  // Counts
  fastify.get(
    "/my-counts",
    { preHandler: roleAuth(["user"]) },
    async (req, res) => {
      const oid = new mongoose.Types.ObjectId(req.userId);

      try {
        const [agg] = await Application.aggregate([
          { $match: { user: oid } },
          {
            $facet: {
              applied: [{ $match: { status: "applied" } }, { $count: "n" }],
              shortListed: [
                { $match: { status: "shortListed" } },
                { $count: "n" },
              ],
              accepted: [{ $match: { status: "accepted" } }, { $count: "n" }],
              review: [
                {
                  $match: {
                    status: { $in: ["ended", "accepted"] },
                    userReviewed: { $ne: true },
                  },
                },
                { $count: "n" },
              ],
            },
          },
          {
            $project: {
              applied: { $ifNull: [{ $arrayElemAt: ["$applied.n", 0] }, 0] },
              shortListed: {
                $ifNull: [{ $arrayElemAt: ["$shortListed.n", 0] }, 0],
              },
              accepted: { $ifNull: [{ $arrayElemAt: ["$accepted.n", 0] }, 0] },
              review: { $ifNull: [{ $arrayElemAt: ["$review.n", 0] }, 0] },
            },
          },
          { $addFields: { pending: { $add: ["$applied", "$shortListed"] } } },
        ]);

        res.send(
          agg || {
            applied: 0,
            shortListed: 0,
            pending: 0,
            accepted: 0,
            review: 0,
          }
        );
      } catch (err) {
        req.log.error(err, "Failed to aggregate counters");
        res.code(500).send({ message: "Failed to fetch counters" });
      }
    }
  );

  // ADD skill(s) — uses save() so validator runs (<= 10 skills)
  fastify.post(
    "/skill/add",
    { preHandler: roleAuth(["user"]) },
    async (req, res) => {
      try {
        const userId = req.userId;
        const body = req.body || {};
        let names = [];

        if (Array.isArray(body.names)) {
          names = body.names;
        } else if (typeof body.name === "string") {
          names = [body.name];
        }

        names = names
          .map((s) => (s || "").toString().trim())
          .filter((s) => s.length >= 2);

        if (names.length === 0) {
          return res.code(400).send({ message: "Provide a skill name (>=2 chars)." });
        }

        // Load user doc once (so we can push + save -> validator runs)
        const user = await User.findById(userId).select("skills");
        if (!user) return res.code(404).send({ message: "User not found" });

        const addedIds = [];
        const results = [];

        for (const rawName of names) {
          const normName = normalizeName(rawName);

          // Upsert/find Skill by normalized name
          let skill;
          try {
            skill = await Skill.findOneAndUpdate(
              { normName },
              { $setOnInsert: { name: rawName, normName, source: "user" } },
              { upsert: true, new: true }
            ).select("_id name usageCount");
          } catch (e) {
            if (e.code === 11000) {
              skill = await Skill.findOne({ normName }).select("_id name usageCount");
            } else {
              throw e;
            }
          }

          // Dedupe in user.skills
          const exists = user.skills.some((id) => String(id) === String(skill._id));
          if (!exists) {
            user.skills.push(skill._id); // will trigger validator on save()
            addedIds.push(skill._id);
            results.push({ skill, added: true });
          } else {
            results.push({ skill, added: false });
          }
        }

        // Save once; enforces <= 10 via schema validator
        await user.save();

        // Only now bump usageCount for the newly added ones
        if (addedIds.length) {
          await Skill.updateMany(
            { _id: { $in: addedIds } },
            { $inc: { usageCount: 1 } }
          );
        }

        // Return latest usageCount for UI
        const latest = await Skill.find({ _id: { $in: results.map(r => r.skill._id) } })
          .select("_id name usageCount")
          .lean();

        const latestMap = new Map(latest.map(s => [String(s._id), s]));
        const hydrated = results.map(r => ({
          skill: latestMap.get(String(r.skill._id)) || r.skill,
          added: r.added,
        }));

        return res.code(201).send({ ok: true, results: hydrated });
      } catch (e) {
        if (e.name === "ValidationError") {
          return res.code(400).send({ message: e.message });
        }
        return res.code(400).send({ message: e.message || "Failed to add skill(s)" });
      }
    }
  );

  // REMOVE skill
  fastify.post(
    "/skill/remove",
    { preHandler: roleAuth(["user"]) },
    async (req, res) => {
      const userId = req.userId;
      const { skillId } = req.body || {};
      if (!skillId)
        return res.code(400).send({ message: "skillId is required." });

      const result = await User.updateOne(
        { _id: userId },
        { $pull: { skills: skillId } }
      );

      if (result.modifiedCount > 0) {
        await Skill.updateOne(
          { _id: skillId, usageCount: { $gt: 0 } },
          { $inc: { usageCount: -1 } }
        );
      }

      return res.send({ ok: true, removed: result.modifiedCount > 0 });
    }
  );
}

module.exports = userRoutes;
