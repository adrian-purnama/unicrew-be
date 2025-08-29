// companyRoutes.js
const multer = require("fastify-multer");
const fs = require("fs");
const path = require("path");

const Company = require("../../schema/companySchema");
const Asset = require("../../schema/assetSchema");

const { verifyAndBuildAssetLink } = require("../../helper/assetAuth");
const { roleAuth } = require("../../helper/roleAuth");
const { uploadToGridFS, deleteFromGridFS } = require("../../helper/gridfsHelper");

// ─────────────────────────────────────────────────────────────
// Config (mirror user route behavior)
// ─────────────────────────────────────────────────────────────
const MAX_BYTES = 100 * 1024 * 1024; // keep in sync with user route limit
const FIELD_CONFIG = {
  profilePicture: {
    kind: "avatar",
    visibility: "private", // same as user; use temp URL for viewing
    mimes: ["image/jpeg", "image/png", "image/webp"],
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
// Helpers (same pattern as user route)
// ─────────────────────────────────────────────────────────────
async function createAsset({ ownerId, kind, visibility, file }) {
  const filename = `${kind}-${ownerId}-${Date.now()}${path.extname(file.originalname || "")}`;
  const gridfsId = await uploadToGridFS({
    path: file.path,
    filename,
    contentType: file.mimetype,
  });
  // cleanup temp
  fs.unlink(file.path, () => {});

  return Asset.create({
    owner: ownerId,        // company id
    kind,                  // 'avatar'
    provider: "gridfs",
    gridfsId,
    filename,
    mime: file.mimetype,
    size: file.size,
    visibility,            // 'private'
  });
}

async function deleteAssetById(assetId) {
  if (!assetId) return;
  const old = await Asset.findById(assetId).lean();
  if (old?.gridfsId) await deleteFromGridFS(old.gridfsId);
  await Asset.deleteOne({ _id: assetId });
}

module.exports = async function companyRoutes(fastify) {
  // PATCH /company/profile  (update fields + optional logo upload) — mirrors user route
  fastify.patch(
    "/profile",
    {
      preHandler: [
        roleAuth(["company"]),
        upload.fields([{ name: "profilePicture", maxCount: 1 }]),
      ],
    },
    async (req, reply) => {
      const companyId = req.userId;
      const company = await Company.findById(companyId);
      if (!company) return reply.code(404).send({ message: "Company not found" });

      try {
        // never trust asset fields from body
        const updates = { ...req.body };
        delete updates.profilePicture;

        const file = req.files?.profilePicture?.[0];

        // If new logo uploaded → create Asset, delete old, set ObjectId ref
        if (file) {
          const logoAsset = await createAsset({
            ownerId: companyId,
            kind: FIELD_CONFIG.profilePicture.kind,
            visibility: FIELD_CONFIG.profilePicture.visibility,
            file,
          });

          if (company.profilePicture) {
            await deleteAssetById(company.profilePicture);
          }
          updates.profilePicture = logoAsset._id;
          console.log("[company/profile] logo set:", String(logoAsset._id));
        }

        const updated = await Company.findByIdAndUpdate(companyId, updates, { new: true });
        return reply.send({ message: "Company profile updated successfully", company: updated });
      } catch (err) {
        // cleanup any leftover temp files if multer placed them
        for (const arr of Object.values(req.files || {})) (arr || []).forEach((f) => fs.unlink(f.path, () => {}));
        return reply.code(400).send({ message: err.message });
      }
    }
  );

  // GET /company/profile (unchanged; still builds a 5-min temp URL for logo)
  fastify.get(
    "/profile",
    { preHandler: roleAuth(["company"]) },
    async (req, reply) => {
      const company = await Company.findById(req.userId)
        .populate("location.provinsi location.kabupaten location.kecamatan industries")
        .lean();

      if (!company) return reply.code(404).send({ message: "Company not found" });

      if (company.profilePicture) {
        try {
          const { url } = await verifyAndBuildAssetLink({
            req,
            assetId: company.profilePicture,
            ttlSeconds: 300,
            reuse: true,
          });
          company.profilePicture = url || null;
        } catch {
          company.profilePicture = null;
        }
      } else {
        company.profilePicture = null;
      }

      return reply.send(company);
    }
  );
};
