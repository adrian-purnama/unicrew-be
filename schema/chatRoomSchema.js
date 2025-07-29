const { default: mongoose } = require("mongoose");

const chatRoomSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  company: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
  job: { type: mongoose.Schema.Types.ObjectId, ref: "JobPost" },
}, { timestamps: true });

module.exports = mongoose.model("ChatRoom", chatRoomSchema);
