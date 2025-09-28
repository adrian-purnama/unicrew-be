// routes/assetRoutes.js
const Asset = require("../../schema/assetSchema");
const { streamFromGridFS } = require("../../helper/gridfsHelper");
const { roleAuth } = require("../../helper/roleAuth");
const { canViewAsset } = require("../../helper/assetAuth");

module.exports = async function assetRoutes(fastify) {
  /**
   * Direct streaming with authorization check on every request.
   * Supports either:
   *  - stateless signed token via query (?token=...)
   *  - Authorization header (optionalAuth) + server-side permission check
   */
  fastify.get("/assets/:assetId", { preHandler: roleAuth(["user", "company"]) }, async (req, reply) => {
    try {
      const { assetId } = req.params;

      const asset = await Asset.findById(assetId).lean();
      if (!asset) return reply.code(404).send({ message: "Asset not found" });

      const authorized = await canViewAsset(req.userId, req.userRole || "user", asset);

      if (!authorized) return reply.code(403).send({ message: "Forbidden" });

      const stream = streamFromGridFS(asset.gridfsId);
      stream.on("error", () => reply.code(404).send({ message: "File not found" }));

      reply
        .header("Content-Type", asset.mime || "application/octet-stream")
        .header("Cache-Control", "no-store")
        .header("Content-Disposition", `inline; filename="${asset.filename || "file"}"`);

      return reply.send(stream);
    } catch (e) {
      req.log.error({ err: e }, "Asset stream failed");
      return reply.code(500).send({ message: "Failed to stream asset" });
    }
  });

  // No legacy session route
};
