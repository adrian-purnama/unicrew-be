const { default: mongoose } = require("mongoose");

const studyProgramSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  }
}, { timestamps: true });

module.exports = mongoose.model("StudyProgram", studyProgramSchema);
