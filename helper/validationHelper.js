// utils/validateSelections.js
const mongoose = require("mongoose");

// === Models (adjust paths if needed) ===
const Industry = require("../schema/industrySchema");
const Skill = require("../schema/skillSchema");
const Provinsi = require("../schema/provinsiSchema");
const Kabupaten = require("../schema/kabupatenSchema");
const Kecamatan = require("../schema/kecamatanSchema");
const University = require("../schema/universitySchema");
const StudyProgram = require("../schema/studyProgramSchema");

// === tiny helpers ===
const isId = (v) => mongoose.Types.ObjectId.isValid(String(v || ""));
const toId = (v) => new mongoose.Types.ObjectId(String(v));
const ensureArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const uniqIds = (arr) => {
  const s = new Set(arr.map(String));
  return Array.from(s).map((x) => new mongoose.Types.ObjectId(x));
};

// ---------- Industry ----------
async function validateIndustrySelection(industryIds) {
  const ids = uniqIds(ensureArray(industryIds).filter(isId).map(toId));
  if (!ids.length) return [];
  const found = await Industry.find({ _id: { $in: ids } }).select("_id").lean();
  if (found.length !== ids.length) {
    throw new Error("One or more selected industries do not exist.");
  }
  return ids;
}

// ---------- Skill ----------
async function validateSkillSelection(skillIds) {
  const ids = uniqIds(ensureArray(skillIds).filter(isId).map(toId));
  if (!ids.length) return [];
  const found = await Skill.find({ _id: { $in: ids } }).select("_id").lean();
  if (found.length !== ids.length) {
    throw new Error("One or more selected skills do not exist.");
  }
  return ids;
}

// ---------- Location: Provinsi → Kabupaten → Kecamatan ----------
/**
 * You may pass any subset, but if a deeper level is provided,
 * its parent must also be provided and match the reference chain.
 *
 * Input:  { provinsiId?, kabupatenId?, kecamatanId? }
 * Output: { provinsiId?, kabupatenId?, kecamatanId? } (all as ObjectIds)
 */
async function validateLocationSelection({ provinsiId, kabupatenId, kecamatanId }) {
  const out = {};

  // deepest first: kecamatan -> kabupaten -> provinsi
  if (kecamatanId != null) {
    if (!isId(kecamatanId)) throw new Error("Invalid kecamatanId format.");
    const kec = await Kecamatan.findById(kecamatanId).select("_id kabupaten").lean();
    if (!kec) throw new Error("Selected kecamatan does not exist.");
    out.kecamatanId = toId(kec._id);

    // kabupaten must be provided and match
    if (!kabupatenId) throw new Error("kabupatenId is required when kecamatanId is provided.");
    if (!isId(kabupatenId)) throw new Error("Invalid kabupatenId format.");
    if (String(kec.kabupaten) !== String(kabupatenId)) {
      throw new Error("Kecamatan does not belong to the selected kabupaten.");
    }
  }

  if (kabupatenId != null) {
    if (!isId(kabupatenId)) throw new Error("Invalid kabupatenId format.");
    const kab = await Kabupaten.findById(kabupatenId).select("_id provinsi").lean();
    if (!kab) throw new Error("Selected kabupaten does not exist.");
    out.kabupatenId = toId(kab._id);

    // provinsi must be provided and match
    if (!provinsiId) throw new Error("provinsiId is required when kabupatenId is provided.");
    if (!isId(provinsiId)) throw new Error("Invalid provinsiId format.");
    if (String(kab.provinsi) !== String(provinsiId)) {
      throw new Error("Kabupaten does not belong to the selected provinsi.");
    }
  }

  if (provinsiId != null) {
    if (!isId(provinsiId)) throw new Error("Invalid provinsiId format.");
    // Optional existence check for provinsi alone:
    const prov = await Provinsi.findById(provinsiId).select("_id").lean();
    if (!prov) throw new Error("Selected provinsi does not exist.");
    out.provinsiId = toId(prov._id);
  }

  return out;
}

// ---------- Academic: University ----------
async function validateUniversitySelection(universityId) {
  if (!isId(universityId)) {
    throw new Error("Invalid university ID format.");
  }

  const uni = await University.findById(universityId).select("_id name").lean();
  if (!uni) {
    throw new Error("Selected university does not exist.");
  }

  return {
    universityId: toId(uni._id),
    university: uni,
  };
}

// ---------- Academic: StudyProgram ----------
async function validateStudyProgramSelection(studyProgramId) {
  if (!isId(studyProgramId)) {
    throw new Error("Invalid study program ID format.");
  }

  const sp = await StudyProgram.findById(studyProgramId).select("_id name").lean();
  if (!sp) {
    throw new Error("Selected study program does not exist.");
  }

  return {
    studyProgramId: toId(sp._id),
    studyProgram: sp,
  };
}

module.exports = {
  validateIndustrySelection,
  validateSkillSelection,
  validateLocationSelection,
  validateUniversitySelection,
  validateStudyProgramSelection
};
