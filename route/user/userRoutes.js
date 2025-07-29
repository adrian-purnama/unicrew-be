const multer = require("fastify-multer");
const path = require("path");
const fs = require("fs");
const User = require("../../schema/userSchema");
const { uploadFile, deleteFile } = require("../../helper/googleDrive");
const roleAuth = require("../../helper/roleAuth");

const dotenv = require("dotenv");
const { isUserProfileComplete } = require("../../helper/userHelper");
const { userProfileDto } = require("./dto");
dotenv.config();

const profileFolderId = process.env.GDRIVE_FOLDER_PROFILE;
const cvFolderId = process.env.GDRIVE_FOLDER_CV;
const portfolioFolderId = process.env.GDRIVE_FOLDER_PORTFOLIO;

const upload = multer({ dest: "temp/" });

function extractDriveFileId(link) {
  if (!link || typeof link !== 'string') return null;
  const match = link.match(/(?:id=|\/d\/)([a-zA-Z0-9_-]{10,})/);
  return match ? match[1] : null;
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
        async (req, res) => {
            const userId = req.userId;
            const user = await User.findById(userId);
            if (!user) return res.code(404).send({ message: "User not found" });

            const updates = { ...req.body };

            ["profilePicture", "cv", "portfolio"].forEach((f) => delete updates[f]);

            if (updates.skills) {
                if (typeof updates.skills === "string") {
                    updates.skills = [updates.skills];
                } else if (Array.isArray(updates.skills)) {
                    updates.skills = updates.skills.flat().map(String);
                } else {
                    updates.skills = [];
                }
            }

            const handleUpload = async (field, label, folderId, dbField) => {
                const file = req.files?.[field]?.[0];
                if (!file) return;

                console.log(`📥 Upload received: ${label}`);
                console.log({
                    user: userId,
                    field,
                    originalName: file.originalname,
                    mimeType: file.mimetype,
                    size: file.size,
                    path: file.path,
                });

                const fileIdField = `${field}FileId`;
                const dbTargetField = dbField || (field === "cv" ? "curriculumVitae" : field);
                console.log(dbTargetField);
                // 🔁 Extract ID from existing stored link and delete it
                const previousLink = user[dbTargetField];
                console.log(previousLink);
                const previousFileId = extractDriveFileId(previousLink);
                console.log(previousFileId);

                if (previousFileId) {
                    try {
                        await deleteFile(previousFileId);
                        console.log(`🗑️ Deleted previous ${label}: ${previousFileId}`);
                    } catch (err) {
                        console.warn(`❗ Failed to delete old ${label}:`, err.message);
                    }
                }

                try {
                    const uploaded = await uploadFile({
                        filePath: file.path,
                        fileName: `${label}-${user._id}`,
                        folderId,
                    });

                    // Use thumbnail for profile picture
                    if (field === "profilePicture") {
                        updates[dbTargetField] = uploaded.thumbnailLink;
                    } else {
                        updates[dbTargetField] = uploaded.webViewLink;
                    }

                    updates[fileIdField] = uploaded.fileId;
                    console.log(`✅ ${label} uploaded: ${updates[dbTargetField]}`);
                } catch (err) {
                    console.error(`❌ Failed to upload ${label}:`, err.message);
                } finally {
                    fs.unlink(file.path, () => {});
                }
            };

            await Promise.all([
                handleUpload("profilePicture", "profile", profileFolderId),
                handleUpload("cv", "cv", cvFolderId, "curriculumVitae"),
                handleUpload("portfolio", "portfolio", portfolioFolderId),
            ]);

            await User.findByIdAndUpdate(userId, updates, { new: true });

            return res.code(200).send({ message: "Profile updated successfully" });
        }
    );

    fastify.get("/profile-check", { preHandler: roleAuth(["user"]) }, async (req, res) => {
        try {
            const user = req.user;
            const result = isUserProfileComplete(user);
            console.log(result)

            return res.code(200).send(result);
        } catch (err) {
            console.error("Error checking profile completeness:", err);
            return res.code(500).send({ message: "Internal server error" });
        }
    });

    fastify.get(
        "/profile",
        {
            preHandler: roleAuth(["user", "admin"]),
        },
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

            return res.send(userObj);
        }
    );
}

module.exports = userRoutes;
