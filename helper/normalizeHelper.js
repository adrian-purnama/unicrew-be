// utils/normalize.js
function normalizeName(s = "") {
  return s
    .toString()
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function escapeRegex(s = "") {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build a fuzzy $and of tokens (each token must appear in order, loosely).
 * Example: "des kom vis" -> tokens ["des","kom","vis"] -> each is /des/i etc.
 */
function buildFuzzyQueryOnNormName(q) {
  const norm = normalizeName(q);
  if (!norm) return {};
  const tokens = norm.split(" ").filter(Boolean);
  return {
    $and: tokens.map((t) => ({ normName: { $regex: new RegExp(escapeRegex(t), "i") } })),
  };
}

module.exports = { normalizeName, escapeRegex, buildFuzzyQueryOnNormName };
