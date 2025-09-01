// routes/registerRoutes.js
const { sendVerifyEmail } = require("../../helper/emailHelper");
const { createOtp } = require("../../helper/otpHelper");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
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

async function registerRoutes(fastify, option) {
  // ---------- ADMIN REGISTER (await email, rollback on failure) ----------
  fastify.post("/admin", { schema: AdminRegisterDto }, async (req, res) => {
    const { email, password } = req.body;
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const lowerEmail = email.toLowerCase().trim();
        const exist = await Admin.findOne({ email: lowerEmail }).session(
          session
        );
        if (exist) {
          return res.code(409).send({ message: "Admin already registered" });
        }

        const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

        const newAdmin = await Admin.create(
          [{ email: lowerEmail, password: hashedPassword }],
          { session }
        ).then((arr) => arr[0]);

        const otp = await createOtp(newAdmin._id); // await
        await sendVerifyEmail(newAdmin.email, otp, "admin"); // await (no fire-and-forget)

        res
          .code(201)
          .send({ message: "Admin created successfully, please verify email" });
      });
    } catch (err) {
      console.error("Admin register failed:", err);
      // If email sending failed, transaction aborted → no dangling record
      return res
        .code(500)
        .send({ message: "Failed to send verification email." });
    } finally {
      session.endSession();
    }
  });

  // ---------- USER REGISTER (await email, rollback on failure) ----------
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
      // skills,
    } = req.body;

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        if (
          !email ||
          !password ||
          !fullName ||
          !universityId ||
          !studyProgramId
        ) {
          res.code(400).send({ message: "Missing required fields." });
          return;
        }

        const lowerEmail = email.toLowerCase().trim();
        const exist = await User.findOne({ email: lowerEmail }).session(
          session
        );
        if (exist) {
          res.code(409).send({ message: "User already registered" });
          return;
        }

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
        const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

        let birthDateISO;
        if (birthDate) {
          const d = new Date(birthDate);
          if (Number.isNaN(d.getTime())) {
            res.code(422).send({ message: "Invalid birth date." });
            return;
          }
          birthDateISO = d;
        }

        const newUser = await User.create(
          [
            {
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
            },
          ],
          { session }
        ).then((arr) => arr[0]);

        // sign (short-lived) token before email—still within txn scope
        const token = jwt.sign(
          {
            _id: newUser._id,
            role: newUser.role,
            email: newUser.email,
            name: newUser.fullName,
            profilePicture: newUser.profilePicture,
          },
          jwtSecret,
          { expiresIn: "7d" }
        );

        const otp = await createOtp(newUser._id);
        await sendVerifyEmail(newUser.email, otp, "user"); // await

        let daysRemaining;
        if (newUser.expiresAt instanceof Date) {
          daysRemaining = Math.max(
            0,
            Math.floor((newUser.expiresAt - new Date()) / (1000 * 60 * 60 * 24))
          );
        }

        res.code(201).send({
          message: "User created successfully, please verify email",
          token,
          user: {
            id: newUser._id,
            name: newUser.fullName,
            email: newUser.email,
            role: newUser.role,
            profilePicture: newUser.profilePicture,
            isVerified: newUser.isVerified,
            isProfileComplete: false,
            university: { id: university._id, name: university.name },
            studyProgram: { id: studyProgram._id, name: studyProgram.name },
          },
          emailVerification: {
            required: true,
            expiresAt: newUser.expiresAt,
            daysRemaining,
          },
        });
      });
    } catch (err) {
      if (
        err &&
        typeof err.message === "string" &&
        /does not|belong|Invalid/i.test(err.message)
      ) {
        return res.code(422).send({ message: err.message });
      }
      console.error("User register failed:", err);
      return res
        .code(502)
        .send({ message: "Failed to send verification email." });
    } finally {
      session.endSession();
    }
  });

  // ---------- COMPANY REGISTER (await email, rollback on failure) ----------
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

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const lowerEmail = email.toLowerCase().trim();
        const exist = await Company.findOne({ email: lowerEmail }).session(
          session
        );
        if (exist) {
          res.code(409).send({ message: "Company already registered" });
          return;
        }

        const industryIds = await validateIndustrySelection(industries);

        const locInput =
          location && typeof location === "object" ? location : {};
        const locationIds = await validateLocationSelection({
          provinsiId: locInput.provinsiId,
          kabupatenId: locInput.kabupatenId,
          kecamatanId: locInput.kecamatanId,
        });

        const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

        const newCompany = await Company.create(
          [
            {
              companyName,
              industries: industryIds,
              description,
              ...locationIds,
              socialLinks,
              email: lowerEmail,
              password: hashedPassword,
              isVerified: false,
            },
          ],
          { session }
        ).then((arr) => arr[0]);

        const otp = await createOtp(newCompany._id);
        await sendVerifyEmail(newCompany.email, otp, "company"); // await

        res
          .code(201)
          .send({ message: "Company registered, please verify email" });
      });
    } catch (err) {
      if (
        err &&
        typeof err.message === "string" &&
        /does not|belong|Invalid/i.test(err.message)
      ) {
        return res.code(422).send({ message: err.message });
      }
      console.error("Company register failed:", err);
      return res
        .code(502)
        .send({ message: "Failed to send verification email." });
    } finally {
      session.endSession();
    }
  });
}

module.exports = registerRoutes;
