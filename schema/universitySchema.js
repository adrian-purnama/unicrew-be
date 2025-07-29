const { default: mongoose } = require("mongoose");

const universitySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
  },
  speciality: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StudyProgram'
  }]
}, { timestamps: true });

module.exports = mongoose.model("University", universitySchema);
