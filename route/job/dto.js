const jobPostDto = {
    body: {
        type: "object",
        required: ["title", "workType", "requiredSkills"],
        properties: {
            title: { type: "string", minLength: 1 },
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
                minItems: 1,
            },
            salaryMin: { type: "number", minimum: 0 },
            salaryMax: { type: "number", minimum: 0 },
            additionalInfo: { type: "string" },
        },
        if: {
            properties: { workType: { const: "remote" } }
        },
        then: {
            // For remote jobs, location is not required
        },
        else: {
            // For onsite/hybrid jobs, location is required
            required: ["location"],
            properties: {
                location: {
                    type: "object",
                    required: ["provinsi", "kabupaten", "kecamatan"],
                    properties: {
                        provinsi: { type: "string", minLength: 1 },
                        kabupaten: { type: "string", minLength: 1 },
                        kecamatan: { type: "string", minLength: 1 },
                    },
                },
            },
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

const saveJobDto = {
    body: {
        type: "object",
        required: ["jobId"],
        properties: {
            jobId: {
                type: "string",
                pattern: "^[0-9a-fA-F]{24}$", // MongoDB ObjectId pattern
            },
        },
        additionalProperties: false,
    },
    response: {
        201: {
            type: "object",
            properties: {
                message: { type: "string" },
                savedCount: { type: "number" },
                maxAllowed: { type: "number" },
                subscription: { type: "string", enum: ["free", "premium"] },
            },
        },
        400: {
            type: "object",
            properties: {
                message: { type: "string" },
            },
        },
        403: {
            type: "object",
            properties: {
                message: { type: "string" },
                currentCount: { type: "number" },
                maxAllowed: { type: "number" },
                subscription: { type: "string" },
            },
        },
        404: {
            type: "object",
            properties: {
                message: { type: "string" },
            },
        },
    },
};

const getSavedJobsDto = {
    querystring: {
        type: "object",
        properties: {
            page: {
                type: "string",
                pattern: "^[1-9][0-9]*$", // Positive integer as string
            },
            limit: {
                type: "string",
                pattern: "^[1-9][0-9]*$", // Positive integer as string
            },
        },
        additionalProperties: false,
    },
    response: {
        200: {
            type: "object",
            properties: {
                savedJobs: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            _id: { type: "string" },
                            title: { type: "string" },
                            description: { type: "string" },
                            workType: { type: "string", enum: ["remote", "onsite", "hybrid"] },
                            location: { type: "object" },
                            salaryRange: { type: "object" },
                            company: { type: "object" },
                            requiredSkills: { type: "array" },
                            savedAt: { type: "string", format: "date-time" },
                            createdAt: { type: "string", format: "date-time" },
                            applicationStatus: {
                                type: ["string", "null"],
                                enum: ["applied", "shortListed", "accepted", "rejected", null],
                            },
                        },
                    },
                },
                total: { type: "number" },
                page: { type: "number" },
                totalPages: { type: "number" },
                hasNextPage: { type: "boolean" },
                hasPrevPage: { type: "boolean" },
                savedCount: { type: "number" },
                maxAllowed: { type: "number" },
                subscription: { type: "string", enum: ["free", "premium"] },
            },
        },
    },
};

const checkSavedJobDto = {
    params: {
        type: "object",
        required: ["jobId"],
        properties: {
            jobId: {
                type: "string",
                pattern: "^[0-9a-fA-F]{24}$", // MongoDB ObjectId pattern
            },
        },
        additionalProperties: false,
    },
    response: {
        200: {
            type: "object",
            properties: {
                isSaved: { type: "boolean" },
                savedCount: { type: "number" },
                maxAllowed: { type: "number" },
                canSaveMore: { type: "boolean" },
            },
        },
    },
};

module.exports = { jobPostDto, idParam, jobFeedDto, cancelApplyJobDto, applyJobDto, checkSavedJobDto, getSavedJobsDto, saveJobDto };
