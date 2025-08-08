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


/**
 * Generate star rating display object
 * @param {Number} rating - Average rating (0-5)
 * @returns {Object} Star rating info
 */
function generateStarRating(rating = 0) {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

    return {
        full: fullStars,
        half: hasHalfStar ? 1 : 0,
        empty: emptyStars,
        display: "★".repeat(fullStars) + (hasHalfStar ? "☆" : "") + "☆".repeat(emptyStars),
        percentage: (rating / 5) * 100,
        text: rating > 0 ? `${rating}/5` : "No reviews yet"
    };
}

module.exports = {
    calculateMatchScore,
};


// function calculateMatchScore(job, user, filters = {}) {
//     let score = 0;
//     const reasons = [];
    
//     // Dynamic weights based on what data is available
//     const weights = {
//         skills: 25,      // Most important - what you can do
//         location: 20,    // Where you want to work
//         workType: 15,    // How you want to work
//         salary: 15,      // What you expect to earn
//         industry: 10,    // What sector interests you
//         company: 8,      // Company quality indicators
//         recency: 5,      // How fresh the posting is
//         fallback: 2      // Base points for any opportunity
//     };

//     const location = filters.location || {};
//     const workType = filters.workType || [];
//     const minSalary = filters.minSalary;
//     const industries = filters.industries || [];

//     // === 🎯 SKILLS MATCHING (25 points max) ===
//     const userSkills = user.skills || [];
//     const jobSkills = job.requiredSkills || [];
    
//     if (userSkills.length > 0 && jobSkills.length > 0) {
//         const userSkillIds = userSkills.map(s => s._id.toString());
//         const jobSkillIds = jobSkills.map(s => s._id.toString());
        
//         const matchedSkills = jobSkills.filter(skill => 
//             userSkillIds.includes(skill._id.toString())
//         );
        
//         if (matchedSkills.length > 0) {
//             const skillMatchRatio = matchedSkills.length / jobSkills.length;
//             const skillScore = weights.skills * skillMatchRatio;
//             score += skillScore;
            
//             const skillNames = matchedSkills.slice(0, 3).map(s => s.name).join(", ");
//             const moreSkills = matchedSkills.length > 3 ? ` +${matchedSkills.length - 3} more` : '';
//             reasons.push(`${Math.round(skillMatchRatio * 100)}% skill match: ${skillNames}${moreSkills}`);
//         } else {
//             // User has skills but none match - lower score
//             score += weights.fallback;
//         }
//     } else if (jobSkills.length === 0) {
//         // No specific skills required - good for entry level
//         score += weights.fallback * 3;
//         reasons.push("Open to all skill levels");
//     } else if (userSkills.length === 0) {
//         // User has no skills listed but job requires some
//         score += weights.fallback;
//         reasons.push("Good opportunity to develop new skills");
//     }

//     // === 📍 LOCATION MATCHING (20 points max) ===
//     if (job.workType === 'remote') {
//         score += weights.location * 0.9; // Remote is almost always a match
//         reasons.push("🌐 Remote work - work from anywhere");
//     } else {
//         const userLoc = user.location || {};
//         const jobLoc = job.location || {};
        
//         // Use filter location if provided, otherwise user's location
//         const targetLoc = {
//             provinsi: location.provinsi || userLoc.provinsi?._id?.toString(),
//             kabupaten: location.kabupaten || userLoc.kabupaten?._id?.toString(),
//             kecamatan: location.kecamatan || userLoc.kecamatan?._id?.toString()
//         };

//         let locationScore = 0;
//         let locationMatch = "";
//         let isLocationMatch = false;

//         if (targetLoc.kecamatan && jobLoc.kecamatan?._id?.toString() === targetLoc.kecamatan) {
//             locationScore = weights.location;
//             locationMatch = `📍 Same district: ${jobLoc.kecamatan.name}`;
//             isLocationMatch = true;
//         } else if (targetLoc.kabupaten && jobLoc.kabupaten?._id?.toString() === targetLoc.kabupaten) {
//             locationScore = weights.location * 0.8;
//             locationMatch = `🏙️ Same city: ${jobLoc.kabupaten.name}`;
//             isLocationMatch = true;
//         } else if (targetLoc.provinsi && jobLoc.provinsi?._id?.toString() === targetLoc.provinsi) {
//             locationScore = weights.location * 0.6;
//             locationMatch = `🗺️ Same province: ${jobLoc.provinsi.name}`;
//             isLocationMatch = true;
//         }

//         if (isLocationMatch) {
//             score += locationScore;
//             reasons.push(locationMatch);
//         } else {
//             // Only show location if no preference was set, otherwise it's irrelevant
//             const hasLocationPreference = targetLoc.provinsi || targetLoc.kabupaten || targetLoc.kecamatan;
//             if (!hasLocationPreference && (jobLoc.kabupaten?.name || jobLoc.provinsi?.name)) {
//                 locationScore = weights.fallback;
//                 const place = jobLoc.kabupaten?.name || jobLoc.provinsi?.name;
//                 locationMatch = `📌 Located in ${place}`;
//                 score += locationScore;
//                 reasons.push(locationMatch);
//             }
//             // If user has location preference but job doesn't match, don't add location reason
//         }
//     }

//     // === 💼 WORK TYPE MATCHING (15 points max) ===
//     if (workType.length > 0) {
//         // User has work type preference
//         if (workType.includes(job.workType)) {
//             score += weights.workType;
//             const workTypeEmoji = job.workType === 'remote' ? '🌐' : 
//                                  job.workType === 'hybrid' ? '🔄' : '🏢';
//             reasons.push(`${workTypeEmoji} ${job.workType} work matches your preference`);
//         }
//         // If work type doesn't match preference, don't add any work type reason
//     } else {
//         // No preference specified, give partial credit but don't emphasize it
//         score += weights.workType * 0.3;
//         // Don't add work type to reasons unless it's remote (which is generally positive)
//         if (job.workType === 'remote') {
//             reasons.push(`🌐 ${job.workType} work arrangement`);
//         }
//     }

//     // === 💰 SALARY MATCHING (15 points max) ===
//     const jobMinSalary = job.salaryRange?.min || 0;
//     const jobMaxSalary = job.salaryRange?.max || jobMinSalary;
    
//     if (minSalary && jobMinSalary > 0) {
//         // User has salary expectation
//         if (jobMinSalary >= minSalary) {
//             score += weights.salary;
//             reasons.push(`💰 Salary ${jobMinSalary.toLocaleString()}-${jobMaxSalary.toLocaleString()} meets your expectation`);
//         } else if (jobMaxSalary >= minSalary) {
//             score += weights.salary * 0.6;
//             reasons.push(`💰 Max salary ${jobMaxSalary.toLocaleString()} meets your expectation`);
//         }
//         // If salary is below expectation, don't add salary reason at all
//     } else if (jobMinSalary > 0) {
//         // No salary requirement from user, but job shows salary transparency
//         score += weights.salary * 0.4;
//         reasons.push(`💰 Transparent salary: ${jobMinSalary.toLocaleString()}-${jobMaxSalary.toLocaleString()}`);
//     }

//     // === 🏭 INDUSTRY MATCHING (10 points max) ===
//     const jobIndustries = job.company?.industries || [];
    
//     if (industries.length > 0) {
//         // User has industry preference
//         if (jobIndustries.length > 0) {
//             const matchedIndustries = jobIndustries.filter(ind => 
//                 industries.includes(ind._id?.toString())
//             );
            
//             if (matchedIndustries.length > 0) {
//                 score += weights.industry;
//                 const industryNames = matchedIndustries.slice(0, 2).map(ind => ind.name).join(", ");
//                 reasons.push(`🏭 Industry match: ${industryNames}`);
//             }
//             // If industries don't match preference, don't add industry reason
//         }
//     } else {
//         // No industry preference, show industry info if available
//         if (jobIndustries.length > 0) {
//             score += weights.fallback;
//             const industryName = jobIndustries[0]?.name;
//             reasons.push(`🏭 ${industryName} industry`);
//         }
//     }

//     // === 🏢 COMPANY QUALITY (8 points max) ===
//     let companyScore = 0;
//     const companyReasons = [];

//     if (job.company?.companyName) {
//         companyScore += weights.company * 0.2;
//     }

//     if (job.company?.profilePicture && !job.company.profilePicture.includes('default')) {
//         companyScore += weights.company * 0.2;
//         companyReasons.push("verified profile");
//     }

//     if (job.company?.description && job.company.description.length > 100) {
//         companyScore += weights.company * 0.3;
//         companyReasons.push("detailed company info");
//     }

//     if (job.company?.socialLinks?.website || job.company?.socialLinks?.linkedin) {
//         companyScore += weights.company * 0.3;
//         companyReasons.push("established online presence");
//     }

//     if (companyScore > 0) {
//         score += companyScore;
//         if (companyReasons.length > 0) {
//             reasons.push(`🏢 Quality company: ${companyReasons.join(", ")}`);
//         } else if (job.company?.companyName) {
//             reasons.push(`🏢 ${job.company.companyName}`);
//         }
//     }

//     // === ⏱️ RECENCY BONUS (5 points max) ===
//     const hoursOld = (Date.now() - new Date(job.createdAt)) / (1000 * 60 * 60);
    
//     if (hoursOld < 24) {
//         score += weights.recency;
//         reasons.push("🆕 Posted today");
//     } else if (hoursOld < 72) {
//         score += weights.recency * 0.8;
//         reasons.push("🕐 Posted recently");
//     } else if (hoursOld < 168) {
//         score += weights.recency * 0.5;
//         reasons.push("📅 Posted this week");
//     } else if (hoursOld < 720) {
//         score += weights.recency * 0.2;
//     }

//     // === 📝 JOB QUALITY INDICATORS ===
//     if (job.description && job.description.length > 200) {
//         score += weights.fallback;
//         reasons.push("📝 Detailed job description");
//     }

//     // === 🎯 SMART FALLBACK REASONS ===
//     // Only add fallback reasons if we don't have enough meaningful reasons
//     const meaningfulReasons = reasons.filter(r => 
//         !r.includes("opportunity") && 
//         !r.includes("Join") && 
//         !r.includes("Expand your career") &&
//         !r.includes("work arrangement") // Remove generic work arrangement
//     );

//     // Only add fallback if we have very few meaningful reasons
//     if (meaningfulReasons.length < 2) {
//         if (job.title && !reasons.some(r => r.includes(job.title))) {
//             reasons.push(`💼 ${job.title} position`);
//         } else if (job.company?.companyName && !reasons.some(r => r.includes(job.company.companyName))) {
//             reasons.push(`🏢 Opportunity at ${job.company.companyName}`);
//         }
//     }

//     // Add one final fallback only if we have no reasons at all
//     if (reasons.length === 0) {
//         reasons.push("🚀 Career opportunity");
//     }

//     // === 📊 NORMALIZE SCORE (0-100) ===
//     const maxPossibleScore = weights.skills + weights.location + weights.workType + 
//                             weights.salary + weights.industry + weights.company + weights.recency;
    
//     let normalizedScore = (score / maxPossibleScore) * 100;
    
//     // Ensure minimum score for any active job
//     normalizedScore = Math.max(normalizedScore, 15);
    
//     // Cap at 100
//     normalizedScore = Math.min(normalizedScore, 100);

//     // Return only the most relevant reasons (max 4)
//     const finalReasons = reasons.slice(0, 4);

//     return { 
//         score: Math.round(normalizedScore), 
//         reasons: finalReasons
//     };
// }

// module.exports = {
//     calculateMatchScore,
// };