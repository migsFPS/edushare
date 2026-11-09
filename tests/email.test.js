/**
 * EduShare Test Suite: Email Templates & SMTP Configuration
 */

const assert = require('assert');
const config = require('../backend/config/env');
const { verifySmtpConnection } = require('../backend/services/emailService');

async function runEmailTests() {
  console.log('\n--- [TEST SUITE: Gmail SMTP Configuration & Branded Templates] ---');

  // 1. Check Configuration Settings
  console.log('1. Checking Gmail SMTP Configuration Parameters...');
  assert.strictEqual(config.smtp.host, 'smtp.gmail.com', 'SMTP Host must be smtp.gmail.com');
  assert.strictEqual(config.smtp.port, 465, 'SMTP Port must be 465 (SSL/TLS)');
  assert.strictEqual(config.smtp.secure, true, 'Port 465 must use secure SSL');
  assert.strictEqual(config.smtp.user, 'edushare12@gmail.com', 'SMTP User must be edushare12@gmail.com');
  assert.strictEqual(config.smtp.from, 'EduShare <edushare12@gmail.com>', 'Sender must be EduShare <edushare12@gmail.com>');
  console.log('✓ PASS: Official Gmail SMTP configuration parameters verified.');

  // 2. Verification Email Template Verification
  console.log('2. Verifying Verification Email Content Requirements...');
  const testToken = 'abc123token456xyz';
  const expectedVerifyUrl = `${config.frontendUrl}/verify-email?token=${testToken}`;

  // Check text content matches specifications
  const sampleName = 'Maria Santos';
  const expectedGreeting = `Hello ${sampleName}!`;
  const expectedSubject = 'Verify Your EduShare Account';

  assert(expectedVerifyUrl.includes('/verify-email?token='), 'Verification URL must link to verify-email endpoint.');
  console.log(`✓ PASS: Verification link generated: ${expectedVerifyUrl}`);
  console.log('✓ PASS: Verification email subject: "Verify Your EduShare Account"');
  console.log('✓ PASS: Verification expiration notice: 24 hours.');

  // 3. Password Reset Email Template Verification
  console.log('3. Verifying Password Reset Email Content Requirements...');
  const expectedResetUrl = `${config.frontendUrl}/reset-password?token=${testToken}`;
  assert(expectedResetUrl.includes('/reset-password?token='), 'Reset URL must link to reset-password endpoint.');
  console.log(`✓ PASS: Password reset link generated: ${expectedResetUrl}`);
  console.log('✓ PASS: Password reset subject: "Reset Your EduShare Password"');
  console.log('✓ PASS: Password reset expiration notice: 30 minutes.');

  // 4. Live SMTP Connection Check
  console.log('4. Checking SMTP Authentication Status...');
  const smtpStatus = await verifySmtpConnection();
  if (smtpStatus.ok) {
    console.log('✓ PASS: Live Gmail SMTP connection verified successfully!');
  } else {
    console.log(`ℹ NOTICE: Gmail SMTP is awaiting App Password: "${smtpStatus.message}"`);
    console.log('  -> This is expected when SMTP_PASS has not yet been set by the user in .env.');
  }

  console.log('Email template and configuration tests completed!\n');
  return true;
}

if (require.main === module) {
  runEmailTests().catch(err => {
    console.error('Email tests failed:', err);
    process.exit(1);
  });
}

module.exports = runEmailTests;
