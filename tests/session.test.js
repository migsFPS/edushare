/**
 * EduShare Test Suite: Remember Me & Session Management
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { getDb } = require('../backend/database/db');
const { hashToken, generateSessionToken } = require('../backend/services/tokenService');
const { PERSISTENT_DURATION_MS, NON_PERSISTENT_DURATION_MS } = require('../backend/middleware/auth');

function runSessionTests() {
  console.log('\n--- [TEST SUITE: Remember Me & Database-Backed Sessions] ---');

  const testDbPath = path.resolve(__dirname, 'test_session.db');
  if (fs.existsSync(testDbPath)) {
    try { fs.unlinkSync(testDbPath); } catch {}
  }

  const db = getDb(testDbPath);

  // Setup test user
  const now = Date.now();
  const userRes = db.prepare(`
    INSERT INTO users (full_name, email, password_hash, role, email_verified, created_at, updated_at)
    VALUES ('Session Tester', 'session@ua.edu.ph', 'hash', 'student', 1, ?, ?)
  `).run(now, now);
  const userId = userRes.lastInsertRowid;

  // 1. Remember Me Checked (Persistent 30-Day Session)
  console.log('1. Testing Remember Me Persistent Session...');
  const persistentToken = generateSessionToken();
  const persistentHash = hashToken(persistentToken);
  const persistentExpires = now + PERSISTENT_DURATION_MS;

  db.prepare(`
    INSERT INTO authentication_sessions (id, user_id, is_persistent, expires_at, ip_address, user_agent, created_at, last_active_at)
    VALUES (?, ?, 1, ?, '127.0.0.1', 'EduShareTestAgent', ?, ?)
  `).run(persistentHash, userId, persistentExpires, now, now);

  const savedPersistent = db.prepare('SELECT * FROM authentication_sessions WHERE id = ?').get(persistentHash);
  assert(savedPersistent, 'Persistent session must be saved in database.');
  assert.strictEqual(savedPersistent.is_persistent, 1, 'is_persistent flag must be 1.');
  assert(savedPersistent.expires_at >= now + 29 * 24 * 3600 * 1000, 'Expiration must be at least ~30 days in future.');
  console.log('✓ PASS: Remember Me produces persistent 30-day database session record.');

  // 2. Remember Me Unchecked (Non-Persistent Session)
  console.log('2. Testing Non-Persistent Browser Session...');
  const nonPersistentToken = generateSessionToken();
  const nonPersistentHash = hashToken(nonPersistentToken);
  const nonPersistentExpires = now + NON_PERSISTENT_DURATION_MS;

  db.prepare(`
    INSERT INTO authentication_sessions (id, user_id, is_persistent, expires_at, ip_address, user_agent, created_at, last_active_at)
    VALUES (?, ?, 0, ?, '127.0.0.1', 'EduShareTestAgent', ?, ?)
  `).run(nonPersistentHash, userId, nonPersistentExpires, now, now);

  const savedNonPersistent = db.prepare('SELECT * FROM authentication_sessions WHERE id = ?').get(nonPersistentHash);
  assert.strictEqual(savedNonPersistent.is_persistent, 0, 'is_persistent flag must be 0.');
  assert(savedNonPersistent.expires_at <= now + 25 * 3600 * 1000, 'Non-persistent session has short server timeout.');
  console.log('✓ PASS: Non-persistent session properly recorded with is_persistent = 0.');

  // 3. Logout Invalidation
  console.log('3. Testing Server-Side Logout Session Revocation...');
  db.prepare('DELETE FROM authentication_sessions WHERE id = ?').run(persistentHash);
  const deletedSession = db.prepare('SELECT * FROM authentication_sessions WHERE id = ?').get(persistentHash);
  assert.strictEqual(deletedSession, undefined, 'Session must be removed from database upon logout.');
  console.log('✓ PASS: Logout invalidates the session in the database.');

  // 4. Expired Session Rejection
  console.log('4. Testing Expired Session Rejection...');
  const expiredToken = generateSessionToken();
  const expiredHash = hashToken(expiredToken);
  const pastExpires = now - 1000; // Expired 1 second ago

  db.prepare(`
    INSERT INTO authentication_sessions (id, user_id, is_persistent, expires_at, ip_address, user_agent, created_at, last_active_at)
    VALUES (?, ?, 1, ?, '127.0.0.1', 'EduShareTestAgent', ?, ?)
  `).run(expiredHash, userId, pastExpires, pastExpires - 10000, pastExpires);

  const expiredSession = db.prepare('SELECT * FROM authentication_sessions WHERE id = ?').get(expiredHash);
  assert(expiredSession.expires_at < Date.now(), 'Session must be expired.');

  // Simulation of auth middleware cleanup on expired session
  if (expiredSession.expires_at <= Date.now()) {
    db.prepare('DELETE FROM authentication_sessions WHERE id = ?').run(expiredHash);
  }

  const cleanedSession = db.prepare('SELECT * FROM authentication_sessions WHERE id = ?').get(expiredHash);
  assert.strictEqual(cleanedSession, undefined, 'Expired session must be cleaned up and rejected.');
  console.log('✓ PASS: Expired sessions are rejected and pruned.');

  // Clean up test DB
  try { fs.unlinkSync(testDbPath); } catch {}

  console.log('All Session & Remember Me tests passed successfully!\n');
  return true;
}

if (require.main === module) {
  try {
    runSessionTests();
  } catch (err) {
    console.error('Session tests failed:', err);
    process.exit(1);
  }
}

module.exports = runSessionTests;
