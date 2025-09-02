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
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error("email-timeout")), ms)
    ),
  ]);

async function registerRoutes(fastify) {
  // ---------- ADMIN REGISTER (no transactions) ----------
  fastify.post("/admin", { schema: AdminRegisterDto }, async (req, res) => {
    const { email, password } = req.body;
    try {
      const lowerEmail = email.toLowerCase().trim();

      const exist = await Admin.findOne({ email: lowerEmail });
      if (exist)
        return res.code(409).send({ message: "Admin already registered" });

      const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const admin = await Admin.create({
        email: lowerEmail,
        password: hashedPassword,
      });

      try {
        const otp = await createOtp(admin._id);
        await sendWithTimeout(() => sendVerifyEmail(admin.email, otp, "admin"));
      } catch (e) {
        await Admin.deleteOne({ _id: admin._id }).catch(() => {});
        console.error("[/register/admin] email failed:", e?.message || e);
        return res
          .code(500)
          .send({ message: "Failed to send verification email." });
      }

      return res
        .code(201)
        .send({ message: "Admin created successfully, please verify email" });
    } catch (err) {
      console.error("[/register/admin] failed:", err?.message || err);
      return res.code(500).send({ message: "Internal server error" });
    }
  });

  // ---------- USER REGISTER ----------
    // TODO chech front end max car email 50 and ends with ac.id or .edu
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
    } = req.body;

    try {
      //check
      if (
        !email ||
        !password ||
        !fullName ||
        !universityId ||
        !studyProgramId
      ) {
        return res.code(400).send({ message: "Missing required fields." });
      }

      // check email
      const lowerEmail = email.toLowerCase().trim();
      if (!lowerEmail || lowerEmail.length > 50) {
        return res.code(422).send({ message: "Invalid email." });
      }
      const academicEmailRe =
        /^(?!.*\.\.)[A-Za-z0-9](?:[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{0,62}[A-Za-z0-9])?@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+(?:ac\.id|edu)$/i;

      if (!academicEmailRe.test(lowerEmail)) {
        return res.code(422).send({
          message: "Email must be valid and end with .ac.id or .edu.",
        });
      }

      const lowerFullName = fullName.toLowerCase().trim();
      const exist = await User.findOne({ email: lowerEmail });
      if (exist)
        return res.code(409).send({ message: "User already registered" });

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

      // birthDate parse
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
        lowerFullName,
        birthDate: birthDateISO,
        email: lowerEmail,
        password: hashedPassword,
        university: uniId,
        studyProgram: spId,
        externalSystemId,
        ...locationIds,
        isVerified: false,
      });

      // Create token
      const token = jwt.sign(
        {
          _id: user._id,
          role: user.role,
          email: user.email,
          name: user.fullName,
          profilePicture: user.profilePicture,
        },
        jwtSecret,
        { expiresIn: "1d" }
      );

      // Send email; if fails, delete the user
      try {
        const otp = await createOtp(user._id);
        await sendWithTimeout(() => sendVerifyEmail(user.email, otp, "user"));
      } catch (e) {
        await User.deleteOne({ _id: user._id }).catch(() => {});
        console.error("[/register/user] email failed:", e?.message || e);
        return res
          .code(500)
          .send({ message: "Failed to send verification email." });
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
      if (
        err &&
        typeof err.message === "string" &&
        /does not|belong|Invalid/i.test(err.message)
      ) {
        return res.code(422).send({ message: err.message });
      }
      console.error("[/register/user] failed:", err?.message || err);
      return res.code(500).send({ message: "Internal server error" });
    }
  });

  // ---------- COMPANY REGISTER (no transactions) ----------
  // TODO chekc front end max car des 200 and email 50
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
      // lower name and check email
      const lowerCompanyName = companyName.toLowerCase().trim();
      const lowerEmail = (email || "").toLowerCase().trim();
      if (!lowerEmail || lowerEmail.length > 50) {
        return res.code(422).send({ message: "Invalid email." });
      }
      if (!description || description.length > 200) {
        return res.code(422).send({ message: "Invalid Description." });
      }

      const exist = await Company.findOne({ email: lowerEmail });
      if (exist)
        return res.code(409).send({ message: "Company already registered" });

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
        lowerCompanyName,
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
        await sendWithTimeout(() =>
          sendVerifyEmail(company.email, otp, "company")
        );
      } catch (e) {
        await Company.deleteOne({ _id: company._id }).catch(() => {});
        console.error("[/register/company] email failed:", e?.message || e);
        return res
          .code(500)
          .send({ message: "Failed to send verification email." });
      }

      return res
        .code(201)
        .send({ message: "Company registered, please verify email" });
    } catch (err) {
      if (
        err &&
        typeof err.message === "string" &&
        /does not|belong|Invalid/i.test(err.message)
      ) {
        return res.code(422).send({ message: err.message });
      }
      console.error("[/register/company] failed:", err?.message || err);
      return res.code(500).send({ message: "Internal server error" });
    }
  });
}

module.exports = registerRoutes;
