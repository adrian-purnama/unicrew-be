const multer = require("fastify-multer");
const path = require("path");
const fs = require("fs");
const Company = require("../../schema/companySchema");
const { uploadFile, deleteFile } = require("../../helper/googleDrive");
const roleAuth = require("../../helper/roleAuth");

const dotenv = require("dotenv");
dotenv.config();

const profileFolderId = process.env.GDRIVE_FOLDER_COMPANY_PROFILE;
const upload = multer({ dest: "temp/" });

function extractDriveFileId(link) {
  if (!link || typeof link !== "string") return null;
  const match = link.match(/(?:id=|\/d\/)([a-zA-Z0-9_-]{10,})/);
  return match ? match[1] : null;
}

async function companyRoutes(fastify, options) {
  fastify.patch(
    "/profile",
    {
      preHandler: [
        roleAuth(["company"]),
        upload.fields([{ name: "profilePicture", maxCount: 1 }]),
      ],
    },
    async (req, res) => {
      const companyId = req.userId;
      const company = await Company.findById(companyId);
      if (!company) return res.code(404).send({ message: "Company not found" });

      const updates = { ...req.body };
      delete updates.profilePicture;

      const file = req.files?.profilePicture?.[0];
      if (file) {
        const fileIdField = "profilePictureFileId";

        const previousLink = company.profilePicture;
        const previousFileId = extractDriveFileId(previousLink);

        if (previousFileId) {
          try {
            await deleteFile(previousFileId);
          } catch (err) {
            console.warn("Failed to delete old profile picture:", err.message);
          }
        }

        try {
          const uploaded = await uploadFile({
            filePath: file.path,
            fileName: `company-profile-${companyId}`,
            folderId: profileFolderId,
          });

          updates.profilePicture = uploaded.thumbnailLink;
          updates[fileIdField] = uploaded.fileId;
        } catch (err) {
          console.error("Upload failed:", err.message);
        } finally {
          fs.unlink(file.path, () => {});
        }
      }

      await Company.findByIdAndUpdate(companyId, updates, { new: true });

      return res.send({ message: "Company profile updated successfully" });
    }
  );

  fastify.get(
    "/profile",
    {
      preHandler: roleAuth(["company"]),
    },
    async (req, res) => {
      const company = await Company.findById(req.userId).populate(
        "location.provinsi location.kabupaten location.kecamatan industries"
      );

      if (!company) return res.code(404).send({ message: "Company not found" });
      return res.send(company);
    }
  );
}

module.exports = companyRoutes;
