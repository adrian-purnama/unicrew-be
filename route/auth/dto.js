// routes/dto.js

const objectId = { type: "string", pattern: "^[a-f\\d]{24}$" };

const AdminRegisterDto = {
  body: {
    type: "object",
    required: ["email", "password"],
    properties: {
      email: { type: "string", format: "email", maxLength: 50 },
      password: { type: "string", minLength: 6 },
    },
    additionalProperties: false,
  },
};

const UserRegisterDto = {
  body: {
    type: "object",
    required: [
      "fullName",
      "birthDate",
      "email",
      "password",
      "universityId",
      "studyProgramId",
      "externalSystemId",
      "verificationToken",
    ],
    properties: {
      fullName: { type: "string", minLength: 1 },
      birthDate: { type: "string", format: "date" },
      email: {
        type: "string",
        format: "email",
        pattern: ".*\\.(ac\\.id|edu)$",
        maxLength: 50,
      },
      password: { type: "string", minLength: 6 },
      universityId: objectId,
      studyProgramId: objectId,
      externalSystemId: { type: "string" },
      verificationToken: { type: "string", minLength: 10 },

      // optional location if you send it during signup
      provinsiId: objectId,
      kabupatenId: objectId,
      kecamatanId: objectId,

      // optional arrays
      industries: {
        type: "array",
        items: objectId,
        minItems: 0,
        maxItems: 3,
      },
    },
    additionalProperties: false,
  },
};

const CompanyRegisterDto = {
  body: {
    type: "object",
    required: ["companyName", "industries", "email", "password", "location", "verificationToken"],
    properties: {
      companyName: { type: "string", minLength: 1 },
      industries: {
        type: "array",
        items: objectId,
        minItems: 1,
        maxItems: 3,
      },
      description: { type: "string", maxLength: 200 },
      location: {
        type: "object",
        required: ["provinsiId", "kabupatenId", "kecamatanId"],
        properties: {
          provinsiId: objectId,
          kabupatenId: objectId,
          kecamatanId: objectId,
        },
        additionalProperties: false,
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
      email: { type: "string", format: "email", maxLength: 50 },
      password: { type: "string", minLength: 6 },
      verificationToken: { type: "string", minLength: 10 },
    },
    additionalProperties: false,
  },
};

const LoginDto = {
  body: {
    type: "object",
    required: ["email", "password", "role"],
    properties: {
      email: { type: "string", format: "email", maxLength: 50 },
      password: { type: "string", minLength: 6 },
      role: { type: "string", enum: ["user", "company", "admin"] },
    },
    additionalProperties: false,
  },
};

const VerifyEmailDto = {
  body: {
    type: "object",
    required: ["email", "otp", "role"],
    properties: {
      email: { type: "string", format: "email", maxLength: 50 },
      otp: { type: "string", minLength: 6 },
      role: { type: "string", enum: ["user", "company", "admin"] },
    },
    additionalProperties: false,
  },
};

/**
 * Reverify can be by:
 *  - token only, OR
 *  - email + role
 */
const ReverifyDto = {
  body: {
    oneOf: [
      {
        type: "object",
        required: ["token"],
        properties: {
          token: { type: "string", minLength: 10 },
        },
        additionalProperties: false,
      },
      {
        type: "object",
        required: ["email", "role"],
        properties: {
          email: { type: "string", format: "email", maxLength: 50 },
          role: { type: "string", enum: ["user", "company", "admin"] },
        },
        additionalProperties: false,
      },
    ],
  },
};

const ForgotPasswordDto = {
  body: {
    type: "object",
    required: ["email", "role"],
    properties: {
      email: { type: "string", format: "email", maxLength: 50 },
      role: { type: "string", enum: ["user", "company", "admin"] },
    },
    additionalProperties: false,
  },
};

const ResetPasswordDto = {
  body: {
    type: "object",
    required: ["email", "role", "token", "newPassword"],
    properties: {
      email: { type: "string", format: "email", maxLength: 50 },
      role: { type: "string", enum: ["user", "company", "admin"] },
      token: { type: "string", minLength: 6 },
      newPassword: { type: "string", minLength: 6 },
    },
    additionalProperties: false,
  },
};

const SendVerificationCodeDto = {
  body: {
    type: "object",
    required: ["email", "role"],
    properties: {
      email: { type: "string", format: "email", maxLength: 50 },
      role: { type: "string", enum: ["user", "company"] },
    },
    additionalProperties: false,
  },
};

const VerifyEmailCodeDto = {
  body: {
    type: "object",
    required: ["email", "role", "otp"],
    properties: {
      email: { type: "string", format: "email", maxLength: 50 },
      role: { type: "string", enum: ["user", "company"] },
      otp: { type: "string", minLength: 6, maxLength: 6 },
    },
    additionalProperties: false,
  },
};

module.exports = {
  AdminRegisterDto,
  UserRegisterDto,
  CompanyRegisterDto,
  LoginDto,
  VerifyEmailDto,
  ReverifyDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  SendVerificationCodeDto,
  VerifyEmailCodeDto,
};
