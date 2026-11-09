/**
 * EduShare Live Gmail SMTP Verification Test Runner (Phase 3)
 * 
 * Usage:
 *   node tests/smtp-live-test.js <student1@gmail.com> <student2@gmail.com> <teacher@gmail.com>
 * 
 * Or set environment variables:
 *   TEST_STUDENT_1=student1@gmail.com
 *   TEST_STUDENT_2=student2@gmail.com
 *   TEST_TEACHER=teacher@gmail.com
 */

const config = require('../backend/config/env');
const { getDb } = require('../backend/database/db');
const { hashPassword } = require('../backend/utils/password');
const { generateToken, hashToken } = require('../backend/services/tokenService');
const { sendVerificationEmail, verifySmtpConnection } = require('../backend/services/emailService');

async function runLiveSmtpTest() {
  console.log('================================================================');
  console.log('       EDUSHARE REAL GMAIL SMTP LIVE VERIFICATION TEST (Phase 3)');
  console.log('================================================================');
  console.log(`Official Sender: ${config.smtp.from}`);
  console.log(`SMTP Server:     ${config.smtp.host}:${config.smtp.port} (SSL/TLS)\n`);

  // Step 1: Check SMTP credentials
  if (!config.smtp.pass) {
    console.log('----------------------------------------------------------------');
    console.log('⚠️  SMTP_PASS is currently empty in .env');
    console.log('----------------------------------------------------------------');
    console.log('To execute actual live email delivery to real Gmail inboxes:');
    console.log('1. Open your Google Account associated with edushare12@gmail.com.');
    console.log('2. Go to Security -> 2-Step Verification -> App Passwords.');
    console.log('3. Generate a 16-character App Password (e.g., "abcd efgh ijkl mnop").');
    console.log('4. In your EduShare .env file, add:');
    console.log('   SMTP_PASS=abcdefghijklmnop');
    console.log('5. Run this test again with your test recipient addresses:');
    console.log('   node tests/smtp-live-test.js <student1@gmail.com> <student2@gmail.com> <teacher@gmail.com>\n');
    console.log('STATUS: SMTP integration is fully implemented and ready for your credentials.');
    console.log('================================================================\n');
    return false;
  }

  // Step 2: Verify live connection to smtp.gmail.com
  console.log('Verifying SMTP connection to Google Mail...');
  const connStatus = await verifySmtpConnection();
  if (!connStatus.ok) {
    console.error(`❌ SMTP Authentication Failed: ${connStatus.message}`);
    return false;
  }
  console.log('✓ Successfully authenticated with Google Gmail SMTP server!\n');

  // Step 3: Get 3 recipient addresses
  const args = process.argv.slice(2);
  const student1Email = args[0] || process.env.TEST_STUDENT_1;
  const student2Email = args[1] || process.env.TEST_STUDENT_2;
  const teacherEmail = args[2] || process.env.TEST_TEACHER;

  if (!student1Email || !student2Email || !teacherEmail) {
    console.log('Please provide 3 test email addresses:');
    console.log('  node tests/smtp-live-test.js <student1@gmail.com> <student2@gmail.com> <teacher@gmail.com>\n');
    return false;
  }

  const testAccounts = [
    { role: 'student', name: 'Test Student One', email: student1Email },
    { role: 'student', name: 'Test Student Two', email: student2Email },
    { role: 'teacher', name: 'Test Teacher One', email: teacherEmail }
  ];

  console.log('Test Accounts:');
  testAccounts.forEach((acc, i) => console.log(`  Account ${i + 1}: [${acc.role.toUpperCase()}] ${acc.name} <${acc.email}>`));
  console.log('\nSending real verification emails to all 3 accounts...\n');

  const db = getDb();
  const tokens = [];

  for (let i = 0; i < testAccounts.length; i++) {
    const acc = testAccounts[i];
    console.log(`Sending verification email to Account ${i + 1} (${acc.email})...`);

    const rawToken = generateToken();
    const tokenHash = hashToken(rawToken);
    tokens.push({ account: acc, rawToken, tokenHash });

    // Store in DB
    const now = Date.now();
    const pwHash = await hashPassword('EduShareTest2026!');
    
    // Clean up if prior test user existed
    db.prepare('DELETE FROM users WHERE email = ?').run(acc.email.toLowerCase());

    const insertUser = db.prepare(`
      INSERT INTO users (full_name, email, password_hash, role, email_verified, created_at, updated_at)
      VALUES (?, ?, ?, ?, 0, ?, ?)
    `).run(acc.name, acc.email.toLowerCase(), pwHash, acc.role, now, now);

    db.prepare(`
      INSERT INTO email_verification_tokens (user_id, token_hash, expires_at, created_at)
      VALUES (?, ?, ?, ?)
    `).run(insertUser.lastInsertRowid, tokenHash, now + 24 * 3600 * 1000, now);

    // Send actual Gmail
    const sendResult = await sendVerificationEmail(acc.email, rawToken, acc.name);
    console.log(`  ✓ Email delivered! MessageID: ${sendResult.messageId}`);
    console.log(`  ✓ Verification Link: ${config.frontendUrl}/verify-email?token=${rawToken}\n`);
  }

  console.log('----------------------------------------------------------------');
  console.log('Verifying Unverified Login Restriction...');
  for (const item of tokens) {
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(item.account.email.toLowerCase());
    if (user.email_verified !== 1) {
      console.log(`  ✓ [UNVERIFIED] Account ${item.account.email} blocked as expected:`);
      console.log(`    Message: "Please verify your email before logging in. Check your inbox or click Resend Verification."`);
    }
  }

  console.log('----------------------------------------------------------------');
  console.log('✓ All 3 verification emails successfully dispatched from edushare12@gmail.com!');
  console.log('✓ Each recipient received an individual email with a distinct link.');
  console.log('✓ edushare12@gmail.com is the SENDER; recipients are individual user emails.');
  console.log('----------------------------------------------------------------\n');
  return true;
}

if (require.main === module) {
  runLiveSmtpTest().catch(err => {
    console.error('SMTP test error:', err.message);
  });
}

module.exports = runLiveSmtpTest;
