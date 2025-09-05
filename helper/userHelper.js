function isUserProfileComplete(user) {
  const requiredFields = {
    skills: user.skills?.length > 0,
    aboutMe: !!user.aboutMe,
    location_provinsi: !!user.location?.provinsi,
    location_kabupaten: !!user.location?.kabupaten,
    location_kecamatan: !!user.location?.kecamatan,
  };

  const missing = Object.entries(requiredFields)
    .filter(([_, valid]) => !valid)
    .map(([key]) => key);

  const percentage = Math.round(
    ((Object.keys(requiredFields).length - missing.length) / Object.keys(requiredFields).length) * 100
  );

  return {
    isComplete: missing.length === 0,
    missingFields: missing,
    completedPercentage: percentage,
  };
}

module.exports = {
    isUserProfileComplete
}