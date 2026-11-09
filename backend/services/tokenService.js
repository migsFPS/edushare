/**
 * EduShare Token Service
 * 
 * Generates cryptographically secure random tokens and derives SHA-256 hashes
 * for database storage. Only token hashes are stored in the database so that
 * token values cannot be extracted from database leaks or backups.
 */

const crypto = require('crypto');

/**
 * Generates a high-entropy random token (32 bytes = 64 hex characters).
 * @returns {string} Plaintext token to be delivered to the user via email
 */
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hashes a plaintext token using SHA-256 for secure database storage.
 * @param {string} token Plaintext token
 * @returns {string} SHA-256 hexadecimal hash
 */
function hashToken(token) {
  if (!token || typeof token !== 'string') {
    throw new Error('A valid string token is required for hashing.');
  }
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generates a session identifier.
 * @returns {string} 32-byte random hex string
 */
function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = {
  generateToken,
  hashToken,
  generateSessionToken
};
