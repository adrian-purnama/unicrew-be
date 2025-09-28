// helpers/assetAuth.js
const Application = require("../schema/applicationSchema");
const Asset = require("../schema/assetSchema");

const dotenv = require("dotenv");
dotenv.config();

const beLink = process.env.BE_LINK;

/**
 * Authorization rules:
 * - avatar (profile picture): only the owner can view
 * - portfolio and cv: owner OR any company the user has applied to
 * - any other kind: owner only
 */
async function canViewAsset(userId, userRole, asset) {
  if (!asset) return false;
  const isOwner = String(asset.owner) === String(userId);
  if (asset.kind === "avatar") return isOwner;

  if (asset.kind === "portfolio" || asset.kind === "cv") {
    if (isOwner) return true;
    if (userRole !== "company") return false;
    const app = await Application.findOne({ user: asset.owner })
      .populate({ path: "job", select: "company", match: { company: userId } })
      .lean();
    return Boolean(app?.job);
  }

  return isOwner;
}

/**
 * Build a direct link (no token). Authorization is enforced per-request
 * via Authorization header when streaming the asset.
 */
async function verifyAndBuildAssetLink({ req, assetId }) {
  const viewerId = req.userId;
  const viewerRole = req.userRole || "user";

  const asset = await Asset.findById(assetId).lean();
  if (!asset) throw new Error("Asset not found");

  const allowed = await canViewAsset(viewerId, viewerRole, asset);
  if (!allowed) throw new Error("Forbidden");

  // Return a direct header-protected URL. Client must include Authorization header.
  return {
    url: `${beLink}/assets/${asset._id}`,
  };
}

module.exports = {
  canViewAsset,
  verifyAndBuildAssetLink,
};
