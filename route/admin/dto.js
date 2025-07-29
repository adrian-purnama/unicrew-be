// dto/adminDto.js

const industryDto = {
  body: {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string' }
    },
    additionalProperties: false
  }
};

const skillDto = {
  body: {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string' }
    },
    additionalProperties: false
  }
};

const provinsiDto = {
  body: {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string' }
    },
    additionalProperties: false
  }
};

const kabupatenDto = {
  body: {
    type: 'object',
    required: ['name', 'provinsi'],
    properties: {
      name: { type: 'string' },
      provinsi: { type: 'string' }
    },
    additionalProperties: false
  }
};

const kecamatanDto = {
  body: {
    type: 'object',
    required: ['name', 'kabupaten'],
    properties: {
      name: { type: 'string' },
      kabupaten: { type: 'string' }
    },
    additionalProperties: false
  }
};

const kelurahanDto = {
  body: {
    type: 'object',
    required: ['name', 'kecamatan'],
    properties: {
      name: { type: 'string' },
      kecamatan: { type: 'string' }
    },
    additionalProperties: false
  }
};

module.exports = {
  industryDto,
  skillDto,
  provinsiDto,
  kabupatenDto,
  kecamatanDto,
  kelurahanDto
};
