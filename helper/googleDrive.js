const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
const dotenv = require('dotenv');

dotenv.config();

const KEYFILE_PATH = path.join(__dirname, '../unicru-4e3bd76c46b9.json');

const auth = new google.auth.GoogleAuth({
  keyFile: KEYFILE_PATH,
  scopes: ['https://www.googleapis.com/auth/drive'],
});

const driveService = google.drive({ version: 'v3', auth });

async function uploadFile({ filePath, fileName, folderId }) {
  try {
    const mimeType = mime.lookup(filePath) || 'application/octet-stream';

    const fileMetadata = {
      name: fileName,
      parents: [folderId], // 👈 Use the passed folder ID here
    };

    const media = {
      mimeType,
      body: fs.createReadStream(filePath),
    };

    const file = await driveService.files.create({
      requestBody: fileMetadata,
      media,
      fields: 'id',
    });

    const fileId = file.data.id;

    await driveService.permissions.create({
      fileId,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });

    fs.unlink(filePath, (err) => {
      if (err) {
        console.warn(`❌ Failed to delete local file: ${filePath}`, err.message);
      } else {
        console.log(`🗑️ Deleted local file: ${filePath}`);
      }
    });

    console.log(`✅ Uploaded to Drive: ${fileName} (${fileId})`);

    return {
      fileId,
      webViewLink: `https://drive.google.com/file/d/${fileId}/view`,
      thumbnailLink: `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`,
    };
  } catch (err) {
    console.error('❌ Failed to upload to Google Drive:', err.response?.data?.error || err.message);
    throw err;
  }
}

async function deleteFile(fileId) {
  try {
    await driveService.files.delete({ fileId });
    console.log(`🗑️ Deleted from Drive: ${fileId}`);
  } catch (err) {
    console.error(`❌ Failed to delete file ${fileId}:`, err.response?.data?.error || err.message);
    throw err;
  }
}

module.exports = { uploadFile, deleteFile };
