// routes/registerRoutes.js
const { sendVerifyEmail } = require("../../helper/emailHelper");
const { createOtp } = require("../../helper/otpHelper");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
dotenv.config();

const Admin = require("../../schema/adminSchema");
const Company = require("../../schema/companySchema");
const User = require("../../schema/userSchema");

const {
  validateIndustrySelection,
  validateLocationSelection,
  validateUniversitySelection,
  validateStudyProgramSelection,
} = require("../../helper/validationHelper");

const {
  userRegisterDto,
  companyRegisterDto,
  AdminRegisterDto,
} = require("./dto");

const jwtSecret = process.env.JWT_SECRET;
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 10);

// Small helper: don’t let email sending hang forever
const sendWithTimeout = (fn, ms = 8000) =>
  Promise.race([
    fn(),
    new Promise((_, rej) => setTimeout(() => rej(new Error("email-timeout")), ms)),
  ]);

async function registerRoutes(fastify) {
  // ---------- ADMIN REGISTER (no transactions) ----------
  fastify.post("/admin", { schema: AdminRegisterDto }, async (req, res) => {
    const { email, password } = req.body;
    try {
      const lowerEmail = email.toLowerCase().trim();

      const exist = await Admin.findOne({ email: lowerEmail });
      if (exist) return res.code(409).send({ message: "Admin already registered" });

      const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const admin = await Admin.create({ email: lowerEmail, password: hashedPassword });

      try {
        const otp = await createOtp(admin._id);
        await sendWithTimeout(() => sendVerifyEmail(admin.email, otp, "admin"));
      } catch (e) {
        // compensation: remove created admin if email fails
        await Admin.deleteOne({ _id: admin._id }).catch(() => {});
        console.error("[/register/admin] email failed:", e?.message || e);
        return res.code(500).send({ message: "Failed to send verification email." });
      }

      return res
        .code(201)
        .send({ message: "Admin created successfully, please verify email" });
    } catch (err) {
      console.error("[/register/admin] failed:", err?.message || err);
      return res.code(500).send({ message: "Internal server error" });
    }
  });

  // ---------- USER REGISTER (no transactions) ----------
  fastify.post("/user", { schema: userRegisterDto }, async (req, res) => {
    const {
      fullName,
      birthDate,
      email,
      password,
      universityId,
      studyProgramId,
      externalSystemId,
      provinsiId,
      kabupatenId,
      kecamatanId,
      kelurahanId,
      industries,
    } = req.body;

    try {
      if (!email || !password || !fullName || !universityId || !studyProgramId) {
        return res.code(400).send({ message: "Missing required fields." });
      }

      const lowerEmail = email.toLowerCase().trim();
      const exist = await User.findOne({ email: lowerEmail });
      if (exist) return res.code(409).send({ message: "User already registered" });

      // Validate selections
      const { universityId: uniId, university } =
        await validateUniversitySelection(universityId);
      const { studyProgramId: spId, studyProgram } =
        await validateStudyProgramSelection(studyProgramId);
      const locationIds = await validateLocationSelection({
        provinsiId,
        kabupatenId,
        kecamatanId,
        kelurahanId,
      });
      const industryIds = await validateIndustrySelection(industries);

      // birthDate
      let birthDateISO;
      if (birthDate) {
        const d = new Date(birthDate);
        if (Number.isNaN(d.getTime())) {
          return res.code(422).send({ message: "Invalid birth date." });
        }
        birthDateISO = d;
      }

      const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

      // Create user
      const user = await User.create({
        fullName,
        birthDate: birthDateISO,
        email: lowerEmail,
        password: hashedPassword,
        university: uniId,
        studyProgram: spId,
        externalSystemId,
        ...locationIds,
        industries: industryIds?.length ? industryIds : undefined,
        isVerified: false,
      });

      // Create token (pre-verification)
      const token = jwt.sign(
        {
          _id: user._id,
          role: user.role,
          email: user.email,
          name: user.fullName,
          profilePicture: user.profilePicture,
        },
        jwtSecret,
        { expiresIn: "7d" }
      );

      // Send email; if fails, delete the user
      try {
        const otp = await createOtp(user._id);
        await sendWithTimeout(() => sendVerifyEmail(user.email, otp, "user"));
      } catch (e) {
        await User.deleteOne({ _id: user._id }).catch(() => {});
        console.error("[/register/user] email failed:", e?.message || e);
        return res.code(500).send({ message: "Failed to send verification email." });
      }

      let daysRemaining;
      if (user.expiresAt instanceof Date) {
        daysRemaining = Math.max(
          0,
          Math.floor((user.expiresAt - new Date()) / (1000 * 60 * 60 * 24))
        );
      }

      return res.code(201).send({
        message: "User created successfully, please verify email",
        token,
        user: {
          id: user._id,
          name: user.fullName,
          email: user.email,
          role: user.role,
          profilePicture: user.profilePicture,
          isVerified: user.isVerified,
          isProfileComplete: false,
          university: { id: university._id, name: university.name },
          studyProgram: { id: studyProgram._id, name: studyProgram.name },
        },
        emailVerification: {
          required: true,
          expiresAt: user.expiresAt,
          daysRemaining,
        },
      });
    } catch (err) {
      if (err && typeof err.message === "string" && /does not|belong|Invalid/i.test(err.message)) {
        return res.code(422).send({ message: err.message });
      }
      console.error("[/register/user] failed:", err?.message || err);
      return res.code(500).send({ message: "Internal server error" });
    }
  });

  // ---------- COMPANY REGISTER (no transactions) ----------
  fastify.post("/company", { schema: companyRegisterDto }, async (req, res) => {
    const {
      companyName,
      industries,
      description,
      location,
      socialLinks,
      email,
      password,
    } = req.body;

    try {
      const lowerEmail = (email || "").toLowerCase().trim();
      const exist = await Company.findOne({ email: lowerEmail });
      if (exist) return res.code(409).send({ message: "Company already registered" });

      const industryIds = await validateIndustrySelection(industries);
      const locInput = location && typeof location === "object" ? location : {};
      const locationIds = await validateLocationSelection({
        provinsiId: locInput.provinsiId,
        kabupatenId: locInput.kabupatenId,
        kecamatanId: locInput.kecamatanId,
        kelurahanId: locInput.kelurahanId,
      });

      const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

      const company = await Company.create({
        companyName,
        industries: industryIds,
        description,
        ...locationIds,
        socialLinks,
        email: lowerEmail,
        password: hashedPassword,
        isVerified: false,
      });

      try {
        const otp = await createOtp(company._id);
        await sendWithTimeout(() => sendVerifyEmail(company.email, otp, "company"));
      } catch (e) {
        await Company.deleteOne({ _id: company._id }).catch(() => {});
        console.error("[/register/company] email failed:", e?.message || e);
        return res.code(500).send({ message: "Failed to send verification email." });
      }

      return res.code(201).send({ message: "Company registered, please verify email" });
    } catch (err) {
      if (err && typeof err.message === "string" && /does not|belong|Invalid/i.test(err.message)) {
        return res.code(422).send({ message: err.message });
      }
      console.error("[/register/company] failed:", err?.message || err);
      return res.code(500).send({ message: "Internal server error" });
    }
  });
}

module.exports = registerRoutes;
