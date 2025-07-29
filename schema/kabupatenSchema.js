const { default: mongoose } = require("mongoose");

const kabupatenSchema = new mongoose.Schema({
  name: { type: String, required: true, unique : true },
  provinsi: { type: mongoose.Schema.Types.ObjectId, ref: 'Provinsi', required: true }
}, { timestamps: true });

module.exports = mongoose.model('Kabupaten', kabupatenSchema);
