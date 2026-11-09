/**
 * EduShare AES-256-GCM Encryption & Decryption Module
 * 
 * ============================================================================
 * DOCUMENTATION & SECURITY RATIONALE (Phase 5):
 * ============================================================================
 * 1. Purpose:
 *    AES-256-GCM is an Authenticated Encryption with Associated Data (AEAD) algorithm.
 *    It provides both confidentiality (protecting plaintext data from unauthorized reading)
 *    and authenticity/integrity (detecting any modification or tampering with the ciphertext).
 * 
 * 2. Why AES-256-GCM vs Password Hashing:
 *    - PASSWORDS: NEVER encrypted with AES. Passwords MUST be hashed one-way using Argon2id.
 *      Password hashing is strictly irreversible to protect user credentials if the database is leaked.
 *    - SENSITIVE DATA: Stored with AES-256-GCM when the backend needs to recover the original
 *      plaintext (e.g., student private notes, teacher draft assessments, sensitive profile metadata).
 *    - TOKENS: Verification and reset tokens are hashed using SHA-256 before storage in the DB,
 *      ensuring tokens cannot be recovered by reading database backups.
 * 
 * 3. Cryptographic Parameters:
 *    - Algorithm: aes-256-gcm
 *    - Key size: 256 bits (32 bytes) from AES_ENCRYPTION_KEY environment variable.
 *    - IV (Initialization Vector): 12 bytes (96 bits) randomly generated per encryption operation.
 *      NEVER reuse an IV with the same key.
 *    - Auth Tag: 16 bytes (128 bits) computed by the GCM cipher.
 *    - Serialized format: "ivHex:authTagHex:ciphertextHex"
 * ============================================================================
 */

const crypto = require('crypto');
const config = require('../config/env');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits auth tag

/**
 * Derives a 32-byte Buffer key from the configured hex string or environment key.
 * @returns {Buffer} 32-byte encryption key
 */
function getKey() {
  const rawKey = config.aesEncryptionKey;
  if (!rawKey) {
    throw new Error('AES_ENCRYPTION_KEY is not defined in the environment.');
  }

  // If 64 hex characters, convert to 32-byte buffer
  if (/^[0-9a-fA-F]{64}$/.test(rawKey)) {
    return Buffer.from(rawKey, 'hex');
  }

  // Fallback: SHA-256 hash to guarantee exactly 32 bytes
  return crypto.createHash('sha256').update(String(rawKey)).digest();
}

/**
 * Encrypts a plaintext string or object using AES-256-GCM.
 * @param {string|object} data Plaintext string or serializable object
 * @returns {string} Encrypted string in format "ivHex:authTagHex:ciphertextHex"
 */
function encrypt(data) {
  if (data === null || data === undefined) return null;

  const text = typeof data === 'object' ? JSON.stringify(data) : String(data);
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH
  });

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM encrypted string.
 * Validates the authentication tag and rejects tampered data.
 * @param {string} encryptedString String in format "ivHex:authTagHex:ciphertextHex"
 * @returns {string} Decrypted plaintext string
 * @throws {Error} If data is tampered, corrupted, or key is invalid
 */
function decrypt(encryptedString) {
  if (!encryptedString) return null;

  const parts = encryptedString.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format. Expected "iv:authTag:ciphertext".');
  }

  const [ivHex, authTagHex, ciphertextHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = getKey();

  if (iv.length !== IV_LENGTH) {
    throw new Error(`Invalid IV length: expected ${IV_LENGTH} bytes, got ${iv.length}.`);
  }

  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error(`Invalid auth tag length: expected ${AUTH_TAG_LENGTH} bytes, got ${authTag.length}.`);
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH
  });

  decipher.setAuthTag(authTag);

  try {
    let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    throw new Error('Decryption failed: data has been tampered with or auth tag is invalid.');
  }
}

/**
 * Safely decrypts and parses JSON if applicable.
 */
function decryptJson(encryptedString) {
  const decrypted = decrypt(encryptedString);
  if (!decrypted) return null;
  try {
    return JSON.parse(decrypted);
  } catch {
    return decrypted;
  }
}

module.exports = {
  encrypt,
  decrypt,
  decryptJson
};
