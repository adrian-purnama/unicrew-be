const { default: mongoose } = require("mongoose");

const kelurahanSchema = new mongoose.Schema({
  name: { type: String, required: true, unique : true},
  kecamatan: { type: mongoose.Schema.Types.ObjectId, ref: 'Kecamatan', required: true }
}, { timestamps: true });

module.exports = mongoose.model('Kelurahan', kelurahanSchema);
