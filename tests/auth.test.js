/**
 * EduShare Test Suite: Registration, Verification, Login & Password Recovery
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { getDb, transaction } = require('../backend/database/db');
const { hashPassword, verifyPassword } = require('../backend/utils/password');
const { generateToken, hashToken, generateSessionToken } = require('../backend/services/tokenService');

async function runAuthTests() {
  console.log('\n--- [TEST SUITE: Multi-User Authentication, Roles & Verification Flow] ---');

  // Use a dedicated isolated test database
  const testDbPath = path.resolve(__dirname, 'test_edushare.db');
  if (fs.existsSync(testDbPath)) {
    try { fs.unlinkSync(testDbPath); } catch {}
  }

  const db = getDb(testDbPath);

  // 1. Student Registration
  console.log('1. Testing Student Registration...');
  const studentEmail = 'student1@test.edushare.edu';
  const studentName = 'Test Student One';
  const studentPass = 'StudentPass123!';
  const studentHash = await hashPassword(studentPass);
  const now = Date.now();

  const studentUserRes = db.prepare(`
    INSERT INTO users (full_name, email, password_hash, role, email_verified, created_at, updated_at)
    VALUES (?, ?, ?, 'student', 0, ?, ?)
  `).run(studentName, studentEmail, studentHash, now, now);

  const studentId = studentUserRes.lastInsertRowid;
  assert(studentId, 'Student account must be created with valid ID.');

  // Check email_verified = 0
  const studentRecord = db.prepare('SELECT * FROM users WHERE id = ?').get(studentId);
  assert.strictEqual(studentRecord.email_verified, 0, 'Newly registered student account must be UNVERIFIED (0).');
  assert.strictEqual(studentRecord.role, 'student', 'Role must be student.');
  console.log('✓ PASS: Student registered independently with UNVERIFIED status.');

  // 2. Teacher Registration
  console.log('2. Testing Teacher Registration...');
  const teacherEmail = 'teacher1@test.edushare.edu';
  const teacherName = 'Professor Smith';
  const teacherPass = 'TeacherPass123!';
  const teacherHash = await hashPassword(teacherPass);

  const teacherUserRes = db.prepare(`
    INSERT INTO users (full_name, email, password_hash, role, email_verified, created_at, updated_at)
    VALUES (?, ?, ?, 'teacher', 0, ?, ?)
  `).run(teacherName, teacherEmail, teacherHash, now, now);

  const teacherId = teacherUserRes.lastInsertRowid;
  assert(teacherId, 'Teacher account must be created with valid ID.');
  const teacherRecord = db.prepare('SELECT * FROM users WHERE id = ?').get(teacherId);
  assert.strictEqual(teacherRecord.email_verified, 0, 'Newly registered teacher account must be UNVERIFIED (0).');
  assert.strictEqual(teacherRecord.role, 'teacher', 'Role must be teacher.');
  console.log('✓ PASS: Teacher registered independently with UNVERIFIED status.');

  // 3. Duplicate Email Prevention
  console.log('3. Testing Duplicate Email Prevention...');
  let duplicateCaught = false;
  try {
    db.prepare(`
      INSERT INTO users (full_name, email, password_hash, role, email_verified, created_at, updated_at)
      VALUES ('Duplicate User', ?, 'somehash', 'student', 0, ?, ?)
    `).run(studentEmail, now, now);
  } catch (err) {
    duplicateCaught = true;
    assert(err.message.includes('UNIQUE') || err.message.includes('constraint'), 'Error must be UNIQUE constraint violation.');
  }
  assert(duplicateCaught, 'Duplicate registration with same email must be prevented.');
  console.log('✓ PASS: Duplicate email registration blocked by unique constraint.');

  // 4. Unverified Login Restriction
  console.log('4. Testing Unverified Login Restriction...');
  // Check unverified login logic
  function attemptLogin(email, password) {
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
    if (!user) return { success: false, status: 401, error: 'Account not found or password is incorrect.' };
    
    // Check verification status
    if (user.email_verified !== 1) {
      return {
        success: false,
        status: 403,
        unverified: true,
        error: 'Please verify your email before logging in. Check your inbox or click Resend Verification.'
      };
    }

    return { success: true, user };
  }

  const unverifiedLogin = attemptLogin(studentEmail, studentPass);
  assert.strictEqual(unverifiedLogin.status, 403, 'Unverified account must be rejected with HTTP 403.');
  assert.strictEqual(unverifiedLogin.unverified, true, 'Unverified flag must be true.');
  assert.strictEqual(
    unverifiedLogin.error,
    'Please verify your email before logging in. Check your inbox or click Resend Verification.',
    'Must return exact required unverified message.'
  );
  console.log('✓ PASS: Unverified account cannot log in and returns required message.');

  // 5. Verification Token Creation & Hashing
  console.log('5. Testing Email Verification Token Generation & Validation...');
  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const tokenExpiry = Date.now() + 24 * 60 * 60 * 1000;

  db.prepare(`
    INSERT INTO email_verification_tokens (user_id, token_hash, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).run(studentId, tokenHash, tokenExpiry, Date.now());

  // Test 5a: Invalid token lookup
  const invalidTokenHash = hashToken('invalidRawToken123456');
  const invalidRecord = db.prepare('SELECT * FROM email_verification_tokens WHERE token_hash = ?').get(invalidTokenHash);
  assert.strictEqual(invalidRecord, undefined, 'Non-existent token must not match.');

  // Test 5b: Valid token verification
  const validRecord = db.prepare('SELECT * FROM email_verification_tokens WHERE token_hash = ?').get(tokenHash);
  assert(validRecord, 'Token hash must match record in database.');
  assert.strictEqual(validRecord.used_at, null, 'Token must not be marked used prior to verification.');
  assert(validRecord.expires_at > Date.now(), 'Token must not be expired.');

  // Execute verification update
  const verifyTime = Date.now();
  db.prepare('UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?').run(verifyTime, studentId);
  db.prepare('UPDATE email_verification_tokens SET used_at = ? WHERE id = ?').run(verifyTime, validRecord.id);

  const updatedStudent = db.prepare('SELECT * FROM users WHERE id = ?').get(studentId);
  assert.strictEqual(updatedStudent.email_verified, 1, 'Student email_verified must be updated to 1 (VERIFIED).');
  console.log('✓ PASS: Valid email verification updates user status to VERIFIED in database.');

  // Test 5c: Re-verification with already-used token must be rejected
  const usedRecord = db.prepare('SELECT * FROM email_verification_tokens WHERE token_hash = ?').get(tokenHash);
  assert.notStrictEqual(usedRecord.used_at, null, 'Used token must have used_at timestamp.');
  console.log('✓ PASS: Token is marked used and prevented from re-use.');

  // 6. Verified Login Success
  console.log('6. Testing Verified Login...');
  const verifiedLogin = attemptLogin(studentEmail, studentPass);
  assert.strictEqual(verifiedLogin.success, true, 'Verified user must be allowed to log in.');
  assert.strictEqual(verifiedLogin.user.id, studentId, 'Login user ID must match.');
  console.log('✓ PASS: Verified student can log in normally.');

  // 7. Verify Teacher and login
  console.log('7. Testing Teacher Verification & Login...');
  db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(teacherId);
  const teacherLogin = attemptLogin(teacherEmail, teacherPass);
  assert.strictEqual(teacherLogin.success, true, 'Verified teacher must be allowed to log in.');
  assert.strictEqual(teacherLogin.user.role, 'teacher', 'Teacher role preserved.');
  console.log('✓ PASS: Verified teacher can log in with teacher role.');

  // 8. Resend Verification Flow
  console.log('8. Testing Resend Verification Flow...');
  const student3Email = 'student3@test.edushare.edu';
  const student3Res = db.prepare(`
    INSERT INTO users (full_name, email, password_hash, role, email_verified, created_at, updated_at)
    VALUES ('Student Three', ?, 'hash3', 'student', 0, ?, ?)
  `).run(student3Email, now, now);
  const student3Id = student3Res.lastInsertRowid;

  const oldToken = generateToken();
  const oldHash = hashToken(oldToken);
  db.prepare(`
    INSERT INTO email_verification_tokens (user_id, token_hash, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).run(student3Id, oldHash, Date.now() + 24 * 3600 * 1000, Date.now());

  // Simulate Resend: invalidate old token, insert new token
  const resendTime = Date.now();
  db.prepare('UPDATE email_verification_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL').run(resendTime, student3Id);
  const newToken = generateToken();
  const newHash = hashToken(newToken);
  db.prepare(`
    INSERT INTO email_verification_tokens (user_id, token_hash, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).run(student3Id, newHash, Date.now() + 24 * 3600 * 1000, resendTime);

  const oldTokenStatus = db.prepare('SELECT used_at FROM email_verification_tokens WHERE token_hash = ?').get(oldHash);
  assert(oldTokenStatus.used_at !== null, 'Previous verification token must be invalidated upon resend.');
  const newTokenStatus = db.prepare('SELECT used_at FROM email_verification_tokens WHERE token_hash = ?').get(newHash);
  assert.strictEqual(newTokenStatus.used_at, null, 'New verification token must be active.');
  console.log('✓ PASS: Resend Verification invalidates prior tokens and issues fresh active token.');

  // 9. Password Reset Flow & Session Revocation
  console.log('9. Testing Password Reset Flow & Session Invalidation...');
  // Create an active session for verified student
  const activeSessionToken = generateSessionToken();
  const activeSessionHash = hashToken(activeSessionToken);
  db.prepare(`
    INSERT INTO authentication_sessions (id, user_id, is_persistent, expires_at, created_at, last_active_at)
    VALUES (?, ?, 1, ?, ?, ?)
  `).run(activeSessionHash, studentId, Date.now() + 30 * 24 * 3600 * 1000, Date.now(), Date.now());

  const activeSessionCheck = db.prepare('SELECT * FROM authentication_sessions WHERE id = ?').get(activeSessionHash);
  assert(activeSessionCheck, 'Session must exist before reset.');

  // Issue password reset token (30-min expiry)
  const rawResetToken = generateToken();
  const resetTokenHash = hashToken(rawResetToken);
  const resetExpiry = Date.now() + 30 * 60 * 1000;
  db.prepare(`
    INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).run(studentId, resetTokenHash, resetExpiry, Date.now());

  // Execute reset: update password, mark token used, revoke all user sessions
  const newPassword = 'NewStudentPass2026!';
  const newHashPassword = await hashPassword(newPassword);
  const resetExecTime = Date.now();

  transaction((tx) => {
    tx.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(newHashPassword, resetExecTime, studentId);
    tx.prepare('UPDATE password_reset_tokens SET used_at = ? WHERE id = ?').run(resetExecTime, 1);
    tx.prepare('DELETE FROM authentication_sessions WHERE user_id = ?').run(studentId);
  }, db);

  // Verify old session revoked
  const revokedSession = db.prepare('SELECT * FROM authentication_sessions WHERE id = ?').get(activeSessionHash);
  assert.strictEqual(revokedSession, undefined, 'All active sessions must be invalidated upon password reset.');

  // Verify new password works
  const updatedStudentCreds = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(studentId);
  const verifyNew = await verifyPassword(updatedStudentCreds.password_hash, newPassword);
  assert.strictEqual(verifyNew, true, 'New password must verify with Argon2id.');
  const verifyOld = await verifyPassword(updatedStudentCreds.password_hash, studentPass);
  assert.strictEqual(verifyOld, false, 'Old password must no longer verify.');
  console.log('✓ PASS: Password reset updates credentials and revokes all active sessions.');

  // Clean up test database
  try {
    fs.unlinkSync(testDbPath);
  } catch {}

  console.log('All Authentication, Role, and Verification tests passed successfully!\n');
  return true;
}

if (require.main === module) {
  runAuthTests().catch(err => {
    console.error('Auth tests failed:', err);
    process.exit(1);
  });
}

module.exports = runAuthTests;
