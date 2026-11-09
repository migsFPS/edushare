/**
 * EduShare Real Gmail Email Delivery Service
 * 
 * ============================================================================
 * OFFICIAL EDUSHARE CONFIGURATION (Phase 2):
 * ============================================================================
 * Official Gmail Address: edushare12@gmail.com
 * SMTP Host: smtp.gmail.com
 * SMTP Port: 465 (SSL/TLS)
 * Sender: EduShare <edushare12@gmail.com>
 * 
 * IMPORTANT:
 * - edushare12@gmail.com is strictly the SENDER.
 * - Recipient is the registered user's email (student or teacher).
 * - App Password must be configured in .env (never hardcoded, never logged).
 * ============================================================================
 */

const nodemailer = require('nodemailer');
const config = require('../config/env');

let transporterInstance = null;

/**
 * Returns a configured Nodemailer transporter using Gmail SSL SMTP.
 */
function getTransporter() {
  if (transporterInstance) {
    return transporterInstance;
  }

  transporterInstance = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure, // true for port 465 (SSL)
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass
    },
    tls: {
      rejectUnauthorized: true
    }
  });

  return transporterInstance;
}

/**
 * Validates the SMTP connection with Gmail.
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
async function verifySmtpConnection() {
  if (!config.smtp.pass) {
    return {
      ok: false,
      message: 'SMTP_PASS is not configured in .env. A Gmail App Password is required.'
    };
  }

  try {
    const transporter = getTransporter();
    await transporter.verify();
    return { ok: true, message: 'Gmail SMTP connection verified successfully.' };
  } catch (err) {
    return {
      ok: false,
      message: `Gmail SMTP authentication failed: ${err.message}`
    };
  }
}

/**
 * Sends a branded verification email to a newly registered student or teacher.
 * 
 * @param {string} toEmail User's registered email
 * @param {string} rawToken Unhashed 32-byte hexadecimal verification token
 * @param {string} [recipientName] User's full name
 * @returns {Promise<{ messageId: string, recipient: string }>}
 */
async function sendVerificationEmail(toEmail, rawToken, recipientName = '') {
  if (!config.smtp.pass) {
    const errorMsg = 'Cannot send verification email: SMTP_PASS is missing in .env. Please configure your 16-character Gmail App Password.';
    console.error(`[EduShare EmailService] ${errorMsg}`);
    throw new Error(errorMsg);
  }

  const verificationUrl = `${config.frontendUrl}/verify-email?token=${encodeURIComponent(rawToken)}`;
  const displayName = recipientName ? ` ${recipientName}` : '';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your EduShare Account</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f4f7fc;
      font-family: Arial, Helvetica, sans-serif;
      color: #142b54;
      line-height: 1.6;
    }
    .wrapper {
      width: 100%;
      background-color: #f4f7fc;
      padding: 40px 15px;
    }
    .card {
      max-width: 580px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 14px;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(6, 38, 95, 0.08);
      border: 1px solid #d5deed;
    }
    .header {
      background: linear-gradient(135deg, #031c49 0%, #06265f 100%);
      padding: 30px 40px;
      text-align: center;
      color: #ffffff;
    }
    .brand-mark {
      display: inline-block;
      width: 44px;
      height: 44px;
      line-height: 44px;
      background: #ffc400;
      color: #06265f;
      font-weight: 800;
      font-size: 20px;
      border-radius: 8px;
      margin-bottom: 12px;
    }
    .brand-title {
      font-size: 24px;
      font-weight: 700;
      letter-spacing: 0.5px;
      margin: 0;
    }
    .brand-sub {
      font-size: 11px;
      color: #ffc400;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      margin-top: 4px;
    }
    .content {
      padding: 36px 40px;
      color: #142b54;
    }
    .greeting {
      font-size: 20px;
      font-weight: 700;
      color: #06265f;
      margin-bottom: 16px;
    }
    .text {
      font-size: 15px;
      color: #334e68;
      margin-bottom: 20px;
    }
    .btn-container {
      text-align: center;
      margin: 32px 0;
    }
    .verify-btn {
      display: inline-block;
      background: #087ed0;
      color: #ffffff !important;
      text-decoration: none;
      font-size: 16px;
      font-weight: 700;
      padding: 14px 34px;
      border-radius: 8px;
      letter-spacing: 0.5px;
    }
    .verify-btn:hover {
      background: #06265f;
    }
    .expiration-note {
      font-size: 13px;
      color: #627d98;
      background: #f0f4f8;
      border-left: 4px solid #ffc400;
      padding: 12px 16px;
      border-radius: 4px;
      margin-bottom: 24px;
    }
    .backup-box {
      margin-top: 24px;
      padding-top: 20px;
      border-top: 1px solid #e2e8f0;
      font-size: 12px;
      color: #627d98;
      word-break: break-all;
    }
    .footer {
      background-color: #f8fafc;
      padding: 20px 40px;
      text-align: center;
      font-size: 12px;
      color: #829ab1;
      border-top: 1px solid #e2e8f0;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <div class="brand-mark">UA</div>
        <div class="brand-title">EduShare</div>
        <div class="brand-sub">University of the Assumption</div>
      </div>
      <div class="content">
        <div class="greeting">Hello${displayName}!</div>
        <p class="text">Welcome to EduShare!</p>
        <p class="text">Thank you for creating your account.</p>
        <p class="text">To activate your account and start using EduShare, please verify your email address by clicking the button below.</p>
        
        <div class="btn-container">
          <a href="${verificationUrl}" class="verify-btn" target="_blank" rel="noopener">VERIFY MY ACCOUNT</a>
        </div>
        
        <div class="expiration-note">
          Your verification link expires after <strong>24 hours</strong>.
        </div>
        
        <p class="text" style="font-size: 13px; color: #627d98;">
          If you did not create this account, you can safely ignore this email.
        </p>
        
        <div class="backup-box">
          <strong>Button not working?</strong> Copy and paste this URL into your browser:<br>
          <a href="${verificationUrl}" style="color: #087ed0;">${verificationUrl}</a>
        </div>
      </div>
      <div class="footer">
        <p style="margin: 0 0 4px 0;">Thank you,</p>
        <p style="margin: 0; font-weight: 700; color: #06265f;">EduShare Team</p>
        <p style="margin: 12px 0 0 0; font-size: 11px;">University of the Assumption · EduShare Educational Platform</p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();

  const text = `
Hello${displayName}!

Welcome to EduShare!

Thank you for creating your account.

To activate your account and start using EduShare, please verify your email address by clicking the link below:

${verificationUrl}

Your verification link expires after 24 hours.

If you did not create this account, you can safely ignore this email.

Thank you,
EduShare Team
  `.trim();

  const transporter = getTransporter();

  const mailOptions = {
    from: config.smtp.from,
    to: toEmail,
    subject: 'Verify Your EduShare Account',
    text,
    html
  };

  const info = await transporter.sendMail(mailOptions);
  return { messageId: info.messageId, recipient: toEmail };
}

/**
 * Sends a password recovery email to a user requesting a reset.
 * 
 * @param {string} toEmail User's registered email
 * @param {string} rawToken Unhashed 32-byte hexadecimal reset token
 * @param {string} [recipientName] User's full name
 * @returns {Promise<{ messageId: string, recipient: string }>}
 */
async function sendPasswordResetEmail(toEmail, rawToken, recipientName = '') {
  if (!config.smtp.pass) {
    const errorMsg = 'Cannot send password reset email: SMTP_PASS is missing in .env. Please configure your 16-character Gmail App Password.';
    console.error(`[EduShare EmailService] ${errorMsg}`);
    throw new Error(errorMsg);
  }

  const resetUrl = `${config.frontendUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
  const displayName = recipientName ? ` ${recipientName}` : '';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your EduShare Password</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f4f7fc;
      font-family: Arial, Helvetica, sans-serif;
      color: #142b54;
      line-height: 1.6;
    }
    .wrapper {
      width: 100%;
      background-color: #f4f7fc;
      padding: 40px 15px;
    }
    .card {
      max-width: 580px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 14px;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(6, 38, 95, 0.08);
      border: 1px solid #d5deed;
    }
    .header {
      background: linear-gradient(135deg, #031c49 0%, #06265f 100%);
      padding: 30px 40px;
      text-align: center;
      color: #ffffff;
    }
    .brand-mark {
      display: inline-block;
      width: 44px;
      height: 44px;
      line-height: 44px;
      background: #ffc400;
      color: #06265f;
      font-weight: 800;
      font-size: 20px;
      border-radius: 8px;
      margin-bottom: 12px;
    }
    .brand-title {
      font-size: 24px;
      font-weight: 700;
      letter-spacing: 0.5px;
      margin: 0;
    }
    .brand-sub {
      font-size: 11px;
      color: #ffc400;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      margin-top: 4px;
    }
    .content {
      padding: 36px 40px;
      color: #142b54;
    }
    .greeting {
      font-size: 20px;
      font-weight: 700;
      color: #06265f;
      margin-bottom: 16px;
    }
    .text {
      font-size: 15px;
      color: #334e68;
      margin-bottom: 20px;
    }
    .btn-container {
      text-align: center;
      margin: 32px 0;
    }
    .reset-btn {
      display: inline-block;
      background: #087ed0;
      color: #ffffff !important;
      text-decoration: none;
      font-size: 16px;
      font-weight: 700;
      padding: 14px 34px;
      border-radius: 8px;
      letter-spacing: 0.5px;
    }
    .reset-btn:hover {
      background: #06265f;
    }
    .expiration-note {
      font-size: 13px;
      color: #627d98;
      background: #fff8e6;
      border-left: 4px solid #ffc400;
      padding: 12px 16px;
      border-radius: 4px;
      margin-bottom: 24px;
    }
    .backup-box {
      margin-top: 24px;
      padding-top: 20px;
      border-top: 1px solid #e2e8f0;
      font-size: 12px;
      color: #627d98;
      word-break: break-all;
    }
    .footer {
      background-color: #f8fafc;
      padding: 20px 40px;
      text-align: center;
      font-size: 12px;
      color: #829ab1;
      border-top: 1px solid #e2e8f0;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <div class="brand-mark">UA</div>
        <div class="brand-title">EduShare</div>
        <div class="brand-sub">University of the Assumption</div>
      </div>
      <div class="content">
        <div class="greeting">Hello${displayName},</div>
        <p class="text">We received a request to reset your EduShare account password.</p>
        <p class="text">Click the button below to choose a new, secure password for your account.</p>
        
        <div class="btn-container">
          <a href="${resetUrl}" class="reset-btn" target="_blank" rel="noopener">RESET MY PASSWORD</a>
        </div>
        
        <div class="expiration-note">
          This password reset link expires after <strong>30 minutes</strong>.
        </div>
        
        <p class="text" style="font-size: 13px; color: #627d98;">
          If you did not request a password reset, you can safely ignore this email. Your account remains secure.
        </p>
        
        <div class="backup-box">
          <strong>Button not working?</strong> Copy and paste this URL into your browser:<br>
          <a href="${resetUrl}" style="color: #087ed0;">${resetUrl}</a>
        </div>
      </div>
      <div class="footer">
        <p style="margin: 0 0 4px 0;">Thank you,</p>
        <p style="margin: 0; font-weight: 700; color: #06265f;">EduShare Team</p>
        <p style="margin: 12px 0 0 0; font-size: 11px;">University of the Assumption · EduShare Educational Platform</p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();

  const text = `
Hello${displayName},

We received a request to reset your EduShare account password.

To reset your password, please open the following link in your browser:

${resetUrl}

This password reset link expires after 30 minutes.

If you did not request a password reset, you can safely ignore this email.

Thank you,
EduShare Team
  `.trim();

  const transporter = getTransporter();

  const mailOptions = {
    from: config.smtp.from,
    to: toEmail,
    subject: 'Reset Your EduShare Password',
    text,
    html
  };

  const info = await transporter.sendMail(mailOptions);
  return { messageId: info.messageId, recipient: toEmail };
}

module.exports = {
  verifySmtpConnection,
  sendVerificationEmail,
  sendPasswordResetEmail
};
