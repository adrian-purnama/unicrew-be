const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");

const User = require("../../schema/userSchema");
const Admin = require("../../schema/adminSchema");
const Company = require("../../schema/companySchema");
const { LoginDto } = require("./dto");

dotenv.config();
const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
  throw new Error("JWT_SECRET environment variable is not set. Please configure it in your .env file.");
}

const roleModelMap = {
  user: User,
  admin: Admin,
  company: Company,
};

function loginRoutes(fastify, options) {
  fastify.post(
    "/login",
    {
      schema: LoginDto,
      // Per-route rate limit: throttle brute force per email+IP
      config: {
        rateLimit: {
          max: 5,
          timeWindow: 600000, // 10 minutes
          hook: 'preHandler',
          keyGenerator: (req) => {
            try {
              const lower = String(req.body?.email || '')
                .trim()
                .toLowerCase();
              return lower ? `login:${lower}:${req.ip}` : `login:${req.ip}`;
            } catch (_) {
              return `login:${req.ip}`;
            }
          },
        },
      },
    },
    async (req, res) => {
      const { email, password, role } = req.body;

    try {
      const lowerEmail = String(email || "")
        .trim()
        .toLowerCase();
      if (!lowerEmail || lowerEmail.length > 50) {
        return res.code(422).send({ message: "Invalid email." });
      }

      const Model = roleModelMap[role];

      if (!Model) return res.code(400).send({ message: "Invalid role" });

      const user = await Model.findOne({ email: lowerEmail });
      // Use generic error to avoid account enumeration
      if (!user) return res.code(401).send({ message: "Invalid email or password" });

      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid)
        return res.code(401).send({ message: "Invalid email or password" });

      // Only after a successful password check, enforce admin verification
      if (user.role === "admin" && user.isVerified === false) {
        return res.code(401).send({ message: "Admin unverified" });
      }

      const token = jwt.sign(
        {
          _id: user._id,
          role,
          email: user.email,
          name: user.fullName || user.companyName,
          profilePicture: user.profilePicture,
        },
        jwtSecret,
        { expiresIn: "7d" }
      );

      return res.code(200).send({
        message: "Login successful",
        token,
      });
    } catch (err) {
      console.error(err);
      return res.code(500).send({ message: "Internal server error" });
    }
  }
  );
}

module.exports = loginRoutes;
