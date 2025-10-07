const { Readable } = require("stream");
const mongoose = require("mongoose");
const fs = require("fs");

function getBucket() {
  const db = mongoose.connection.db;
  return new mongoose.mongo.GridFSBucket(db, { bucketName: "assets" });
}

function getCVBucket() {
  const db = mongoose.connection.db;
  return new mongoose.mongo.GridFSBucket(db, { bucketName: "cv_files" });
}

async function uploadToGridFS({ path, buffer, filename, contentType, ttlMinutes }) {
  const bucket = getBucket();
  const source = buffer ? Readable.from(buffer) : fs.createReadStream(path);

  return new Promise((resolve, reject) => {
    const uploadOptions = { contentType };
    
    // Add TTL if specified (in minutes)
    if (ttlMinutes) {
      uploadOptions.metadata = {
        expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000)
      };
    }
    
    const upload = bucket.openUploadStream(filename || "file", uploadOptions);
    source.pipe(upload)
      .on("error", reject)
      .on("finish", () => resolve(upload.id));
  });
}

async function uploadCVToGridFS({ buffer, filename, contentType, userId }) {
  const bucket = getCVBucket();
  const source = Readable.from(buffer);
  
  // Set TTL to 30 minutes from now
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  return new Promise((resolve, reject) => {
    const uploadOptions = { 
      contentType,
      metadata: {
        userId: userId,
        expiresAt: expiresAt,
        createdAt: new Date()
      }
    };
    
    const upload = bucket.openUploadStream(filename, uploadOptions);
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

async function deleteCVFromGridFS(id) {
  if (!id) return;
  const bucket = getCVBucket();
  try {
    await bucket.delete(new mongoose.Types.ObjectId(id));
  } catch (_) {}
}

function streamFromGridFS(id) {
  const bucket = getBucket();
  return bucket.openDownloadStream(new mongoose.Types.ObjectId(id));
}

function streamCVFromGridFS(id) {
  const bucket = getCVBucket();
  try {
    console.log(`Opening download stream for GridFS file ID: ${id}`);
    const objectId = new mongoose.Types.ObjectId(id);
    const downloadStream = bucket.openDownloadStream(objectId);
    
    downloadStream.on('error', (error) => {
      console.error(`GridFS download stream error for ID ${id}:`, error);
    });
    
    return downloadStream;
  } catch (error) {
    console.error(`Error creating download stream for ID ${id}:`, error);
    throw error;
  }
}

async function getCVMetadata(id) {
  const bucket = getCVBucket();
  try {
    const files = await bucket.find({ _id: new mongoose.Types.ObjectId(id) }).toArray();
    return files[0] || null;
  } catch (error) {
    console.error('Error getting CV metadata:', error);
    return null;
  }
}

async function setupTTLIndex() {
  const db = mongoose.connection.db;
  try {
    // Create TTL index on cv_files.files.metadata.expiresAt
    await db.collection('cv_files.files').createIndex(
      { 'metadata.expiresAt': 1 },
      { expireAfterSeconds: 0 }
    );
    console.log('TTL index created for CV files');
  } catch (error) {
    console.error('Error creating TTL index:', error);
  }
}

module.exports = { 
  uploadToGridFS, 
  uploadCVToGridFS,
  deleteFromGridFS, 
  deleteCVFromGridFS,
  streamFromGridFS, 
  streamCVFromGridFS,
  getCVMetadata,
  setupTTLIndex,
  getCVBucket
};
