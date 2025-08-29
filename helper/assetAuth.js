// helpers/assetAuth.js
const mongoose = require("mongoose");
const Application = require("../schema/applicationSchema");
const Asset = require("../schema/assetSchema");
const AssetSession = require("../schema/tempLinkSchema");

const dotenv = require("dotenv");

dotenv.config();

const beLink = process.env.BE_LINK;      

function nowPlus(seconds) {
  return new Date(Date.now() + seconds * 1000);
}

/**
 * Owner OR (avatar public) OR (company the candidate applied to)
 */
async function canViewAsset(userId, userRole, asset) {
  if (!asset) return false;
  if (String(asset.owner) === String(userId)) return true;
  if (asset.kind === "avatar" && asset.visibility === "public") return true;

  if (userRole !== "company") return false;

  const app = await Application.findOne({ user: asset.owner })
    .populate({ path: "job", select: "company", match: { company: userId } })
    .lean();

  return Boolean(app?.job);
}

/**
 * Verify access and return a public, temporary link that anyone can open.
 * - Reuses an existing valid session for the asset (if reuse=true)
 * - Otherwise creates a new one (default TTL 5 minutes)
 * - Returns: { url, sid, expiresAt }
 */
async function verifyAndBuildAssetLink({ req, assetId, ttlSeconds = 300, reuse = true }) {
  const viewerId = req.userId;
  const viewerRole = req.userRole || "user";

  const asset = await Asset.findById(assetId).lean();
  if (!asset) throw new Error("Asset not found");

  const allowed = await canViewAsset(viewerId, viewerRole, asset)
  
  if (!allowed) throw new Error("Forbidden");

  if (asset.kind === "avatar" && asset.visibility === "public") {
    console.log(`${beLink}/assets/${asset._id}`)
    return { url: `${beLink}/assets/${asset._id}`, sid: null, expiresAt: null };
  }

  if (reuse) {
    const existing = await AssetSession.findOne({
      asset: asset._id,
      expiresAt: { $gt: new Date() },
    })
      .sort({ expiresAt: -1 })
      .lean();
      console.log(existing)

    if (existing) {
      return {
        url: `${beLink}/assets/session/${existing._id}`,
        sid: String(existing._id),
        expiresAt: existing.expiresAt.toISOString(),
      };
    }
  }

  // Create a fresh session (5 minutes)
  const doc = await AssetSession.create({
    _id: new mongoose.Types.ObjectId(), // becomes the public token
    asset: asset._id,
    createdBy: viewerId,
    creatorModel: viewerRole === "company" ? "Company" : "User",
    expiresAt: nowPlus(ttlSeconds),
  });
  console.log(doc)


  return {
    url: `${beLink}/assets/session/${doc._id}`,
    sid: String(doc._id),
    expiresAt: doc.expiresAt.toISOString(),
  };
}

module.exports = {
  canViewAsset,
  verifyAndBuildAssetLink,
};
