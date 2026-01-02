const Admin = require("../../schema/adminSchema");
const User = require("../../schema/userSchema");
const Company = require("../../schema/companySchema");
const { validateOtp, createOtp } = require("../../helper/otpHelper");
const dotenv = require("dotenv");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { isUserProfileComplete } = require("../../helper/userHelper");
const {
  sendVerifyEmail,
  sendForgotPasswordEmail,
  sendAdminVerifiedEmail,
} = require("../../helper/emailHelper");
const { roleAuth } = require("../../helper/roleAuth");
const { verifyAndBuildAssetLink } = require("../../helper/assetAuth");
const {
  VerifyEmailDto,
  ResetPasswordDto,
  ForgotPasswordDto,
  ReverifyDto,
} = require("./dto");
// rate-limit is registered globally in index.js; per-route config is set via route `config.rateLimit`.

dotenv.config();
const jwtSecret = process.env.JWT_SECRET;
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 10;

if (!jwtSecret) {
  throw new Error("JWT_SECRET environment variable is not set. Please configure it in your .env file.");
}
// const dotenv = require("dotenv");
// dotenv.config();
// const salt = process.env.SALT || 10
// const jwtSecret = process.env.JWT_SECRET;
// const salt = 10;

async function authRoutes(fastify, option) {
  fastify.post("/verify", {
    schema: VerifyEmailDto,
    config: {
      // Limit OTP attempts per email
      rateLimit: {
        max: 5,
        timeWindow: 600000, // 10 minutes
        hook: 'preHandler',
        keyGenerator: (req) => {
          try {
            const email = String(req.body?.email || '').toLowerCase().trim();
            return email ? `verify:${email}` : req.ip;
          } catch (_) {
            return req.ip;
          }
        },
      },
    },
  }, async (req, res) => {
    const { email, otp, role } = req.body;

    try {
      const lowerEmail = String(email || "")
        .trim()
        .toLowerCase();
      if (!lowerEmail || lowerEmail.length > 50) {
        return res.code(422).send({ message: "Invalid email." });
      }

      let Model;
      if (role === "admin") Model = Admin;
      else if (role === "user") Model = User;
      else if (role === "company") Model = Company;
      else return res.code(400).send({ message: "Invalid role" });

      const exist = await Model.findOne({ email: lowerEmail });
      if (!exist) {
        return res.code(404).send({ message: "Account not found" });
      }

      const isOtpVerified = await validateOtp(exist._id, otp);
      if (!isOtpVerified) {
        return res.code(422).send({ message: "Invalid or expired OTP" });
      }

      exist.isVerified = true;
      await exist.save();

      if (role === "admin") {
        try {
          await sendAdminVerifiedEmail(email);
        } catch (e) {
          console.error("Failed to send admin verified email:", e.message);
        }
      }

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

      const DEFAULT_AVATAR =
        "https://cdn.vectorstock.com/i/500p/58/15/male-silhouette-profile-picture-vector-35845815.jpg";

      let profilePictureUrl = DEFAULT_AVATAR;

      // avoid logging full user objects

      if (user?.profilePicture) {
        try {
          const { url } = await verifyAndBuildAssetLink({
            req,
            assetId: user.profilePicture,
            ttlSeconds: 300,
            reuse: true,
          });
          if (url) profilePictureUrl = url;
        } catch (e) {
          console.log(e);
        }
      } else if (
        typeof user?.profilePicture === "string" &&
        user.profilePicture.startsWith("http")
      ) {
        profilePictureUrl = user.profilePicture;
      }

      return res.code(200).send({
        _id: userId,
        role: userRole,
        name: user.fullName || user.companyName || "Admin",
        profilePicture: profilePictureUrl,
        ...profileStatus,
      });
    }
  );

  // Per-route rate limit: 1 request per 2 minutes (keyed by email if provided)
  fastify.post("/reverify", {
    schema: ReverifyDto,
    config: {
      rateLimit: {
        max: 1,
        timeWindow: 120000, // 2 minutes
        hook: 'preHandler', // ensure req.body is available for keying
        keyGenerator: (req) => {
          try {
            // Prefer email in body; if a token is provided, decode to extract email
            if (req.body?.email) {
              const email = String(req.body.email).toLowerCase().trim();
              if (email) return `reverify:${email}`;
            }
            if (req.body?.token) {
              try {
                const decoded = jwt.verify(req.body.token, jwtSecret);
                const email = String(decoded?.email || '').toLowerCase().trim();
                if (email) return `reverify:${email}`;
              } catch (_) {}
            }
            return req.ip;
          } catch (_) {
            return req.ip;
          }
        },
      },
    },
  }, async (req, res) => {
    let email, role;

    // Method 1: From JWT token
    if (req.body.token) {
      try {
        const decoded = jwt.verify(req.body.token, jwtSecret);
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
      const lowerEmail = String(email || "")
        .trim()
        .toLowerCase();
      if (!lowerEmail || lowerEmail.length > 50) {
        return res.code(422).send({ message: "Invalid email." });
      }

      let user;
      if (role === "user") user = await User.findOne({ email: lowerEmail });
      else if (role === "admin") user = await Admin.findOne({ email: lowerEmail });
      else if (role === "company") user = await Company.findOne({ email: lowerEmail });
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

  fastify.post(
    "/forgot-password",
    {
      schema: ForgotPasswordDto,
      config: {
        rateLimit: {
          max: 1,
          timeWindow: 120000, // 2 minutes
          hook: 'preHandler',
          keyGenerator: (req) => {
            try {
              const email = (req.body && req.body.email)
                ? String(req.body.email).toLowerCase().trim()
                : null;
              return email ? `forgot:${email}` : req.ip;
            } catch (e) {
              return req.ip;
            }
          },
        },
      },
    },
    async (req, res) => {
      const { email, role } = req.body;

      if (!email || !role) {
        return res.code(400).send({ message: "Email and role are required." });
      }

      try {
        const lowerEmail = String(email || "")
          .trim()
          .toLowerCase();
        if (!lowerEmail || lowerEmail.length > 50) {
          return res.code(422).send({ message: "Invalid email." });
        }

        let user;

        if (role === "user") {
          user = await User.findOne({ email: lowerEmail });
        } else if (role === "admin") {
          user = await Admin.findOne({ email: lowerEmail });
        } else if (role === "company") {
          user = await Company.findOne({ email: lowerEmail });
        } else {
          return res.code(400).send({ message: "Invalid role." });
        }

        console.log(user)

        if (!user) {
          return res.code(404).send({ message: "Account not found." });
        }

        const token = await createOtp(user._id);
        await sendForgotPasswordEmail(email, token, role);

        return res.code(200).send({ message: "Reset email sent." });
      } catch (err) {
        console.error("Forgot password error:", err);
        return res.code(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.post(
    "/reset-password",
    { 
      schema: ResetPasswordDto,
      config: {
        rateLimit: {
          max: 3,
          timeWindow: 600000, // 10 minutes
          hook: 'preHandler',
          keyGenerator: (req) => {
            try {
              const email = String(req.body?.email || '').toLowerCase().trim();
              return email ? `reset:${email}` : req.ip;
            } catch (_) {
              return req.ip;
            }
          },
        },
      },
    },
    async (req, res) => {
      const { email, role, token, newPassword } = req.body;

      if (!email || !role || !token || !newPassword) {
        return res.code(400).send({ message: "Missing required fields." });
      }

      try {
        const lowerEmail = String(email || "")
          .trim()
          .toLowerCase();
        if (!lowerEmail || lowerEmail.length > 50) {
          return res.code(422).send({ message: "Invalid email." });
        }

        let user;
        if (role === "user") {
          user = await User.findOne({ email: lowerEmail });
        } else if (role === "admin") {
          user = await Admin.findOne({ email: lowerEmail });
        } else if (role === "company") {
          user = await Company.findOne({ email: lowerEmail });
        } else {
          return res.code(400).send({ message: "Invalid role." });
        }

        if (!user) {
          return res.code(404).send({ message: "Account not found." });
        }

                const valid = await validateOtp(user._id, token);
        if (!valid)
          return res.code(400).send({ message: "Invalid or expired token." });

        const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
        user.password = hash;
        await user.save();

        return res.code(200).send({ message: "Password has been reset." });
      } catch (err) {
        console.error("Reset password error:", err);
        return res.code(500).send({ message: "Internal server error." });
      }
    }
  );
}

module.exports = authRoutes;
