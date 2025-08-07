const jwt = require('jsonwebtoken');
const User = require('../schema/userSchema');
const Company = require('../schema/companySchema');
const Admin = require('../schema/adminSchema');
const dotenv = require('dotenv');

dotenv.config()
const jwtSecret = process.env.JWT_SECRET

const roleModelMap = {
  user: User,
  company: Company,
  admin: Admin
};

// const roleAuth = (allowedRoles = []) => {
//   return async (req, res, next) => {
//     try {
//       const token = req.headers.authorization?.split(' ')[1];
//       if (!token) return res.status(401).json({ message: 'No token provided' });

//       const decoded = jwt.verify(token, jwtSecret);
//       const { _id, role } = decoded;

//       if (!allowedRoles.includes(role)) {
//         return res.status(403).json({ message: 'Access forbidden for this role' });
//       }

//       const Model = roleModelMap[role];
//       if (!Model) return res.status(400).json({ message: 'Invalid role in token' });

//       const entity = await Model.findById(_id);
//       if (!entity) return res.status(401).json({ message: 'User not found' });

//       req.user = entity;
//       req.userRole = role;
//       next();

//     } catch (err) {
//       return res.status(401).json({ message: 'Invalid or expired token', error: err.message });
//     }
//   };
// };

const roleAuth = (allowedRoles = []) => {
  return async (req, res) => {
    try {
      const token = req.headers.authorization?.split(' ')[1];
      if (!token) {
        return res.status(401).json({ message: 'No token provided' });
      }

      const decoded = jwt.verify(token, jwtSecret);
      const { _id, role } = decoded;

      if (!allowedRoles.includes(role)) {
        return res.status(403).json({ message: 'Access forbidden for this role' });
      }

      const Model = roleModelMap[role];
      if (!Model) {
        return res.status(400).json({ message: 'Invalid role in token' });
      }

      const user = await Model.findById(_id);
      if (!user || user.isActive === false) {
        return res.status(401).json({ message: 'User not found or inactive' });
      }

      req.userId = _id;
      req.userRole = role;
      req.user = user;

    } catch (err) {
      return res.status(401).json({ message: 'Invalid or expired token', error: err.message });
    }
  };
};


module.exports = roleAuth;
