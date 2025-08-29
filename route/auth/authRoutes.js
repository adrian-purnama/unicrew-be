const Admin = require("../../schema/adminSchema");
const User = require("../../schema/userSchema");
const Company = require("../../schema/companySchema");
const { verifyEmailDto, emailRoleDto } = require("./dto");
const { validateOtp, createOtp } = require("../../helper/otpHelper");
const dotenv = require("dotenv");

const jwt = require("jsonwebtoken");
const { isUserProfileComplete } = require("../../helper/userHelper");
const {
  sendVerifyEmail,
  sendForgotPasswordEmail,
} = require("../../helper/emailHelper");
const { roleAuth } = require("../../helper/roleAuth");
const { verifyAndBuildAssetLink } = require("../../helper/assetAuth");

dotenv.config();
const jwtSecret = process.env.JWT_SECRET;
// const dotenv = require("dotenv");
// dotenv.config();
// const salt = process.env.SALT || 10
// const jwtSecret = process.env.JWT_SECRET;
// const salt = 10;

async function authRoutes(fastify, option) {
  fastify.post("/verify", { schema: verifyEmailDto }, async (req, res) => {
    const { email, otp, role } = req.body;

    try {
      let Model;
      if (role === "admin") Model = Admin;
      else if (role === "user") Model = User;
      else if (role === "company") Model = Company;
      else return res.code(400).send({ message: "Invalid role" });

      const exist = await Model.findOne({ email });
      if (!exist) {
        return res.code(404).send({ message: "Account not found" });
      }

      const isOtpVerified = await validateOtp(exist._id, otp);
      if (!isOtpVerified) {
        return res.code(401).send({ message: "Invalid or expired OTP" });
      }

      exist.isVerified = true;
      await exist.save();

      const token = jwt.sign(
        {
          _id: exist._id,
          role,
          name: exist.fullName || exist.companyName || "Admin",
          profilePicture: exist.profilePicture,
        },
        jwtSecret,
        { expiresIn: "7d" }
      );

      return res.send({
        message: "Email successfully verified",
        token,
      });
    } catch (err) {
      console.error(err);
      return res
        .code(500)
        .send({ message: "Internal server error", error: err.message });
    }
  });

  fastify.get(
    "/authenticate",
    { preHandler: roleAuth(["user", "admin", "company"]) },
    async (req, res) => {
      const { userId, userRole, user } = req;

      let profileStatus = {};
      if (userRole === "user") {
        profileStatus = isUserProfileComplete(user);
      }

      console.log(`authenticated as ${userRole}`);

      const DEFAULT_AVATAR =
        "https://cdn.vectorstock.com/i/500p/58/15/male-silhouette-profile-picture-vector-35845815.jpg";

      let profilePictureUrl = DEFAULT_AVATAR;

      // If we have a profilePicture (ObjectId ref to Asset), build a 5-minute public link
      if (user?.profilePicture) {
        try {
          const { url } = await verifyAndBuildAssetLink({
            req,
            assetId: user.profilePicture, // Asset _id
            ttlSeconds: 300, // 5 minutes
            reuse: true, // reuse valid existing session
          });
          if (url) profilePictureUrl = url; // e.g. /assets/session/<sid> or /assets/<id> if public
        } catch (e) {
          // keep default avatar on any error
        }
      } else if (
        typeof user?.profilePicture === "string" &&
        user.profilePicture.startsWith("http")
      ) {
        // If your data still has a legacy URL string, keep using it
        profilePictureUrl = user.profilePicture;
      }

      return res.code(200).send({
        _id: userId,
        name: user.fullName || user.companyName || "Admin",
        profilePicture: profilePictureUrl, // <-- always a ready-to-use URL
        role: userRole,
        ...profileStatus,
      });
    }
  );

  fastify.post("/reverify", async (req, res) => {
    let email, role;

    // Method 1: From JWT token
    if (req.body.token) {
      try {
        const decoded = jwt.verify(req.body.token, jwtSecret);
        console.log(decoded);
        email = decoded.email;
        role = decoded.role;

        if (!email || !role) {
          return res.code(400).send({ message: "Invalid token payload" });
        }
      } catch (err) {
        return res.code(401).send({ message: "Invalid or expired token" });
      }
    }

    // Method 2: From email + role directly
    else if (req.body.email && req.body.role) {
      email = req.body.email.toLowerCase().trim();
      role = req.body.role;
    } else {
      return res
        .code(400)
        .send({ message: "Provide token or { email, role }" });
    }

    try {
      let user;
      if (role === "user") user = await User.findOne({ email });
      else if (role === "admin") user = await Admin.findOne({ email });
      else if (role === "company") user = await Company.findOne({ email });
      else return res.code(400).send({ message: "Invalid role" });

      if (!user) return res.code(404).send({ message: "Account not found" });
      if (user.isVerified)
        return res.code(200).send({ message: "Already verified" });

      const otp = await createOtp(user._id);
      await sendVerifyEmail(user.email, otp, role);

      return res
        .code(200)
        .send({ message: "Verification email resent successfully" });
    } catch (err) {
      console.error("❌ Reverify error:", err);
      return res.code(500).send({ message: "Internal server error" });
    }
  });

  fastify.post("/forgot-password", async (req, res) => {
    const { email, role } = req.body;
    console.log(email.role);

    if (!email || !role) {
      return res.code(400).send({ message: "Email and role are required." });
    }

    try {
      let user;

      if (role === "user") {
        user = await User.findOne({ email });
      } else if (role === "admin") {
        user = await Admin.findOne({ email });
      } else if (role === "company") {
        user = await Company.findOne({ email });
      } else {
        return res.code(400).send({ message: "Invalid role." });
      }

      if (!user) {
        return res.code(404).send({ message: "Account not found." });
      }

      const token = await createOtp(user._id); // reuse your OTP/token function
      await sendForgotPasswordEmail(email, token, role);

      return res.code(200).send({ message: "Reset email sent." });
    } catch (err) {
      console.error("Forgot password error:", err);
      return res.code(500).send({ message: "Internal server error." });
    }
  });

  fastify.post("/reset-password", async (req, res) => {
    const { email, role, token, newPassword } = req.body;

    if (!email || !role || !token || !newPassword) {
      return res.code(400).send({ message: "Missing required fields." });
    }

    try {
      const valid = await validateOtp(email, token); // your token validation logic
      if (!valid)
        return res.code(400).send({ message: "Invalid or expired token." });

      let user;
      if (role === "user") {
        user = await User.findOne({ email });
      } else if (role === "admin") {
        user = await Admin.findOne({ email });
      } else if (role === "company") {
        user = await Company.findOne({ email });
      } else {
        return res.code(400).send({ message: "Invalid role." });
      }

      if (!user) {
        return res.code(404).send({ message: "Account not found." });
      }

      user.password = newPassword;
      await user.save();

      return res.code(200).send({ message: "Password has been reset." });
    } catch (err) {
      console.error("Reset password error:", err);
      return res.code(500).send({ message: "Internal server error." });
    }
  });
}

module.exports = authRoutes;
