const userProfileDto = {
  body: {
    type: "object",
    properties: {
      university: { type: "string", pattern: "^[a-f\\d]{24}$" },
      studyProgram: { type: "string", pattern: "^[a-f\\d]{24}$" },
      aboutMe: { type: "string", maxLength: 1000 },
      skills: {
        type: "array",
        items: { type: "string", pattern: "^[a-f\\d]{24}$" },
        minItems: 1,
        maxItems: 10,
      },
      location: {
        type: "object",
        properties: {
          provinsi: { type: "string", pattern: "^[a-f\\d]{24}$" },
          kabupaten: { type: "string", pattern: "^[a-f\\d]{24}$" },
          kecamatan: { type: "string", pattern: "^[a-f\\d]{24}$" },
        },
      },
    },
    additionalProperties: false,
  },
  consumes: ["multipart/form-data"], 
};

module.exports = {
    userProfileDto
}