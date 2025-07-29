const jobPostDto = {
    body: {
        type: "object",
        required: ["title", "workType", "requiredSkills"],
        properties: {
            title: { type: "string" },
            description: { type: "string" },
            workType: { type: "string", enum: ["remote", "onsite", "hybrid"] },
            location: {
                type: "object",
                properties: {
                    provinsi: { type: "string" },
                    kabupaten: { type: "string" },
                    kecamatan: { type: "string" },
                },
            },
            requiredSkills: {
                type: "array",
                items: { type: "string" },
            },
            salaryMin: { type: "number" },
            salaryMax: { type: "number" },
            additionalInfo: { type: "string" },
        },
    },
};

const idParam = {
    params: {
        type: "object",
        required: ["id"],
        properties: {
            id: { type: "string", pattern: "^[a-f\\d]{24}$" },
        },
    },
};

const jobFeedDto = {
    querystring: {
        type: "object",
        properties: {
            location: {
                type: "object",
                properties: {
                    provinsi: { type: "string" },
                    kabupaten: { type: "string" },
                    kecamatan: { type: "string" },
                },
            },
            workType: {
                anyOf: [
                    { type: "string" },
                    {
                        type: "array",
                        items: { type: "string", enum: ["onsite", "remote", "hybrid"] },
                    },
                ],
            },
            skills: {
                anyOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
            },
            industries: {
                type: "array",
                items: { type: "string" },
            },
            page: { type: "integer", minimum: 1, default: 1 },
            limit: { type: "integer", minimum: 1, maximum: 50, default: 10 },
        },
    },
};

const applyJobDto = {
    body: {
        type: "object",
        required: ["jobId"],
        properties: {
            jobId: { type: "string", minLength: 1 },
        },
    },
};

const cancelApplyJobDto = {
    body: {
        type: "object",
        required: ["jobId"],
        properties: {
            jobId: { type: "string", minLength: 1 },
        },
    },
};

module.exports = { jobPostDto, idParam, jobFeedDto, cancelApplyJobDto, applyJobDto };
