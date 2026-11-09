/**
 * EduShare Test Suite: Argon2id Password Security
 */

const assert = require('assert');
const {
  validatePassword,
  validateEmail,
  hashPassword,
  verifyPassword
} = require('../backend/utils/password');

async function runPasswordTests() {
  console.log('\n--- [TEST SUITE: Argon2id Password Hashing & Security] ---');

  // Test 1: Password Validation Policy
  assert.strictEqual(validatePassword('').valid, false, 'Empty password must be invalid.');
  assert.strictEqual(validatePassword('short').valid, false, 'Password < 8 chars must be invalid.');
  assert.strictEqual(validatePassword('1234567').valid, false, '7-char password must be invalid.');
  assert.strictEqual(validatePassword('validPassword123').valid, true, '8+ char password must be valid.');
  console.log('✓ PASS: Password policy correctly rejects passwords under 8 characters.');

  // Test 2: Email Validation
  assert.strictEqual(validateEmail('invalid-email'), false, 'Malformed email must fail.');
  assert.strictEqual(validateEmail('user@'), false, 'Missing domain must fail.');
  assert.strictEqual(validateEmail('student@ua.edu.ph'), true, 'Institutional email must pass.');
  assert.strictEqual(validateEmail('edushare12@gmail.com'), true, 'Gmail address must pass.');
  console.log('✓ PASS: Email format validation functioning accurately.');

  // Test 3: Argon2id Hashing
  const plainPassword = 'SuperSecretUA2026!';
  const hash = await hashPassword(plainPassword);

  assert(hash.startsWith('$argon2id$'), 'Hash must start with $argon2id$ format.');
  assert.notStrictEqual(hash, plainPassword, 'Hash must not equal plaintext.');
  console.log('✓ PASS: Argon2id hash generated with $argon2id$ algorithm tag.');

  // Test 4: Argon2id Verification
  const validMatch = await verifyPassword(hash, plainPassword);
  assert.strictEqual(validMatch, true, 'Correct password must verify successfully.');

  const invalidMatch = await verifyPassword(hash, 'WrongPassword123!');
  assert.strictEqual(invalidMatch, false, 'Incorrect password must fail verification.');
  console.log('✓ PASS: Argon2id password verification accurately approves valid credentials and rejects invalid.');

  console.log('All Argon2id password tests passed successfully!\n');
  return true;
}

if (require.main === module) {
  runPasswordTests().catch(err => {
    console.error('Password tests failed:', err);
    process.exit(1);
  });
}

module.exports = runPasswordTests;
