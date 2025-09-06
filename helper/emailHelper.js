const nodemailer = require("nodemailer");
const dotenv = require("dotenv");

dotenv.config();

const mailUser = process.env.GMAIL_USER;      
const mailPassword = process.env.GMAIL_PASSWORD;
const feLink = process.env.FE_LINK

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: mailUser,
    pass: mailPassword
  }
});

/**
 * Sends a basic email using Nodemailer.
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} html - Email HTML content
 */
const sendEmail = async (to, subject, html) => {
  const mailOptions = {
    from: `"Unicru" <${mailUser}>`,
    to,
    subject,
    html
  };

  return transporter.sendMail(mailOptions);
};

/**
 * Sends an account verification email with a link containing the OTP token.
 * @param {string} targetEmail - The recipient's email address.
 * @param {string} otp - The OTP token to be used in the verification URL.
 */
const sendVerifyEmail = async (targetEmail, otp, role) => {
  try {
    console.log(`sending email to ${targetEmail}`);
    const verifyLink = `${feLink}/verify?email=${targetEmail}&token=${otp}&role=${role}`;

    const subject = 'Verify Your Account';
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>Welcome to Unicru 🎓</h2>
        <p>Please verify your email by clicking the button below:</p>
        <a href="${verifyLink}" style="
          display: inline-block;
          background-color: #4CAF50;
          color: white;
          padding: 10px 20px;
          text-decoration: none;
          border-radius: 5px;
          font-weight: bold;
        ">Verify Email</a>
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p><a href="${verifyLink}">${verifyLink}</a></p>
      </div>
    `;

    await sendEmail(targetEmail, subject, html);
  } catch (error) {
    console.error('❌ Error sending verification email:', error.message);
    throw new Error(error.message);
  }
};

/**
 * Sends a forgot password email with a link containing the reset token.
 * @param {string} targetEmail - The recipient's email address.
 * @param {string} token - The token to be used in the reset password URL.
 * @param {string} role - The role of the user (optional, if needed in the frontend).
 */
const sendForgotPasswordEmail = async (targetEmail, token, role) => {
  try {
    console.log(`sending forgot password email to ${targetEmail}`);
    const resetLink = `${feLink}/reset-password?email=${targetEmail}&token=${token}&role=${role}`;

    const subject = 'Reset Your Password';
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>Unicru Password Reset Request 🔒</h2>
        <p>We received a request to reset your password.</p>
        <p>If you made this request, click the button below to reset your password:</p>
        <a href="${resetLink}" style="
          display: inline-block;
          background-color: #FF5722;
          color: white;
          padding: 10px 20px;
          text-decoration: none;
          border-radius: 5px;
          font-weight: bold;
        ">Reset Password</a>
        <p>If you didn’t request this, you can ignore this email.</p>
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p><a href="${resetLink}">${resetLink}</a></p>
      </div>
    `;

    await sendEmail(targetEmail, subject, html);
  } catch (error) {
    console.error('❌ Error sending forgot password email:', error.message);
    throw new Error('Failed to send forgot password email.');
  }
};

const sendApplicantStatusEmail = async (targetEmail, status, jobTitle, ctaUrl) => {
  if (!["shortListed", "accepted"].includes(status)) return;

  const isShortlisted = status === "shortListed";
  const subject = isShortlisted
    ? `You're shortlisted for ${jobTitle} 🎉`
    : `You're accepted for ${jobTitle} ✅`;

  const safeCta = ctaUrl || `${feLink}/user`;

  const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h2>${isShortlisted ? "Great news!" : "Congratulations!"}</h2>
      <p>
        You have been <strong>${isShortlisted ? "shortlisted" : "accepted"}</strong>
        for the position: <strong>${jobTitle}</strong>.
      </p>
      <p>
        ${isShortlisted
          ? "The company would like to move you forward. Please review the next steps."
          : "You're moving to the final stage. Please review your next steps."}
      </p>
      <a href="${safeCta}" style="
        display: inline-block;
        background-color: ${isShortlisted ? "#2563EB" : "#16A34A"};
        color: #fff;
        padding: 10px 16px;
        text-decoration: none;
        border-radius: 6px;
        font-weight: 600;
      ">View Application</a>
      <p style="margin-top: 10px; font-size: 14px;">
        Or open this link: <a href="${safeCta}">${safeCta}</a>
      </p>
    </div>
  `;

  await sendEmail(targetEmail, subject, html);
};

/**
 * Send an admin-approval email to the approver (masterEmail).
 * The verify link encodes the *applicant* email and the OTP, with role=admin.
 *
 * @param {string} targetEmail - the applicant's email requesting admin access
 * @param {string} otp         - one-time token you generated (e.g., createOtp(adminId))
 * @param {string} [masterEmail=process.env.ADMIN_APPROVER_EMAIL] - where to send approval
 */
const sendAdminApprovalEmail = async (targetEmail, otp, masterEmail) => {
  try {
    if (!masterEmail) throw new Error("ADMIN_APPROVER_EMAIL not configured");
    if (!feLink) throw new Error("feLink not configured");

    const approveLink = `${feLink}/verify?email=${encodeURIComponent(targetEmail)}&token=${encodeURIComponent(otp)}&role=admin&decision=approve`;

    const subject = "Unicru — Admin Access Request";
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>Admin Access Request</h2>
        <p><strong>${targetEmail}</strong> is requesting <b>admin</b> access.</p>

        <div style="margin:16px 0;">
          <a href="${approveLink}" style="
            display:inline-block; background-color:#2563eb; color:#fff; padding:10px 16px;
            text-decoration:none; border-radius:6px; font-weight:600;
          ">Approve Admin</a>
        </div>

        <p>If the button doesn't work, copy this link:</p>
        <p style="word-break:break-all; margin:8px 0;">
          <a href="${approveLink}">${approveLink}</a>
        </p>

        <hr style="border:none; border-top:1px solid #ddd; margin:20px 0;" />
        <small>You received this because you're listed as an admin approver.</small>
      </div>
    `;

    console.log(`sending admin approval email for ${targetEmail} -> ${masterEmail}`);
    await sendEmail(masterEmail, subject, html);
  } catch (error) {
    console.error("❌ Error sending admin approval email:", error.message);
    throw new Error(error.message);
  }
};

const sendAdminVerifiedEmail = async (targetEmail) => {
  if (!feLink) throw new Error("feLink not configured");

  const loginUrl = `${feLink}/auth/admin/login`;
  const subject = "Unicru — Your admin access is approved";
  const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h2>Admin Access Approved ✅</h2>
      <p>Hello, your <strong>Unicru Admin</strong> access has been approved.</p>
      <p>You can now log in using the button below:</p>

      <div style="margin:16px 0;">
        <a href="${loginUrl}" style="
          display:inline-block; background-color:#2563eb; color:#fff; padding:10px 16px;
          text-decoration:none; border-radius:6px; font-weight:600;
        ">Go to Admin Login</a>
      </div>

      <p>If the button doesn't work, open this link:</p>
      <p style="word-break:break-all; margin:8px 0;">
        <a href="${loginUrl}">${loginUrl}</a>
      </p>

      <hr style="border:none; border-top:1px solid #ddd; margin:20px 0;" />
      <small>This email was sent because an admin approver verified your account.</small>
    </div>
  `;

  await sendEmail(targetEmail, subject, html);
};
module.exports = { sendVerifyEmail, sendForgotPasswordEmail, sendApplicantStatusEmail, sendAdminApprovalEmail,sendAdminVerifiedEmail};
