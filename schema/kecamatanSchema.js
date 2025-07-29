const { default: mongoose } = require("mongoose");

const kecamatanSchema = new mongoose.Schema({
  name: { type: String, required: true, unique : true },
  kabupaten: { type: mongoose.Schema.Types.ObjectId, ref: 'Kabupaten', required: true }
}, { timestamps: true });

module.exports = mongoose.model('Kecamatan', kecamatanSchema);
