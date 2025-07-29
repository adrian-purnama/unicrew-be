function calculateMatchScore(job, user, filters = {}) {
    let score = 0;
    const reasons = [];

    const location = filters.location || {};
    const workType = filters.workType || [];
    const minSalary = filters.minSalary;
    const industries = filters.industries || [];

    // === Skill Matching ===
    const matchedSkills =
        job.requiredSkills?.filter((skill) =>
            user.skills?.some((userSkill) => userSkill._id.toString() === skill._id.toString())
        ) || [];
    if (matchedSkills.length) {
        score += matchedSkills.length * 10;
        const skillNames = matchedSkills.map((s) => s.name).join(", ");
        reasons.push(`Matches your skills: ${skillNames}`);
    }

    // === Location Matching ===
    // === Location Matching ===
    let locMatchScore = 0;
    const matchedLocationParts = [];

    if (location.kecamatan && job.location?.kecamatan?._id?.toString() === location.kecamatan) {
        locMatchScore += 5;
        matchedLocationParts.push("kecamatan");
    }

    if (location.kabupaten && job.location?.kabupaten?._id?.toString() === location.kabupaten) {
        locMatchScore += 10;
        matchedLocationParts.push("kabupaten");
    }

    if (location.provinsi && job.location?.provinsi?._id?.toString() === location.provinsi) {
        locMatchScore += 10;
        matchedLocationParts.push("provinsi");
    }

    if (matchedLocationParts.length > 0) {
        score += locMatchScore;
        reasons.push(`Location match: ${matchedLocationParts.join(", ")}`);
    }

    // === Work Type ===
    if (workType.includes(job.workType)) {
        score += 10;
        reasons.push(`Work type matches your preference: ${job.workType}`);
    }

    // === Salary Range ===
    if (minSalary) {
        const minJobSalary = job.salaryRange?.min || 0;
        if (minJobSalary >= minSalary) {
            score += 10;
            reasons.push(
                `Salary starts from ${minJobSalary.toLocaleString()} which meets your minimum`
            );
        } else {
            score -= 10;
        }
    }

    // === Industry Matching ===
    if (
        industries.length &&
        job.company?.industries?.some((ind) => industries.includes(ind._id.toString()))
    ) {
        score += 8;
        reasons.push(`Matches your selected industries`);
    }

    // === Recency Bonus ===
    const daysOld = (Date.now() - new Date(job.createdAt)) / (1000 * 60 * 60 * 24);
    const recencyScore = Math.max(0, 30 - daysOld);
    score += recencyScore;
    if (daysOld < 3) reasons.push("Recently posted");

    return { score, reasons };
}

module.exports = {
    calculateMatchScore,
};
