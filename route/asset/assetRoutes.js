// routes/assetRoutes.js
const Asset = require("../../schema/assetSchema");
const AssetSession = require("../../schema/tempLinkSchema");
const { streamFromGridFS } = require("../../helper/gridfsHelper");

module.exports = async function assetRoutes(fastify) {

  /**
   * PUBLIC streaming via session id (no auth required)
   * - Anyone with the link can access until expiry
   */
  fastify.get("/assets/session/:sid", async (req, reply) => {
  const sid = req.params.sid;

  const session = await AssetSession.findById(sid).lean();
  if (!session) return reply.code(404).send({ message: "Invalid link" });
  if (session.expiresAt <= new Date()) return reply.code(410).send({ message: "Link expired" });
  if (session.maxUses != null && session.useCount >= session.maxUses) {
    return reply.code(410).send({ message: "Link exhausted" });
  }

  const asset = await Asset.findById(session.asset).lean();
  if (!asset) return reply.code(404).send({ message: "Asset missing" });

  // non-blocking stats
  AssetSession.updateOne(
    { _id: session._id },
    { $inc: { useCount: 1 }, $set: { lastAccessAt: new Date() } }
  ).catch(() => {});

  const stream = streamFromGridFS(asset.gridfsId);
  stream.on("error", () => reply.code(404).send({ message: "File not found" }));

  reply
    .header("Content-Type", asset.mime || "application/octet-stream")
    .header("Cache-Control", "no-store")
    .header("Content-Disposition", `inline; filename="${asset.filename || "file"}"`);

  return reply.send(stream);
});

};
