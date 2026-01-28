// routes/registerRoutes.js
const { sendVerifyEmail, sendAdminApprovalEmail } = require("../../helper/emailHelper");
const { createOtp, createOtpForEmail, validateOtpByEmail } = require("../../helper/otpHelper");
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
  UserRegisterDto,
  CompanyRegisterDto,
  AdminRegisterDto,
  SendVerificationCodeDto,
  VerifyEmailCodeDto,
} = require("./dto");

const jwtSecret = process.env.JWT_SECRET;
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 10;
const GMAIL_MASTER = process.env.GMAIL_MASTER

// Small helper: don’t let email sending hang forever
const sendWithTimeout = (fn, ms = 8000) =>
  Promise.race([
    fn(),
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error("email-timeout")), ms)
    ),
  ]);

async function registerRoutes(fastify) {
  // ---------- PRE-REGISTRATION EMAIL VERIFICATION ----------
  
  // Send verification code to email (before registration)
  fastify.post(
    "/send-verification-code",
    {
      schema: SendVerificationCodeDto,
      config: {
        rateLimit: {
          max: 3,
          timeWindow: 120000, // 2 minutes
          hook: 'preHandler',
          keyGenerator: (req) => {
            try {
              const email = String(req.body?.email || '').toLowerCase().trim();
              return email ? `send-code:${email}` : req.ip;
            } catch (_) {
              return req.ip;
            }
          },
        },
      },
    },
    async (req, res) => {
      console.log('[DEBUG] /register/send-verification-code - Handler entry:', { email: req.body?.email, role: req.body?.role });
      const { email, role } = req.body;

      try {
        const lowerEmail = email.toLowerCase().trim();
        console.log('[DEBUG] After email normalization:', { lowerEmail, length: lowerEmail.length });
        
        // Validate email format
        if (!lowerEmail || lowerEmail.length > 50) {
          console.log('[DEBUG] Email validation failed:', { lowerEmail, length: lowerEmail?.length });
          return res.code(422).send({ message: "Invalid email." });
        }

        // For user registration, validate academic email
        if (role === "user") {
          console.log('[DEBUG] Validating academic email:', { lowerEmail, role });
          const academicEmailRe =
            /^(?!.*\.\.)[A-Za-z0-9](?:[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{0,62}[A-Za-z0-9])?@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+(?:ac\.id|edu)$/i;
          if (!academicEmailRe.test(lowerEmail)) {
            console.log('[DEBUG] Academic email validation failed:', { lowerEmail });
            return res.code(422).send({
              message: "Email must be valid and end with .ac.id or .edu.",
            });
          }
        }

        // Check if email is already registered
        let Model;
        if (role === "user") Model = User;
        else if (role === "company") Model = Company;
        else {
          console.log('[DEBUG] Invalid role:', { role });
          return res.code(400).send({ message: "Invalid role" });
        }

        console.log('[DEBUG] Before database check:', { lowerEmail, role, model: role === 'user' ? 'User' : 'Company' });
        const exist = await Model.findOne({ email: lowerEmail });
        console.log('[DEBUG] After database check:', { exists: !!exist });
        if (exist) {
          return res.code(409).send({ message: `${role === "user" ? "User" : "Company"} already registered` });
        }

        // Generate and send OTP
        console.log('[DEBUG] Before OTP generation:', { lowerEmail, role });
        const otp = await createOtpForEmail(lowerEmail, role);
        console.log('[DEBUG] After OTP generation:', { otp: otp?.substring(0, 2) + '****' });
        
        console.log('[DEBUG] Before email send:', { lowerEmail, role });
        await sendWithTimeout(() => sendVerifyEmail(lowerEmail, otp, role, true));
        console.log('[DEBUG] After email send success:', { lowerEmail });

        return res.code(200).send({
          message: "Verification code sent to your email",
        });
      } catch (err) {
        console.log('[DEBUG] Error caught:', { error: err?.message, stack: err?.stack?.substring(0, 200), name: err?.name });
        console.error("[/register/send-verification-code] failed:", err?.message || err);
        return res.code(500).send({ message: "Failed to send verification code" });
      }
    }
  );

  // Verify email code (before registration)
  fastify.post(
    "/verify-email-code",
    {
      schema: VerifyEmailCodeDto,
      config: {
        rateLimit: {
          max: 5,
          timeWindow: 600000, // 10 minutes
          hook: 'preHandler',
          keyGenerator: (req) => {
            try {
              const email = String(req.body?.email || '').toLowerCase().trim();
              return email ? `verify-code:${email}` : req.ip;
            } catch (_) {
              return req.ip;
            }
          },
        },
      },
    },
    async (req, res) => {
      const { email, role, otp } = req.body;

      try {
        const lowerEmail = email.toLowerCase().trim();
        
        if (!lowerEmail || lowerEmail.length > 50) {
          return res.code(422).send({ message: "Invalid email." });
        }

        // Validate OTP
        const isValid = await validateOtpByEmail(lowerEmail, role, otp);
        if (!isValid) {
          return res.code(422).send({ message: "Invalid or expired verification code" });
        }

        // Generate a temporary verification token (expires in 15 minutes)
        const verificationToken = jwt.sign(
          {
            email: lowerEmail,
            role: role,
            purpose: "email-verification",
          },
          jwtSecret,
          { expiresIn: "15m" }
        );

        return res.code(200).send({
          message: "Email verified successfully",
          verificationToken,
        });
      } catch (err) {
        console.error("[/register/verify-email-code] failed:", err?.message || err);
        return res.code(500).send({ message: "Internal server error" });
      }
    }
  );

  // ---------- ADMIN REGISTER (no transactions) ----------
  fastify.post(
    "/admin",
    {
      schema: AdminRegisterDto,
      config: {
        rateLimit: {
          max: 3,
          timeWindow: 120000, // 2 minutes
          hook: 'preHandler',
          keyGenerator: (req) => {
            try {
              const email = String(req.body?.email || '').toLowerCase().trim();
              return email ? `register-admin:${email}` : req.ip;
            } catch (_) {
              return req.ip;
            }
          },
        },
      },
    },
    async (req, res) => {
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
        await sendWithTimeout(() => sendAdminApprovalEmail(admin.email, otp, GMAIL_MASTER));
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
      if (err && err.code === 11000) {
        return res.code(409).send({ message: "Admin already registered" });
      }
      console.error("[/register/admin] failed:", err?.message || err);
      return res.code(500).send({ message: "Internal server error" });
    }
  }
  );

  // ---------- USER REGISTER ----------
    // TODO chech front end max car email 50 and ends with ac.id or .edu
  fastify.post(
    "/user",
    {
      schema: UserRegisterDto,
      config: {
        rateLimit: {
          max: 3,
          timeWindow: 120000,
          hook: 'preHandler',
          keyGenerator: (req) => {
            try {
              const email = String(req.body?.email || '').toLowerCase().trim();
              return email ? `register-user:${email}` : req.ip;
            } catch (_) {
              return req.ip;
            }
          },
        },
      },
    },
    async (req, res) => {
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
      verificationToken,
    } = req.body;

    try {
      //check
      if (
        !email ||
        !password ||
        !fullName ||
        !universityId ||
        !studyProgramId ||
        !verificationToken
      ) {
        return res.code(400).send({ message: "Missing required fields." });
      }

      // Validate verification token
      let decoded;
      try {
        decoded = jwt.verify(verificationToken, jwtSecret);
        if (decoded.purpose !== "email-verification" || decoded.role !== "user") {
          return res.code(401).send({ message: "Invalid verification token" });
        }
        if (decoded.email !== email.toLowerCase().trim()) {
          return res.code(401).send({ message: "Email mismatch" });
        }
      } catch (err) {
        return res.code(401).send({ message: "Invalid or expired verification token" });
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

      // Create user (already verified via pre-registration verification)
      const user = await User.create({
        fullName : lowerFullName,
        birthDate: birthDateISO,
        email: lowerEmail,
        password: hashedPassword,
        university: uniId,
        studyProgram: spId,
        externalSystemId,
        ...locationIds,
        isVerified: true, // Already verified before registration
      });

      // Create JWT token for immediate login
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

      let daysRemaining;
      if (user.expiresAt instanceof Date) {
        daysRemaining = Math.max(
          0,
          Math.floor((user.expiresAt - new Date()) / (1000 * 60 * 60 * 24))
        );
      }

      return res.code(201).send({
        message: "User registered successfully",
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
      });
    } catch (err) {
      if (err && err.code === 11000) {
        return res.code(409).send({ message: "User already registered" });
      }
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
  }
  );

  // ---------- COMPANY REGISTER (no transactions) ----------
  // TODO chekc front end max car des 200 and email 50
  fastify.post(
    "/company",
    {
      schema: CompanyRegisterDto,
      config: {
        rateLimit: {
          max: 3,
          timeWindow: 120000,
          hook: 'preHandler',
          keyGenerator: (req) => {
            try {
              const email = String(req.body?.email || '').toLowerCase().trim();
              return email ? `register-company:${email}` : req.ip;
            } catch (_) {
              return req.ip;
            }
          },
        },
      },
    },
    async (req, res) => {
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
        companyName:lowerCompanyName,
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
      if (err && err.code === 11000) {
        return res.code(409).send({ message: "Company already registered" });
      }
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
  }
  );
}

module.exports = registerRoutes;
