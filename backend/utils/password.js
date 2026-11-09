/**
 * EduShare Password Hashing & Verification (Argon2id)
 * 
 * ============================================================================
 * SECURITY SPECIFICATION (Phase 4):
 * ============================================================================
 * 1. Algorithm: Argon2id (hybrid version of Argon2 combining Argon2d and Argon2i)
 *    - Memory-hard function resistant to GPU/ASIC cracking and side-channel attacks.
 *    - Parameterized to recommended security standards:
 *      memoryCost: 19456 KiB (~19 MB)
 *      timeCost: 2 iterations
 *      parallelism: 1 thread
 * 2. Critical Rules:
 *    - NEVER use AES or any reversible encryption for password storage.
 *    - NEVER store plaintext passwords.
 *    - NEVER expose password hashes in API responses or logs.
 * ============================================================================
 */

const { hash, verify, Algorithm } = require('@node-rs/argon2');

const ARGON2_CONFIG = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1
};

/**
 * Validates password strength according to EduShare policy.
 * @param {string} password
 * @returns {{ valid: boolean, message?: string }}
 */
function validatePassword(password) {
  if (typeof password !== 'string') {
    return { valid: false, message: 'Password must be a text string.' };
  }

  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters in length.' };
  }

  if (password.length > 128) {
    return { valid: false, message: 'Password must not exceed 128 characters.' };
  }

  return { valid: true };
}

/**
 * Validates email address format.
 * @param {string} email
 * @returns {boolean}
 */
function validateEmail(email) {
  if (typeof email !== 'string') return false;
  const trimmed = email.trim().toLowerCase();
  // Standard RFC 5322 compliant regex for educational/gmail emails
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return emailRegex.test(trimmed) && trimmed.length <= 254;
}

/**
 * Hashes a password using Argon2id.
 * @param {string} plainPassword
 * @returns {Promise<string>} Argon2id hash string ($argon2id$v=19$...)
 */
async function hashPassword(plainPassword) {
  const validation = validatePassword(plainPassword);
  if (!validation.valid) {
    throw new Error(validation.message);
  }

  return await hash(plainPassword, ARGON2_CONFIG);
}

/**
 * Verifies a plaintext password against an Argon2id hash.
 * @param {string} hashString Argon2id hash string from database
 * @param {string} plainPassword Plaintext password supplied during login
 * @returns {Promise<boolean>} True if match, false otherwise
 */
async function verifyPassword(hashString, plainPassword) {
  if (!hashString || !plainPassword) return false;
  try {
    return await verify(hashString, plainPassword, ARGON2_CONFIG);
  } catch (err) {
    // Return false on invalid hash format or verification failure
    return false;
  }
}

module.exports = {
  validatePassword,
  validateEmail,
  hashPassword,
  verifyPassword
};
