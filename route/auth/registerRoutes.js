const { sendVerifyEmail } = require("../../helper/emailHelper");
const { createOtp } = require("../../helper/otpHelper");
const bcrypt = require("bcrypt");

const Admin = require("../../schema/adminSchema");
const Company = require("../../schema/companySchema");
const User = require("../../schema/userSchema");
const { emailPasswordDto, userRegisterDto, companyRegisterDto } = require("./dto");

const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
dotenv.config();
const jwtSecret = process.env.JWT_SECRET;
//temporary
const salt = 10;

async function registerRoutes(fastify, option) {
    fastify.post("/admin", { schema: emailPasswordDto }, async (req, res) => {
        const { email, password } = req.body;

        try {
            const exist = await Admin.findOne({ email: email.toLowerCase().trim() });
            if (exist) {
                return res.code(200).send({ message: "Admin already registered" });
            }
            const hashedPassword = bcrypt.hashSync(password, salt);

            const newAdmin = await Admin.create({
                email: email.toLowerCase().trim(),
                password: hashedPassword,
            });

            const otp = await createOtp(newAdmin._id);
            sendVerifyEmail(newAdmin.email, otp, "admin");

            res.code(200).send({ message: "Admin created successfully, please verify email" });
        } catch (err) {
            console.log(err);
            res.code(400).send({ message: "Internal server error" });
        }
    });

    fastify.post("/user", { schema: userRegisterDto }, async (req, res) => {
        const { fullName, birthDate, email, password, university, studyProgram, externalSystemId } =
            req.body;

        try {
            const lowerEmail = email.toLowerCase().trim();
            const exist = await User.findOne({ email: lowerEmail });
            if (exist) {
                return res.code(200).send({ message: "User already registered" });
            }

            const hashedPassword = bcrypt.hashSync(password, salt);

            const newUser = await User.create({
                fullName,
                birthDate,
                email: lowerEmail,
                password: hashedPassword,
                university,
                studyProgram,
                externalSystemId,
                // expiresAt is set by default in schema (30 days from now)
            });

            // Generate JWT token immediately
            const token = jwt.sign(
                {
                    _id: newUser._id,
                    role: newUser.role,
                    email : newUser.email,
                    name: newUser.fullName,
                    profilePicture: newUser.profilePicture,
                },
                jwtSecret,
                { expiresIn: "7d" }
            );

            // Send verification email
            const otp = await createOtp(newUser._id);
            sendVerifyEmail(newUser.email, otp, "user");

            // Calculate days remaining until account expires
            const daysRemaining = Math.floor(
                (newUser.expiresAt - new Date()) / (1000 * 60 * 60 * 24)
            );

            return res.code(200).send({
                message: "User created successfully, please verify email",
                token,
                user: {
                    id: newUser._id,
                    name: newUser.fullName,
                    email: newUser.email,
                    role: newUser.role,
                    profilePicture: newUser.profilePicture,
                    isVerified: newUser.isVerified,
                    isProfileComplete: false, // New users won't have complete profiles
                },
                emailVerification: {
                    required: true,
                    expiresAt: newUser.expiresAt,
                    daysRemaining,
                },
            });
        } catch (err) {
            console.log(err);
            return res.code(500).send({ message: "Internal server error" });
        }
    });

    fastify.post("/company", { schema: companyRegisterDto }, async (req, res) => {
        const { companyName, industries, description, location, socialLinks, email, password } =
            req.body;

        try {
            const exist = await Company.findOne({ email: email.toLowerCase().trim() });
            if (exist) {
                return res.code(200).send({ message: "Company already registered" });
            }

            const hashedPassword = bcrypt.hashSync(password, salt);

            const newCompany = await Company.create({
                companyName,
                industries,
                description,
                location,
                socialLinks,
                email: email.toLowerCase().trim(),
                password: hashedPassword,
            });

            const otp = await createOtp(newCompany._id);
            sendVerifyEmail(newCompany.email, otp, "company");

            return res.code(200).send({ message: "Company registered, please verify email" });
        } catch (err) {
            console.error(err);
            return res.code(500).send({ message: "Internal server error", error: err.message });
        }
    });
}

module.exports = registerRoutes;
