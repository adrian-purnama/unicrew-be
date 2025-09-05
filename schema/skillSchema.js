// models/Skill.js
const mongoose = require("mongoose");

const SkillSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    normName: { type: String, required: true, unique: true }, 
    usageCount: { type: Number, default: 0, index: true },
    source: { type: String, enum: ["admin", "user"], default: "user" },
  },
  { timestamps: true }
);

SkillSchema.index({ normName: 1 }, { unique: true });

module.exports = mongoose.model("Skill", SkillSchema);
