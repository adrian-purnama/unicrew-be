const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");

const User = require("../../schema/userSchema");
const Admin = require("../../schema/adminSchema");
const Company = require("../../schema/companySchema");
const { LoginDto } = require("./dto");

dotenv.config();
const jwtSecret = process.env.JWT_SECRET;

const roleModelMap = {
  user: User,
  admin: Admin,
  company: Company,
};

function loginRoutes(fastify, options) {
  fastify.post("/login", { schema: LoginDto }, async (req, res) => {
    const { email, password, role } = req.body;
    console.log(role);

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
      if (!user) return res.code(401).send({ message: "Account not found" });
        console.log(user)
      if (user.role === "admin" && user.isVerified === false) {
        return res.code(401).send({ message: "Admin unverified" });
      }
      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid)
        return res.code(401).send({ message: "Incorrect password" });

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
  });
}

module.exports = loginRoutes;
