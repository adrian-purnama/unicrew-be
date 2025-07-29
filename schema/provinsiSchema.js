const { default: mongoose } = require("mongoose");

const provinsiSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true }
}, { timestamps: true });

module.exports = mongoose.model('Provinsi', provinsiSchema);
