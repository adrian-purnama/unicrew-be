const { default: mongoose } = require("mongoose");

const messageSchema = new mongoose.Schema({
  chatRoom: { type: mongoose.Schema.Types.ObjectId, ref: "ChatRoom", required: true },
  senderType: { type: String, enum: ["user", "company"], required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, required: true },
  content: { type: String, required: true },
  seenBy: [{ type: mongoose.Schema.Types.ObjectId }],
}, { timestamps: true });

module.exports = mongoose.model("Message", messageSchema);
