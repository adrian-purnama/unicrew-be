const { Readable } = require("stream");
const mongoose = require("mongoose");
const fs = require("fs");

function getBucket() {
  const db = mongoose.connection.db;
  return new mongoose.mongo.GridFSBucket(db, { bucketName: "assets" });
}

async function uploadToGridFS({ path, buffer, filename, contentType }) {
  const bucket = getBucket();
  const source = buffer ? Readable.from(buffer) : fs.createReadStream(path);

  return new Promise((resolve, reject) => {
    const upload = bucket.openUploadStream(filename || "file", { contentType });
    source.pipe(upload)
      .on("error", reject)
      .on("finish", () => resolve(upload.id));
  });
}

async function deleteFromGridFS(id) {
  if (!id) return;
  const bucket = getBucket();
  try {
    await bucket.delete(new mongoose.Types.ObjectId(id));
  } catch (_) {}
}

function streamFromGridFS(id) {
  const bucket = getBucket();
  return bucket.openDownloadStream(new mongoose.Types.ObjectId(id));
}

module.exports = { uploadToGridFS, deleteFromGridFS, streamFromGridFS };
