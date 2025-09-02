const multer = require("fastify-multer");
const path = require("path");
const fs = require("fs");
const User = require("../../schema/userSchema");
const { uploadFile, deleteFile } = require("../../helper/googleDrive");

const { roleAuth } = require("../../helper/roleAuth");
const dotenv = require("dotenv");
const { isUserProfileComplete } = require("../../helper/userHelper");
const { userProfileDto } = require("./dto");
const { uploadToGridFS, deleteFromGridFS } = require("../../helper/gridfsHelper");
const Asset = require("../../schema/assetSchema");
const { verifyAndBuildAssetLink } = require("../../helper/assetAuth");
dotenv.config();

const profileFolderId = process.env.GDRIVE_FOLDER_PROFILE;
const cvFolderId = process.env.GDRIVE_FOLDER_CV;
const portfolioFolderId = process.env.GDRIVE_FOLDER_PORTFOLIO;

// const upload = multer({ dest: "temp/" });

function extractDriveFileId(link) {
    if (!link || typeof link !== "string") return null;
    const match = link.match(/(?:id=|\/d\/)([a-zA-Z0-9_-]{10,})/);
    return match ? match[1] : null;
}

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────
const MAX_BYTES = 100 * 1024 * 1024; // 5MB per file; bump if portfolio is often bigger

const FIELD_CONFIG = {
  profilePicture: {
    kind: "avatar",
    visibility: "private", // change to "public" if you want avatars visible without auth
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
  const filename = `${kind}-${userId}-${Date.now()}${path.extname(file.originalname || "")}`;
  const gridfsId = await uploadToGridFS({
    path: file.path,
    filename,
    contentType: file.mimetype,
  });
  // remove temp file
  fs.unlink(file.path, () => {});

  return Asset.create({
    owner: userId,
    kind,              // 'avatar' | 'cv' | 'portfolio'
    provider: "gridfs",
    gridfsId,
    filename,
    mime: file.mimetype,
    size: file.size,
    visibility,        // 'public' | 'private'
  });
}

async function deleteAssetById(assetId) {
  if (!assetId) return;
  const old = await Asset.findById(assetId).lean();
  if (old?.gridfsId) await deleteFromGridFS(old.gridfsId);
  await Asset.deleteOne({ _id: assetId });
}


async function userRoutes(fastify, options) {
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
        const avatarAsset    = p ? await createAsset({ userId, kind: FIELD_CONFIG.profilePicture.kind, visibility: FIELD_CONFIG.profilePicture.visibility, file: p }) : null;
        const cvAsset        = c ? await createAsset({ userId, kind: FIELD_CONFIG.cv.kind,            visibility: FIELD_CONFIG.cv.visibility,            file: c }) : null;
        const portfolioAsset = f ? await createAsset({ userId, kind: FIELD_CONFIG.portfolio.kind,     visibility: FIELD_CONFIG.portfolio.visibility,     file: f }) : null;

        const updates = { ...req.body };

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

        const updated = await User.findByIdAndUpdate(userId, updates, { new: true });

        // Minimal logs to confirm
        if (avatarAsset)    console.log("[profile] avatar set:",    String(avatarAsset._id));
        if (cvAsset)        console.log("[profile] cv set:",        String(cvAsset._id));
        if (portfolioAsset) console.log("[profile] portfolio set:", String(portfolioAsset._id));

        return reply.send({ message: "Profile updated", user: updated });
      } catch (err) {
        console.log(err)
        for (const arr of Object.values(req.files || {})) (arr || []).forEach((f) => fs.unlink(f.path, () => {}));
        return reply.code(400).send({ message: err.message });
      }
    }
  );


    fastify.get("/profile-check", { preHandler: roleAuth(["user"]) }, async (req, res) => {
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
    });

fastify.get(
  "/profile",
  { preHandler: roleAuth(["user", "admin"]) },
  async (req, res) => {
    const user = await User.findById(req.userId).populate(
      "university studyProgram skills location.provinsi location.kabupaten location.kecamatan"
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

    // helper to build a 5-min public URL or return null
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

    // profile picture
    userObj.profilePicture = await buildUrl(user.profilePicture);

    // CV
    userObj.curriculumVitae = await buildUrl(user.curriculumVitae);

    // Portfolio
    userObj.portfolio = await buildUrl(user.portfolio);

    return res.send(userObj);
  }
);

}

module.exports = userRoutes;
