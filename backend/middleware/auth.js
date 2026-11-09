/**
 * EduShare Authentication Middleware & Session Management
 * 
 * ============================================================================
 * SPECIFICATION (Phase 6, 9 & 11):
 * ============================================================================
 * - Session tokens are stored in HttpOnly, SameSite=Lax, Secure (prod) cookies.
 * - Database-backed session table: 'authentication_sessions'.
 * - Sessions can be revoked on logout or password reset.
 * - Persistent (Remember Me) vs Non-persistent (browser session) cookie support.
 * - Role enforcement for Student and Teacher roles.
 * ============================================================================
 */

const { getDatabase, logSecurityEvent } = require('../database/db');
const { hashToken } = require('../services/tokenService');
const { decryptJson } = require('../utils/crypto');
const config = require('../config/env');

const SESSION_COOKIE_NAME = 'edushare_session';
const PERSISTENT_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const NON_PERSISTENT_DURATION_MS = 24 * 60 * 60 * 1000;  // 24 hours server-side

/**
 * Sets the authentication cookie on the HTTP response.
 * @param {import('express').Response} res
 * @param {string} rawToken Plaintext session token
 * @param {boolean} isPersistent Remember Me checkbox value
 */
function setSessionCookie(res, rawToken, isPersistent) {
  const cookieOptions = {
    httpOnly: true,
    secure: config.isProduction, // Secure in HTTPS production
    sameSite: 'lax',
    path: '/'
  };

  if (isPersistent) {
    // 30 days persistent cookie
    cookieOptions.maxAge = PERSISTENT_DURATION_MS;
  }
  // If not persistent, omit maxAge/expires -> browser removes cookie when closed

  res.cookie(SESSION_COOKIE_NAME, rawToken, cookieOptions);
}

/**
 * Clears the authentication cookie.
 * @param {import('express').Response} res
 */
function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    path: '/'
  });
}

/**
 * Middleware to authenticate requests via session cookie.
 */
async function authenticate(req, res, next) {
  const rawToken = req.cookies ? req.cookies[SESSION_COOKIE_NAME] : null;

  if (!rawToken) {
    req.user = null;
    req.sessionRecord = null;
    return next();
  }

  try {
    const db = getDatabase();
    const tokenHash = hashToken(rawToken);

    // Look up session
    const sessionStmt = db.prepare(`
      SELECT * FROM authentication_sessions
      WHERE id = ?
    `);
    const session = await sessionStmt.get(tokenHash);

    if (!session) {
      clearSessionCookie(res);
      req.user = null;
      req.sessionRecord = null;
      return next();
    }

    // Check expiration
    if (session.expires_at <= Date.now()) {
      // Session has expired, remove from DB and clear cookie
      const deleteStmt = db.prepare('DELETE FROM authentication_sessions WHERE id = ?');
      await deleteStmt.run(tokenHash);
      clearSessionCookie(res);
      req.user = null;
      req.sessionRecord = null;
      return next();
    }

    // Fetch associated user
    const userStmt = db.prepare(`
      SELECT id, full_name, email, role, email_verified, sensitive_data_encrypted, created_at, updated_at
      FROM users
      WHERE id = ?
    `);
    const user = await userStmt.get(session.user_id);

    if (!user) {
      // User no longer exists
      const deleteStmt = db.prepare('DELETE FROM authentication_sessions WHERE id = ?');
      await deleteStmt.run(tokenHash);
      clearSessionCookie(res);
      req.user = null;
      req.sessionRecord = null;
      return next();
    }

    // If account is somehow unverified, invalidate session
    if (user.email_verified !== 1) {
      const deleteStmt = db.prepare('DELETE FROM authentication_sessions WHERE id = ?');
      await deleteStmt.run(tokenHash);
      clearSessionCookie(res);
      req.user = null;
      req.sessionRecord = null;
      return next();
    }

    // Decrypt sensitive data if present
    let sensitiveData = null;
    if (user.sensitive_data_encrypted) {
      try {
        sensitiveData = decryptJson(user.sensitive_data_encrypted);
      } catch (err) {
        console.error('[EduShare Auth] Failed to decrypt sensitive user data:', err.message);
      }
    }

    // Update last_active_at
    const updateSessionStmt = db.prepare(`
      UPDATE authentication_sessions
      SET last_active_at = ?
      WHERE id = ?
    `);
    await updateSessionStmt.run(Date.now(), tokenHash);

    req.user = {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      role: user.role,
      emailVerified: Boolean(user.email_verified),
      sensitiveData,
      createdAt: user.created_at
    };

    req.sessionRecord = {
      id: tokenHash,
      isPersistent: Boolean(session.is_persistent),
      expiresAt: session.expires_at
    };

    return next();
  } catch (err) {
    return next(err);
  }
}

/**
 * Route guard that requires an authenticated, email-verified user.
 */
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Please log in.'
    });
  }
  next();
}

/**
 * Route guard that requires specific role(s) ('student' or 'teacher').
 * @param {string[]} allowedRoles
 */
function requireRole(allowedRoles = []) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Please log in.'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      try {
        await logSecurityEvent('UNAUTHORIZED_ROLE_ACCESS', {
        userId: req.user.id,
        email: req.user.email,
        ipAddress: req.ip,
        details: { attemptedRole: req.user.role, requiredRoles: allowedRoles }
        });
      } catch (err) {
        return next(err);
      }

      return res.status(403).json({
        success: false,
        error: 'Access denied: your account role does not have permission to access this resource.'
      });
    }

    next();
  };
}

module.exports = {
  SESSION_COOKIE_NAME,
  PERSISTENT_DURATION_MS,
  NON_PERSISTENT_DURATION_MS,
  setSessionCookie,
  clearSessionCookie,
  authenticate,
  requireAuth,
  requireRole
};
