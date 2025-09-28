const fastify = require('fastify');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const Groq = require('groq-sdk');
const { roleAuth } = require('../../helper/roleAuth');

const dotenv = require("dotenv");
dotenv.config();


const groqApiKey = process.env.UNIKRU_CV_MAKER_GROQ_KEY;
const groqClient = groqApiKey ? new Groq({ apiKey: groqApiKey }) : null;


async function enhanceEducation(description, degree, school) {
  try {
    if (!groqClient) {
      console.log('Groq API key not found or client not initialized, using fallback enhancement for education');
      return enhanceEducationFallback(description, degree, school);
    }
    
    console.log('Using Groq API for education enhancement...');
    console.log('Input - Degree:', degree);
    console.log('Input - School:', school);
    console.log('Input - Description:', description);
    
    const prompt = `
    Analyze this education description and create bullet points based on the FULL description provided.
    
    Degree: "${degree}"
    School: "${school}"
    Original Description: "${description}"
    
    IMPORTANT: 
    - Use the ENTIRE description content, not just parts of it
    - Create as many bullet points as needed to capture ALL relevant information
    - Each bullet point should be concise but meaningful (6-10 words each)
    - Include specific GPA, honors, and achievements mentioned
    - Make each point clear and professional
    - Start with strong action verbs
    - Only include useful and relevant information
    
    Extract ALL key information from the full description:
    - GPA mentioned (3.8 GPA, 4.0 GPA, etc.)
    - Honors and awards (Dean's List, Magna Cum Laude, etc.)
    - Specific achievements and coursework
    - Relevant activities or projects
    - Any other academic accomplishments
    
    Return JSON with ALL relevant bullet points from the complete description:
    {
      "bullet_points": [
        "• [All relevant academic achievements]",
        "• [All relevant academic achievements]",
        "• [Add more if there are more relevant points]"
      ]
    }
    `;
    
    const response = await groqClient.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are a CV writer. Analyze the FULL education input provided and create as many concise but meaningful bullet points (6-10 words each) as needed to capture ALL relevant academic information. Return only JSON."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      model: "llama-3.1-8b-instant",
      max_tokens: 300,
      temperature: 0.3
    });
    
    console.log('Groq API response received successfully for education');
    
    if (response.choices && response.choices[0] && response.choices[0].message) {
      const content = response.choices[0].message.content.trim();
      console.log('AI Enhanced Education Content:', content);
      
      try {
        const parsedResponse = JSON.parse(content);
        
        if (parsedResponse.bullet_points) {
          console.log('Successfully parsed JSON response for education');
          return parsedResponse.bullet_points.join('\n');
        } else {
          throw new Error('Invalid JSON structure: missing bullet_points');
        }
      } catch (parseError) {
        console.error('Failed to parse JSON response for education:', parseError);
        return enhanceEducationFallback(description, degree, school);
      }
    } else {
      throw new Error('Invalid response format from Groq API for education');
    }
    
  } catch (error) {
    console.error('Error enhancing education with Groq:', error);
    return enhanceEducationFallback(description, degree, school);
  }
}

function enhanceEducationFallback(description, degree, school) {
  const sentences = description.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const actionVerbs = ['Studied', 'Completed', 'Achieved', 'Graduated', 'Maintained'];
  
  const enhanced = sentences.slice(0, 4).map((sentence, index) => {
    const trimmed = sentence.trim();
    if (trimmed.length === 0) return '';
    
    // Use the full sentence but make it concise
    const verb = actionVerbs[index % actionVerbs.length];
    
    // Clean up the sentence and make it concise
    let cleanSentence = trimmed.toLowerCase()
      .replace(/^i\s+/, '') // Remove "I" at the beginning
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .trim();
    
    return `• ${verb} ${cleanSentence}`;
  }).filter(item => item.length > 0);
  
  return enhanced.join('\n');
}

async function enhanceWorkExperience(description, position, company) {
  try {

    if (!groqClient) {
      console.log('Groq API key not found or client not initialized, using fallback enhancement');
      return enhanceWorkExperienceFallback(description, position, company);
    }
    
    console.log('Using Groq API for AI enhancement...');
    console.log('Input - Position:', position);
    console.log('Input - Company:', company);
    console.log('Input - Description:', description);
    
    const prompt = `
    Analyze this work experience and create bullet points based on the FULL description provided.
    
    Job Title: "${position}"
    Company: "${company}"
    Original Description: "${description}"
    
    IMPORTANT: 
    - Use the ENTIRE description content, not just parts of it
    - Create as many bullet points as needed to capture ALL relevant information
    - Each bullet point should be concise but meaningful (10-15 words each)
    - Include specific technologies, numbers, and achievements mentioned
    - Make each point clear and professional
    - Start with strong action verbs
    - Only include useful and relevant information
    
    Extract ALL key information from the full description:
    - Technologies used (React, Python, AWS, etc.)
    - Numbers and metrics (30%, 5 people, $50K, etc.)
    - Specific achievements and responsibilities
    - Team size or project scope mentioned
    - Any other relevant accomplishments
    
    Return JSON with ALL relevant bullet points from the complete description:
    {
      "bullet_points": [
        "• [All relevant achievements and responsibilities]",
        "• [All relevant achievements and responsibilities]",
        "• [All relevant achievements and responsibilities]",
        "• [Add more if there are more relevant points]"
      ]
    }
    `;
    
    const response = await groqClient.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are a CV writer. Analyze the FULL input provided and create as many concise but meaningful bullet points (10-15 words each) as needed to capture ALL relevant information. Return only JSON."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      model: "llama-3.1-8b-instant",
      max_tokens: 300,
      temperature: 0.3
    });
    
    console.log('Groq API response received successfully');
    console.log('Full API response:', JSON.stringify(response, null, 2));
    
    if (response.choices && response.choices[0] && response.choices[0].message) {
      const content = response.choices[0].message.content.trim();
      console.log('AI Enhanced Content:', content);
      
      try {

        const parsedResponse = JSON.parse(content);
        
        if (parsedResponse.bullet_points) {
          console.log('Successfully parsed JSON response');
          console.log('Bullet points:', parsedResponse.bullet_points);
          console.log('Summary:', parsedResponse.summary);
          
          return parsedResponse.bullet_points.join('\n');
        } else {
          throw new Error('Invalid JSON structure: missing bullet_points');
        }
      } catch (parseError) {
        console.error('Failed to parse JSON response:', parseError);
        console.log('Raw response:', content);
        

        const lines = content.split('\n').filter(line => line.trim());
        const descriptionLines = lines.filter(line => 
          /^\d+\./.test(line.trim()) || 
          line.includes('•') || 
          line.includes('-')
        );
        
        if (descriptionLines.length > 0) {
          console.log('Extracted description from non-JSON response');
          return descriptionLines.join('\n');
        } else {
          throw new Error('Could not extract valid description from response');
        }
      }
    } else {
      console.log('Invalid response structure:', response);
      throw new Error('Invalid response format from Groq API');
    }
    
  } catch (error) {
    console.error('Error enhancing work experience with Groq:', error);
    console.log('Falling back to simple enhancement...');

    return enhanceWorkExperienceFallback(description, position, company);
  }
}


function enhanceWorkExperienceFallback(description, position, company) {
  const sentences = description.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const actionVerbs = ['Managed', 'Developed', 'Led', 'Created', 'Improved', 'Built', 'Designed'];
  
  const enhanced = sentences.slice(0, 5).map((sentence, index) => {
    const trimmed = sentence.trim();
    if (trimmed.length === 0) return '';
    
    // Use the full sentence but make it concise
    const verb = actionVerbs[index % actionVerbs.length];
    
    // Clean up the sentence and make it concise
    let cleanSentence = trimmed.toLowerCase()
      .replace(/^i\s+/, '') // Remove "I" at the beginning
      .replace(/^i\s+/, '') // Remove "I" at the beginning
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .trim();
    
    return `• ${verb} ${cleanSentence}`;
  }).filter(item => item.length > 0);
  
  return enhanced.join('\n');
}


async function generatePDF(cvData, pdfId) {
  const tempDir = path.join(__dirname, '../../temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  const pdfPath = path.join(tempDir, `${pdfId}.pdf`);
  

  const doc = new PDFDocument({
    size: 'A4',
    margins: {
      top: 60,
      bottom: 60,
      left: 60,
      right: 60
    }
  });
  

  const stream = fs.createWriteStream(pdfPath);
  doc.pipe(stream);
  
  const { personalInfo, summary, experience, education, softSkills, hardSkills, certifications, languages } = cvData;
  

  const fonts = {
    name: { size: 16, weight: 'bold', color: '#1a1a1a' },        
    contact: { size: 8, weight: 'normal', color: '#4a4a4a' },  
    sectionHeader: { size: 10, weight: 'bold', color: '#2c3e50' }, 
    itemTitle: { size: 8, weight: 'bold', color: '#1a1a1a' },
    itemSubtitle: { size: 8, weight: 'normal', color: '#6c757d' },
    body: { size: 8, weight: 'normal', color: '#333333' },
    small: { size: 6.5, weight: 'normal', color: '#6c757d' }
  };


  const addText = (text, fontConfig = fonts.body, align = 'left') => {
    doc.fontSize(fontConfig.size);
    doc.fillColor(fontConfig.color);
    

    if (fontConfig.weight === 'bold') {
      doc.font('Times-Bold');
    } else {
      doc.font('Times-Roman');
    }
    

    const maxWidth = doc.page.width - 120;
    doc.text(text, { width: maxWidth, align: align });
  };

  const addSectionSeparator = () => {
    doc.moveDown(0.5);
    const startX = 60; // Left margin
    const endX = doc.page.width - 60; // Right margin
    const currentY = doc.y;
    
    doc.strokeColor('#e0e0e0')
       .lineWidth(1)
       .moveTo(startX, currentY)
       .lineTo(endX, currentY)
       .stroke();
    
    doc.moveDown(0.8);
  };


  const addSectionHeader = (title) => {
    doc.moveDown(1.0);
    addText(title, fonts.sectionHeader);
    doc.moveDown(0.3);
  };


  const endSection = () => {
    addSectionSeparator();
  };
  

  addText(personalInfo?.fullName || 'Professional CV', fonts.name, 'center');
  doc.moveDown(0.1);
  

  const contactInfo = [];
  if (personalInfo?.emails?.length > 0) {
    contactInfo.push(personalInfo.emails.map(email => email.value).join(', '));
  }
  if (personalInfo?.phones?.length > 0) {
    contactInfo.push(personalInfo.phones.map(phone => phone.value).join(', '));
  }
  if (personalInfo?.address) {
    contactInfo.push(personalInfo.address);
  }
  if (personalInfo?.dateOfBirth) {
    contactInfo.push(`DOB: ${personalInfo.dateOfBirth}`);
  }
  
  if (contactInfo.length > 0) {
    addText(contactInfo.join(' | '), fonts.contact, 'center');
  }
  
  doc.moveDown(1.0);
  

  if (summary) {
    addSectionHeader('PROFESSIONAL SUMMARY');
    addText(summary, fonts.body);
    endSection();
  }
  

  if (experience?.length > 0) {
    addSectionHeader('WORK EXPERIENCE');
    
    for (let i = 0; i < experience.length; i++) {
      const exp = experience[i];

      addText(exp.title || 'Position', fonts.itemTitle);
      

      addText(`${exp.company || 'Company'} | ${exp.startDate || ''} - ${exp.endDate || 'Present'}`, fonts.itemSubtitle);
      doc.moveDown(0.4);
      

      if (exp.description) {
        try {
          const bulletPoints = await enhanceWorkExperience(
            exp.description, 
            exp.title || 'Position', 
            exp.company || 'Company'
          );
          addText(bulletPoints, fonts.body);
        } catch (error) {
          console.error('Error enhancing work experience:', error);
          const fallbackPoints = exp.description.split(/[.!?]+/).filter(s => s.trim().length > 0)
            .map(sentence => `• ${sentence.trim()}`).join('\n');
          addText(fallbackPoints, fonts.body);
        }
      }
      
      doc.moveDown(0.8);
    }
    
    endSection();
  }
  
  // Education
  if (education?.length > 0) {
    addSectionHeader('EDUCATION');
    
    for (let i = 0; i < education.length; i++) {
      const edu = education[i];
      
      addText(`${edu.degree || 'Degree'} in ${edu.field || 'Field'}`, fonts.itemTitle);
      addText(`${edu.school || 'Institution'} | ${edu.startDate || ''} - ${edu.endDate || 'Present'}`, fonts.itemSubtitle);
      
      if (edu.gpa) {
        addText(`GPA: ${edu.gpa}`, fonts.small);
      }
      
      if (edu.description) {
        try {
          const bulletPoints = await enhanceEducation(
            edu.description, 
            edu.degree || 'Degree', 
            edu.school || 'Institution'
          );
          addText(bulletPoints, fonts.body);
        } catch (error) {
          console.error('Error enhancing education:', error);
          const fallbackPoints = edu.description.split(/[.!?]+/).filter(s => s.trim().length > 0)
            .map(sentence => `• ${sentence.trim()}`).join('\n');
          addText(fallbackPoints, fonts.body);
        }
      }
      
      doc.moveDown(0.8);
    }
    
    endSection();
  }
  
  // Soft Skills Section
  if (softSkills?.length > 0) {
    addSectionHeader('SOFT SKILLS');
    
    softSkills.forEach(skill => {
      const skillText = `• ${skill.name} (${skill.level})`;
      addText(skillText, fonts.body);
    });
    
    endSection();
  }
  
  // Hard Skills Section
  if (hardSkills?.length > 0) {
    addSectionHeader('HARD SKILLS');
    
    hardSkills.forEach(skill => {
      const skillText = `• ${skill.name} (${skill.level})`;
      addText(skillText, fonts.body);
    });
    
    endSection();
  }
  
  // Certifications
  if (certifications?.length > 0) {
    addSectionHeader('CERTIFICATIONS');
    
    certifications.forEach(cert => {
      addText(cert.name || 'Certification', fonts.itemTitle);
      addText(`${cert.issuer || 'Issuer'} | ${cert.date || 'Date'}`, fonts.itemSubtitle);
      
      if (cert.description) {
        addText(cert.description, fonts.body);
      }
      
      doc.moveDown(0.8);
    });
    
    endSection();
  }
  
  // Languages
  if (languages?.length > 0) {
    addSectionHeader('LANGUAGES');
    
    languages.forEach(lang => {
      const languageText = `• ${lang.name} (${lang.proficiency})`;
      addText(languageText, fonts.body);
    });
    
    endSection();
  }
  
  // Finalize the PDF
  doc.end();
  
  // Wait for the stream to finish
  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
  
  // Verify the generated PDF
  const fileBuffer = fs.readFileSync(pdfPath);
  const isPDF = fileBuffer.toString('hex', 0, 4) === '25504446'; // PDF magic number
  
  console.log(`PDF generated successfully: ${pdfPath}`);
  console.log(`File size: ${fs.statSync(pdfPath).size} bytes`);
  console.log(`Is valid PDF: ${isPDF}`);
  
  if (!isPDF) {
    console.error('ERROR: Generated file is not a valid PDF!');
    throw new Error('Generated file is not a valid PDF');
  }
  
  return pdfPath;
}

// Generate HTML content for CV
function generateCVHTML(cvData) {
  const { personalInfo, summary, experience, education, softSkills, hardSkills, certifications, languages } = cvData;
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>CV - ${personalInfo?.fullName || 'Professional CV'}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
        .header { text-align: center; margin-bottom: 30px; }
        .name { font-size: 28px; font-weight: bold; margin-bottom: 10px; }
        .contact { font-size: 14px; color: #666; }
        .section { margin-bottom: 25px; }
        .section-title { font-size: 18px; font-weight: bold; border-bottom: 2px solid #333; padding-bottom: 5px; margin-bottom: 15px; }
        .item { margin-bottom: 15px; }
        .item-title { font-weight: bold; font-size: 16px; }
        .item-subtitle { color: #666; font-size: 14px; margin-bottom: 5px; }
        .item-description { margin-top: 5px; }
        .skills-list { 
          list-style: none; 
          padding: 0; 
          margin: 0; 
        }
        .skills-list li { 
          margin-bottom: 4px; 
          font-size: 12px; 
        }
        .skills-row { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 8px; }
        .skill-tag { background: #f0f0f0; padding: 5px 10px; border-radius: 15px; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="name">${personalInfo?.fullName || 'Your Name'}</div>
        <div class="contact">
          ${personalInfo?.emails?.map(email => email.value).join(' | ') || ''}
          ${personalInfo?.phones?.map(phone => phone.value).join(' | ') || ''}
        </div>
        ${personalInfo?.address ? `<div class="contact">${personalInfo.address}</div>` : ''}
      </div>
      
      ${summary ? `
        <div class="section">
          <div class="section-title">Professional Summary</div>
          <div>${summary}</div>
        </div>
      ` : ''}
      
      ${experience?.length > 0 ? `
        <div class="section">
          <div class="section-title">Work Experience</div>
          ${experience.map(exp => `
            <div class="item">
              <div class="item-title">${exp.title || 'Position'}</div>
              <div class="item-subtitle">${exp.company || 'Company'} | ${exp.startDate || ''} - ${exp.endDate || 'Present'}</div>
              ${exp.description ? `<div class="item-description">${exp.description}</div>` : ''}
            </div>
          `).join('')}
        </div>
      ` : ''}
      
      ${education?.length > 0 ? `
        <div class="section">
          <div class="section-title">Education</div>
          ${education.map(edu => `
            <div class="item">
              <div class="item-title">${edu.degree || 'Degree'} in ${edu.field || 'Field'}</div>
              <div class="item-subtitle">${edu.school || 'Institution'} | ${edu.startDate || ''} - ${edu.endDate || 'Present'}</div>
              ${edu.gpa ? `<div class="item-description">GPA: ${edu.gpa}</div>` : ''}
              ${edu.description ? `<div class="item-description">${edu.description}</div>` : ''}
            </div>
          `).join('')}
        </div>
      ` : ''}
      
      ${softSkills?.length > 0 ? `
        <div class="section">
          <div class="section-title">Soft Skills</div>
          <ul class="skills-list">
            ${softSkills.map(skill => `<li>${skill.name} (${skill.level})</li>`).join('')}
          </ul>
        </div>
      ` : ''}
      
      ${hardSkills?.length > 0 ? `
        <div class="section">
          <div class="section-title">Hard Skills</div>
          <ul class="skills-list">
            ${hardSkills.map(skill => `<li>${skill.name} (${skill.level})</li>`).join('')}
          </ul>
        </div>
      ` : ''}
      
      ${certifications?.length > 0 ? `
        <div class="section">
          <div class="section-title">Certifications</div>
          ${certifications.map(cert => `
            <div class="item">
              <div class="item-title">${cert.name || 'Certification'}</div>
              <div class="item-subtitle">${cert.issuer || 'Issuer'} | ${cert.date || 'Date'}</div>
              ${cert.description ? `<div class="item-description">${cert.description}</div>` : ''}
            </div>
          `).join('')}
        </div>
      ` : ''}
      
      ${languages?.length > 0 ? `
        <div class="section">
          <div class="section-title">Languages</div>
          <ul class="skills-list">
            ${languages.map(lang => `<li>${lang.name} (${lang.proficiency})</li>`).join('')}
          </ul>
        </div>
      ` : ''}
    </body>
    </html>
  `;
}


module.exports = async function cvRoutes(fastify, options) {
  // Submit CV data
  fastify.post(
    '/submit',
    {
      preHandler: roleAuth(['admin']), // Require user or admin authentication
      schema: {
        body: {
          type: 'object',
          required: ['cvData'],
          properties: {
            cvData: {
              type: 'object',
              properties: {
                personalInfo: {
                  type: 'object',
                  properties: {
                    fullName: { type: 'string' },
                    dateOfBirth: { type: 'string' },
                    emails: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          value: { type: 'string' },
                          id: { type: 'number' }
                        }
                      }
                    },
                    phones: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          value: { type: 'string' },
                          id: { type: 'number' }
                        }
                      }
                    },
                    address: { type: 'string' },
                    socialMedia: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          type: { type: 'string' },
                          url: { type: 'string' },
                          id: { type: 'number' }
                        }
                      }
                    }
                  }
                },
                summary: { type: 'string' },
                experience: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      title: { type: 'string' },
                      company: { type: 'string' },
                      startDate: { type: 'string' },
                      endDate: { type: 'string' },
                      description: { type: 'string' }
                    }
                  }
                },
                education: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      school: { type: 'string' },
                      degree: { type: 'string' },
                      field: { type: 'string' },
                      startDate: { type: 'string' },
                      endDate: { type: 'string' },
                      gpa: { type: 'string' },
                      description: { type: 'string' }
                    }
                  }
                },
                softSkills: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      level: { type: 'string' }
                    }
                  }
                },
                hardSkills: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      level: { type: 'string' }
                    }
                  }
                },
                certifications: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      issuer: { type: 'string' },
                      date: { type: 'string' },
                      description: { type: 'string' }
                    }
                  }
                },
                languages: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      proficiency: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    async (req, res) => {
      try {
        const { cvData } = req.body;
        const userId = req.user?.id || 'anonymous';
        
        console.log('=== CV SUBMISSION ===');
        console.log('User ID:', userId);
        console.log('CV Data received:', JSON.stringify(cvData, null, 2));
        
        // Log each section
        console.log('\n--- Personal Information ---');
        console.log('Full Name:', cvData.personalInfo?.fullName);
        console.log('Date of Birth:', cvData.personalInfo?.dateOfBirth);
        console.log('Emails:', cvData.personalInfo?.emails);
        console.log('Phones:', cvData.personalInfo?.phones);
        console.log('Address:', cvData.personalInfo?.address);
        console.log('Social Media:', cvData.personalInfo?.socialMedia);
        
        console.log('\n--- Professional Summary ---');
        console.log('Summary:', cvData.summary);
        
        console.log('\n--- Work Experience ---');
        cvData.experience?.forEach((exp, index) => {
          console.log(`Experience ${index + 1}:`);
          console.log('  Title:', exp.title);
          console.log('  Company:', exp.company);
          console.log('  Period:', exp.startDate, 'to', exp.endDate);
          console.log('  Description:', exp.description);
        });
        
        console.log('\n--- Education ---');
        cvData.education?.forEach((edu, index) => {
          console.log(`Education ${index + 1}:`);
          console.log('  School:', edu.school);
          console.log('  Degree:', edu.degree);
          console.log('  Field:', edu.field);
          console.log('  Period:', edu.startDate, 'to', edu.endDate);
          console.log('  GPA:', edu.gpa);
          console.log('  Description:', edu.description);
        });
        
        console.log('\n--- Soft Skills ---');
        cvData.softSkills?.forEach((skill, index) => {
          console.log(`Soft Skill ${index + 1}:`, skill.name, '- Level:', skill.level);
        });
        
        console.log('\n--- Hard Skills ---');
        cvData.hardSkills?.forEach((skill, index) => {
          console.log(`Hard Skill ${index + 1}:`, skill.name, '- Level:', skill.level);
        });
        
        console.log('\n--- Certifications ---');
        cvData.certifications?.forEach((cert, index) => {
          console.log(`Certification ${index + 1}:`);
          console.log('  Name:', cert.name);
          console.log('  Issuer:', cert.issuer);
          console.log('  Date:', cert.date);
          console.log('  Description:', cert.description);
        });
        
        console.log('\n--- Languages ---');
        cvData.languages?.forEach((lang, index) => {
          console.log(`Language ${index + 1}:`, lang.name, '- Proficiency:', lang.proficiency);
        });
        
        console.log('\n=== END CV SUBMISSION ===\n');
        
        // Generate PDF
        const pdfId = crypto.randomUUID();
        const pdfPath = await generatePDF(cvData, pdfId);
        
        // Schedule cleanup after 10 minutes
        setTimeout(() => {
          try {
            if (fs.existsSync(pdfPath)) {
              fs.unlinkSync(pdfPath);
              console.log(`PDF ${pdfId} deleted after 10 minutes`);
            }
          } catch (error) {
            console.error(`Error deleting PDF ${pdfId}:`, error);
          }
        }, 10 * 60 * 1000); // 10 minutes
        
        // Get the base URL from the request
        const protocol = req.protocol || 'http';
        const host = req.headers.host || 'localhost:4001';
        const baseUrl = `${protocol}://${host}`;
        const downloadUrl = `${baseUrl}/cv/download/${pdfId}`;
        
        console.log('=== PDF GENERATION COMPLETE ===');
        console.log('PDF ID:', pdfId);
        console.log('Download URL:', downloadUrl);
        console.log('PDF Path:', pdfPath);
        console.log('File exists:', fs.existsSync(pdfPath));
        console.log('File size:', fs.statSync(pdfPath).size, 'bytes');
        
        res.send({
          success: true,
          message: 'CV data received and PDF generated successfully',
          timestamp: new Date().toISOString(),
          userId: userId,
          dataSize: JSON.stringify(cvData).length,
          pdfId: pdfId,
          downloadUrl: downloadUrl
        });
        
      } catch (error) {
        console.error('Error processing CV submission:', error);
        res.code(500).send({
          success: false,
          message: 'Failed to process CV submission',
          error: error.message
        });
      }
    }
  );

  // Download PDF route
  fastify.get(
    '/download/:pdfId',
    {
      preHandler: roleAuth(['user', 'admin']), // Require user or admin authentication
    },
    async (req, res) => {
      try {
        const { pdfId } = req.params;
        const pdfPath = path.join(__dirname, '../../temp', `${pdfId}.pdf`);
        
        console.log(`Attempting to download PDF: ${pdfPath}`);
        
        if (!fs.existsSync(pdfPath)) {
          console.log('PDF file not found:', pdfPath);
          return res.code(404).send({
            success: false,
            message: 'PDF not found or expired'
          });
        }
        
        // Verify it's actually a PDF file
        const fileBuffer = fs.readFileSync(pdfPath);
        const isPDF = fileBuffer.toString('hex', 0, 4) === '25504446'; // PDF magic number
        
        console.log(`File exists: ${fs.existsSync(pdfPath)}`);
        console.log(`File size: ${fs.statSync(pdfPath).size} bytes`);
        console.log(`Is valid PDF: ${isPDF}`);
        
        if (!isPDF) {
          console.error('Warning: File is not a valid PDF!');
          return res.code(400).send({
            success: false,
            message: 'Invalid PDF file'
          });
        }
        
        // Set proper headers for PDF download
        res.header('Content-Type', 'application/pdf');
        res.header('Content-Disposition', `attachment; filename="CV_${pdfId}.pdf"`);
        res.header('Content-Length', fileBuffer.length);
        res.header('Cache-Control', 'no-cache');
        
        // Send the file as binary data
        res.send(fileBuffer);
        
      } catch (error) {
        console.error('Error downloading PDF:', error);
        res.code(500).send({
          success: false,
          message: 'Failed to download PDF',
          error: error.message
        });
      }
    }
  );
};
