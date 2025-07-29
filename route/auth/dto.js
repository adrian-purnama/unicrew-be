const emailPasswordDto = {
    body: {
        type: "object",
        required: ["email", "password"],
        properties: {
            email: { format: "email", type: "string" },
            password: { type: "string", minLength: 6 },
        },
        additionalProperties: false,
    },
};

const verifyEmailDto = {
    body: {
        type: "object",
        required: ["email", "otp", "role"],
        properties: {
            email: { format: "email", type: "string" },
            otp: { type: "string", minLength: 6 },
            role: { type: "string" },
        },
    },
};

const userRegisterDto = {
    body: {
        type: "object",
        required: ["fullName", "birthDate", "email", "password", "university", "studyProgram", "externalSystemId"],
        properties: {
            fullName: { type: "string", minLength: 1 },
            birthDate: { type: "string", format: "date" },
            email: {
                type: "string",
                format: "email",
                pattern: ".*\\.(ac\\.id|edu)$", //validation
            },
            password: { type: "string", minLength: 6 },
            university: { type: "string", pattern: "^[a-f\\d]{24}$" },
            studyProgram: { type: "string", pattern: "^[a-f\\d]{24}$" },
            externalSystemId: { type: "string" },
        },
        additionalProperties: false,
    },
};

const companyRegisterDto = {
    body: {
        type: "object",
        required: ["companyName", "industries", "email", "password", "location"],
        properties: {
            companyName: { type: "string", minLength: 1 },
            industries: {
                type: "array",
                items: {
                    type: "string",
                    pattern: "^[a-f\\d]{24}$",
                },
                minItems: 1,
                maxItems: 3,
            },
            description: { type: "string" },

            location: {
                type: "object",
                required: ["provinsi", "kabupaten", "kecamatan"],
                properties: {
                    provinsi: { type: "string", pattern: "^[a-f\\d]{24}$" },
                    kabupaten: { type: "string", pattern: "^[a-f\\d]{24}$" },
                    kecamatan: { type: "string", pattern: "^[a-f\\d]{24}$" },
                },
            },

            socialLinks: {
                type: "object",
                properties: {
                    website: { type: "string" },
                    instagram: { type: "string" },
                    twitter: { type: "string" },
                    linkedin: { type: "string" },
                },
                additionalProperties: false,
            },

            email: {
                type: "string",
                format: "email",
            },
            password: {
                type: "string",
                minLength: 6,
            },
        },
        additionalProperties: false,
    },
};

const loginDto = {
  body: {
    type: 'object',
    required: ['email', 'password', 'role'],
    properties: {
      email: { type: 'string', format: 'email' },
      password: { type: 'string', minLength: 6 },
      role: { type: 'string', enum: ['user', 'company', 'admin'] }
    },
    additionalProperties: false
  }
};

const emailRoleDto = {
    body : {
        type : "object",
        required : ["email", "role"],
        properties : {
            email : {format : "email", type : "string"},
            role : {type : "string"}
        }
    }
}

module.exports = {
    emailPasswordDto,
    userRegisterDto,
    verifyEmailDto,
    userRegisterDto,
    companyRegisterDto,
    emailRoleDto,
    loginDto
};
