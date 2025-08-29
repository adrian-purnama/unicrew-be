// helper/roleAuth.js
const jwt = require("jsonwebtoken");
const Admin = require("../schema/adminSchema");
const Company = require("../schema/companySchema");
const User = require("../schema/userSchema");

const roleModelMap = {
  user: User,
  company: Company,
  admin: Admin,
};

const jwtSecret = process.env.JWT_SECRET;

/**
 * Required auth: rejects if no/invalid token.
 * Usage: preHandler: roleAuth(["user","company"])
 */
function roleAuth(allowedRoles = []) {
  return async function (req, reply) {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      if (!token) {
        req.log.info("Auth: no token");
        return reply.code(401).send({ message: "No token provided" });
      }

      let decoded;
      try {
        decoded = jwt.verify(token, jwtSecret);
      } catch (e) {
        req.log.warn({ err: e.message }, "Auth: invalid token");
        return reply.code(401).send({ message: "Invalid or expired token" });
      }

      const { _id, role } = decoded;

      if (allowedRoles.length && !allowedRoles.includes(role)) {
        req.log.info({ role, allowedRoles }, "Auth: role forbidden");
        return reply.code(403).send({ message: "Access forbidden for this role" });
      }

      const Model = roleModelMap[role];
      if (!Model) {
        req.log.error({ role }, "Auth: unknown role mapping");
        return reply.code(400).send({ message: "Invalid role in token" });
      }

      const entity = await Model.findById(_id);
      if (!entity || entity.isActive === false) {
        req.log.info({ userId: _id }, "Auth: user inactive/not found");
        return reply.code(401).send({ message: "User inactive or not found" });
      }

      // attach to request for downstream handlers
      req.userId = _id;
      req.userRole = role;
      req.user = entity;
    } catch (err) {
      req.log.error({ err }, "Auth: unexpected error");
      return reply.code(500).send({ message: "Auth failed", error: err.message });
    }
  };
}

/**
 * Optional auth: does NOT reject; treats invalid/missing token as guest.
 * Usage: preHandler: optionalAuth(["user"])  // if the role must be "user" to attach
 *        or preHandler: optionalAuth()       // attach any valid role
 */
function optionalAuth(allowedRoles = []) {
  return async function (req, reply) {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      if (!token) {
        // guest
        return;
      }

      let decoded;
      try {
        decoded = jwt.verify(token, jwtSecret);
      } catch (e) {
        // invalid → guest
        req.log.warn({ err: e.message }, "OptionalAuth: invalid token → guest");
        return;
      }

      const { _id, role } = decoded;

      if (allowedRoles.length && !allowedRoles.includes(role)) {
        // role not allowed for this route → treat as guest
        req.log.info({ role, allowedRoles }, "OptionalAuth: role not allowed → guest");
        return;
      }

      const Model = roleModelMap[role];
      if (!Model) {
        req.log.error({ role }, "OptionalAuth: unknown role mapping");
        return;
      }

      const entity = await Model.findById(_id);
      if (!entity || entity.isActive === false) {
        req.log.info({ userId: _id }, "OptionalAuth: user inactive/not found → guest");
        return;
      }

      req.userId = _id;
      req.userRole = role;
      req.user = entity;
    } catch (err) {
      // Any error → guest
      req.log.error({ err }, "OptionalAuth: unexpected error → guest");
      return;
    }
  };
}

module.exports = { roleAuth, optionalAuth };
