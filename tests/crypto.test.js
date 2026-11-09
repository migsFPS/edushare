/**
 * EduShare Test Suite: AES-256-GCM Cryptographic Operations
 */

const assert = require('assert');
const { encrypt, decrypt, decryptJson } = require('../backend/utils/crypto');

function runCryptoTests() {
  console.log('\n--- [TEST SUITE: AES-256-GCM Encryption & Tamper Detection] ---');

  // Test 1: Basic encryption and decryption
  const secretText = 'EduShare confidential student evaluation record #4892';
  const encrypted = encrypt(secretText);

  assert(encrypted, 'Ciphertext must not be empty.');
  assert.notStrictEqual(encrypted, secretText, 'Ciphertext must not equal plaintext.');
  const parts = encrypted.split(':');
  assert.strictEqual(parts.length, 3, 'Encrypted string must contain 3 parts: iv:authTag:ciphertext');
  assert.strictEqual(parts[0].length, 24, 'IV hex must be 24 characters (12 bytes).');
  assert.strictEqual(parts[1].length, 32, 'Auth tag hex must be 32 characters (16 bytes).');

  const decrypted = decrypt(encrypted);
  assert.strictEqual(decrypted, secretText, 'Decrypted text must match original plaintext.');
  console.log('✓ PASS: AES-256-GCM encryption & decryption succeeds.');

  // Test 2: Unique IV generation per encryption operation
  const encrypted2 = encrypt(secretText);
  assert.notStrictEqual(encrypted, encrypted2, 'Two encryptions of the same plaintext must produce different IVs and ciphertexts.');
  console.log('✓ PASS: Unique random IVs generated for each encryption.');

  // Test 3: Tamper Detection (Ciphertext modification)
  const [iv, tag, ciphertext] = encrypted.split(':');
  // Flip the first character of ciphertext
  const tamperedChar = ciphertext[0] === 'a' ? 'b' : 'a';
  const tamperedCiphertext = tamperedChar + ciphertext.slice(1);
  const tamperedPayload = `${iv}:${tag}:${tamperedCiphertext}`;

  let tamperCaught = false;
  try {
    decrypt(tamperedPayload);
  } catch (err) {
    tamperCaught = true;
    assert(err.message.includes('tampered') || err.message.includes('invalid'), 'Error must report tampering.');
  }
  assert(tamperCaught, 'Tampered ciphertext must be rejected by GCM authentication tag validation.');
  console.log('✓ PASS: Tampered ciphertext rejected by GCM authentication tag validation.');

  // Test 4: Tamper Detection (Auth tag modification)
  const tamperedTagChar = tag[0] === 'a' ? 'b' : 'a';
  const tamperedTag = tamperedTagChar + tag.slice(1);
  const tamperedTagPayload = `${iv}:${tamperedTag}:${ciphertext}`;

  let tagTamperCaught = false;
  try {
    decrypt(tamperedTagPayload);
  } catch (err) {
    tagTamperCaught = true;
  }
  assert(tagTamperCaught, 'Tampered authentication tag must be rejected.');
  console.log('✓ PASS: Tampered authentication tag rejected.');

  // Test 5: JSON Object Encryption & Decryption
  const testObj = {
    studentId: 'UA-2026-001',
    notes: 'Outstanding performance in mock exams',
    role: 'student'
  };
  const encObj = encrypt(testObj);
  const decObj = decryptJson(encObj);
  assert.deepStrictEqual(decObj, testObj, 'Decrypted JSON object must match original object.');
  console.log('✓ PASS: JSON object encryption and decryption succeeds.');

  console.log('All AES-256-GCM tests passed successfully!\n');
  return true;
}

if (require.main === module) {
  try {
    runCryptoTests();
  } catch (err) {
    console.error('Crypto tests failed:', err);
    process.exit(1);
  }
}

module.exports = runCryptoTests;
