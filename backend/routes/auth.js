/**
 * EduShare Authentication Routes
 * 
 * Implements:
 * - Registration (Argon2id, AES-256-GCM sensitive note, verification token)
 * - Gmail Verification & Resend Verification
 * - Login (Argon2id verify, verification restriction, rate limiting)
 * - Remember Me (persistent vs non-persistent session cookies, server DB backed)
 * - Logout (server session invalidation)
 * - Forgot Password & Reset Password (Argon2id, token hash, session revocation)
 * - Authentication Status Check
 */

const express = require('express');
const router = express.Router();
const { getDatabase, withTransaction, logSecurityEvent } = require('../database/db');
const { validatePassword, validateEmail, hashPassword, verifyPassword } = require('../utils/password');
const { encrypt } = require('../utils/crypto');
const { generateToken, hashToken, generateSessionToken } = require('../services/tokenService');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/emailService');
const {
  setSessionCookie,
  clearSessionCookie,
  authenticate,
  requireAuth,
  PERSISTENT_DURATION_MS,
  NON_PERSISTENT_DURATION_MS
} = require('../middleware/auth');
const {
  loginLimiter,
  registerLimiter,
  resendLimiter,
  forgotPasswordLimiter
} = require('../middleware/rateLimiter');

// Verification token lifespan: 24 hours
const VERIFICATION_TOKEN_LIFESPAN_MS = 24 * 60 * 60 * 1000;
// Password reset token lifespan: 30 minutes
const RESET_TOKEN_LIFESPAN_MS = 30 * 60 * 1000;

/**
 * ============================================================================
 * 1. REGISTRATION (Phase 1 & Phase 2.A)
 * POST /api/auth/register
 * ============================================================================
 */
router.post('/register', registerLimiter, async (req, res) => {
  try {
    const { fullName, email, password, confirmPassword, role } = req.body;

    // 1. Validate required fields
    if (!fullName || typeof fullName !== 'string' || !fullName.trim()) {
      return res.status(400).json({ success: false, error: 'Full name is required.' });
    }

    if (!email || !validateEmail(email)) {
      return res.status(400).json({ success: false, error: 'A valid email address is required.' });
    }

    // 2. Validate password
    const pwValidation = validatePassword(password);
    if (!pwValidation.valid) {
      return res.status(400).json({ success: false, error: pwValidation.message });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, error: 'Passwords do not match.' });
    }

    // 3. Validate role
    const normalizedRole = (role || 'student').toLowerCase().trim();
    if (!['student', 'teacher'].includes(normalizedRole)) {
      return res.status(400).json({ success: false, error: 'Role must be either student or teacher.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = fullName.trim();
    const db = getDatabase();

    // 4. Check for duplicate email
    const existingUser = await db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'An account with this email already exists. Please log in.'
      });
    }

    // 5. Hash password using Argon2id
    const passwordHash = await hashPassword(password);

    // 6. Encrypt initial sensitive profile metadata using AES-256-GCM (Phase 5)
    const initialSensitiveData = encrypt({
      registeredIp: req.ip,
      roleAssigned: normalizedRole,
      accountNote: `EduShare ${normalizedRole} account initialized for ${cleanName}`
    });

    // 7. Generate secure verification token
    const rawVerificationToken = generateToken();
    const tokenHash = hashToken(rawVerificationToken);
    const expiresAt = Date.now() + VERIFICATION_TOKEN_LIFESPAN_MS;
    const now = Date.now();

    // 8. Insert user and token inside a database transaction
    const newUserId = await withTransaction(async (tx) => {
      const insertUser = tx.prepare(`
        INSERT INTO users (full_name, email, password_hash, role, email_verified, sensitive_data_encrypted, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, ?, ?, ?)
        RETURNING id
      `);
      const userRes = await insertUser.run(cleanName, cleanEmail, passwordHash, normalizedRole, initialSensitiveData, now, now);

      const insertToken = tx.prepare(`
        INSERT INTO email_verification_tokens (user_id, token_hash, expires_at, created_at)
        VALUES (?, ?, ?, ?)
      `);
      await insertToken.run(userRes.lastInsertRowid, tokenHash, expiresAt, now);

      return userRes.lastInsertRowid;
    });

    await logSecurityEvent('REGISTER', {
      userId: newUserId,
      email: cleanEmail,
      ipAddress: req.ip,
      details: { role: normalizedRole }
    });

    // 9. Send actual verification email via Gmail SMTP
    let emailSent = false;
    let emailError = null;

    try {
      await sendVerificationEmail(cleanEmail, rawVerificationToken, cleanName);
      emailSent = true;
    } catch (err) {
      emailError = err.message;
      console.warn(`[EduShare Registration] Email delivery notification for ${cleanEmail}: ${err.message}`);
    }

    return res.status(201).json({
      success: true,
      emailSent,
      message: emailSent
        ? 'Account created successfully! We have sent a verification email to your address. Please verify your account to log in.'
        : 'Account created! (Note: Real Gmail delivery requires configuring your SMTP_PASS App Password in .env).',
      email: cleanEmail,
      role: normalizedRole
    });

  } catch (err) {
    console.error('[EduShare Register Error]', err);
    return res.status(500).json({
      success: false,
      error: 'An unexpected server error occurred during registration. Please try again.'
    });
  }
});

/**
 * ============================================================================
 * 2. EMAIL VERIFICATION (Phase 2.C)
 * GET /api/auth/verify-email
 * POST /api/auth/verify-email
 * ============================================================================
 */
async function handleEmailVerification(req, res) {
  try {
    const rawToken = req.query.token || req.body.token;

    if (!rawToken || typeof rawToken !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Verification token is missing or malformed.'
      });
    }

    const db = getDatabase();
    const tokenHash = hashToken(rawToken);

    // 1. Look up token in database
    const tokenRecord = await db.prepare(`
      SELECT * FROM email_verification_tokens
      WHERE token_hash = ?
    `).get(tokenHash);

    // 2. Check existence
    if (!tokenRecord) {
      return res.status(400).json({
        success: false,
        error: 'Invalid verification link. This token does not exist or has expired.'
      });
    }

    // 3. Check if already used
    if (tokenRecord.used_at !== null) {
      return res.status(400).json({
        success: false,
        error: 'This verification link has already been used. Your account is already activated. Please log in.'
      });
    }

    // 4. Check expiration (24 hours)
    if (tokenRecord.expires_at < Date.now()) {
      return res.status(400).json({
        success: false,
        error: 'This verification link has expired. Please request a new verification email.'
      });
    }

    // 5. Update user status to VERIFIED and invalidate token
    const now = Date.now();
    await withTransaction(async (tx) => {
      await tx.prepare(`
        UPDATE users
        SET email_verified = 1, updated_at = ?
        WHERE id = ?
      `).run(now, tokenRecord.user_id);

      await tx.prepare(`
        UPDATE email_verification_tokens
        SET used_at = ?
        WHERE id = ?
      `).run(now, tokenRecord.id);
    });

    await logSecurityEvent('EMAIL_VERIFIED', {
      userId: tokenRecord.user_id,
      ipAddress: req.ip
    });

    return res.status(200).json({
      success: true,
      message: 'Your email has been successfully verified! Your EduShare account is now activated.'
    });

  } catch (err) {
    console.error('[EduShare Verify Error]', err);
    return res.status(500).json({
      success: false,
      error: 'An unexpected server error occurred while verifying your email.'
    });
  }
}

router.get('/verify-email', handleEmailVerification);
router.post('/verify-email', handleEmailVerification);

/**
 * ============================================================================
 * 3. RESEND VERIFICATION EMAIL (Phase 2.E)
 * POST /api/auth/resend-verification
 * ============================================================================
 */
router.post('/resend-verification', resendLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !validateEmail(email)) {
      return res.status(400).json({
        success: false,
        error: 'A valid email address is required.'
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const db = getDatabase();

    const user = await db.prepare('SELECT id, full_name, email, email_verified FROM users WHERE email = ?').get(cleanEmail);

    // If user doesn't exist, return generic success to avoid enumeration
    if (!user) {
      return res.status(200).json({
        success: true,
        message: 'If an unverified EduShare account exists with that email, a new verification link has been sent.'
      });
    }

    // If already verified, inform user
    if (user.email_verified === 1) {
      return res.status(200).json({
        success: true,
        alreadyVerified: true,
        message: 'Your email is already verified. You can sign in to your EduShare account.'
      });
    }

    const rawToken = generateToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = Date.now() + VERIFICATION_TOKEN_LIFESPAN_MS;
    const now = Date.now();

    // Invalidate previous unused verification tokens for this user
    await withTransaction(async (tx) => {
      await tx.prepare(`
        UPDATE email_verification_tokens
        SET used_at = ?
        WHERE user_id = ? AND used_at IS NULL
      `).run(now, user.id);

      await tx.prepare(`
        INSERT INTO email_verification_tokens (user_id, token_hash, expires_at, created_at)
        VALUES (?, ?, ?, ?)
      `).run(user.id, tokenHash, expiresAt, now);
    });

    await logSecurityEvent('RESEND_VERIFICATION', {
      userId: user.id,
      email: cleanEmail,
      ipAddress: req.ip
    });

    // Send the email
    try {
      await sendVerificationEmail(cleanEmail, rawToken, user.full_name);
    } catch (err) {
      console.warn(`[EduShare Resend Verification] Email send warning for ${cleanEmail}: ${err.message}`);
    }

    return res.status(200).json({
      success: true,
      message: 'A new verification email has been sent. Please check your inbox and spam folder.'
    });

  } catch (err) {
    console.error('[EduShare Resend Error]', err);
    return res.status(500).json({
      success: false,
      error: 'An unexpected server error occurred while resending the verification email.'
    });
  }
});

/**
 * ============================================================================
 * 4. LOGIN (Phase 1, 2.D, 4, 6)
 * POST /api/auth/login
 * ============================================================================
 */
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password, remember } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required.'
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const db = getDatabase();

    // Query user record
    const user = await db.prepare(`
      SELECT id, full_name, email, password_hash, role, email_verified
      FROM users
      WHERE email = ?
    `).get(cleanEmail);

    if (!user) {
      // Dummy check to prevent timing analysis
      await verifyPassword('$argon2id$v=19$m=19456,t=2,p=1$fakeSaltForTimingDefense$dummyHashValue', password);
      await logSecurityEvent('LOGIN_FAILED', { email: cleanEmail, ipAddress: req.ip, details: 'User not found' });
      return res.status(401).json({
        success: false,
        error: 'Account not found or password is incorrect. Please check your credentials.'
      });
    }

    // Verify password with Argon2id
    const passwordMatch = await verifyPassword(user.password_hash, password);
    if (!passwordMatch) {
      await logSecurityEvent('LOGIN_FAILED', { userId: user.id, email: cleanEmail, ipAddress: req.ip, details: 'Incorrect password' });
      return res.status(401).json({
        success: false,
        error: 'Account not found or password is incorrect. Please check your credentials.'
      });
    }

    // RESTRICTION: Check verification status directly from backend database (Phase 2.D)
    if (user.email_verified !== 1) {
      await logSecurityEvent('LOGIN_BLOCKED_UNVERIFIED', { userId: user.id, email: cleanEmail, ipAddress: req.ip });
      return res.status(403).json({
        success: false,
        unverified: true,
        email: cleanEmail,
        // EXACT MESSAGE REQUIRED BY SPECIFICATION (Phase 2.D):
        error: 'Please verify your email before logging in. Check your inbox or click Resend Verification.'
      });
    }

    // Generate database-backed session (Phase 6)
    const isPersistent = Boolean(remember);
    const rawSessionToken = generateSessionToken();
    const sessionTokenHash = hashToken(rawSessionToken);
    const now = Date.now();
    const expiresAt = now + (isPersistent ? PERSISTENT_DURATION_MS : NON_PERSISTENT_DURATION_MS);

    // Save session in database
    await db.prepare(`
      INSERT INTO authentication_sessions (id, user_id, is_persistent, expires_at, ip_address, user_agent, created_at, last_active_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sessionTokenHash,
      user.id,
      isPersistent ? 1 : 0,
      expiresAt,
      req.ip || '',
      req.get('user-agent') || '',
      now,
      now
    );

    // Set secure cookie
    setSessionCookie(res, rawSessionToken, isPersistent);

    await logSecurityEvent('LOGIN_SUCCESS', {
      userId: user.id,
      email: cleanEmail,
      ipAddress: req.ip,
      details: { role: user.role, remember: isPersistent }
    });

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        role: user.role
      }
    });

  } catch (err) {
    console.error('[EduShare Login Error]', err);
    return res.status(500).json({
      success: false,
      error: 'An unexpected server error occurred during login.'
    });
  }
});

/**
 * ============================================================================
 * 5. LOGOUT (Phase 6)
 * POST /api/auth/logout
 * ============================================================================
 */
router.post('/logout', async (req, res) => {
  try {
    const rawToken = req.cookies ? req.cookies['edushare_session'] : null;

    if (rawToken) {
      const db = getDatabase();
      const tokenHash = hashToken(rawToken);
      await db.prepare('DELETE FROM authentication_sessions WHERE id = ?').run(tokenHash);
    }

    clearSessionCookie(res);
    return res.status(200).json({
      success: true,
      message: 'Logged out successfully.'
    });
  } catch (err) {
    console.error('[EduShare Logout Error]', err);
    clearSessionCookie(res);
    return res.status(200).json({ success: true });
  }
});

/**
 * ============================================================================
 * 6. CHECK AUTH STATUS (Phase 11)
 * GET /api/auth/me
 * ============================================================================
 */
router.get('/me', authenticate, (req, res) => {
  if (!req.user) {
    return res.status(200).json({
      authenticated: false,
      user: null
    });
  }

  return res.status(200).json({
    authenticated: true,
    user: req.user
  });
});

/**
 * ============================================================================
 * 7. FORGOT PASSWORD (Phase 7)
 * POST /api/auth/forgot-password
 * ============================================================================
 */
router.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !validateEmail(email)) {
      return res.status(400).json({
        success: false,
        error: 'A valid email address is required.'
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const db = getDatabase();
    const user = await db.prepare('SELECT id, full_name, email, email_verified FROM users WHERE email = ?').get(cleanEmail);

    // Generic response message to prevent account enumeration
    const genericResponse = {
      success: true,
      message: 'If an account is associated with that email, we have sent instructions to reset your password. Please check your inbox.'
    };

    if (!user) {
      return res.status(200).json(genericResponse);
    }

    const rawResetToken = generateToken();
    const tokenHash = hashToken(rawResetToken);
    const expiresAt = Date.now() + RESET_TOKEN_LIFESPAN_MS;
    const now = Date.now();

    // Invalidate prior unused reset tokens and insert new one
    await withTransaction(async (tx) => {
      await tx.prepare(`
        UPDATE password_reset_tokens
        SET used_at = ?
        WHERE user_id = ? AND used_at IS NULL
      `).run(now, user.id);

      await tx.prepare(`
        INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, created_at)
        VALUES (?, ?, ?, ?)
      `).run(user.id, tokenHash, expiresAt, now);
    });

    await logSecurityEvent('PASSWORD_RESET_REQ', {
      userId: user.id,
      email: cleanEmail,
      ipAddress: req.ip
    });

    // Send email
    try {
      await sendPasswordResetEmail(cleanEmail, rawResetToken, user.full_name);
    } catch (err) {
      console.warn(`[EduShare Forgot Password] Email send warning for ${cleanEmail}: ${err.message}`);
    }

    return res.status(200).json(genericResponse);

  } catch (err) {
    console.error('[EduShare Forgot Password Error]', err);
    return res.status(500).json({
      success: false,
      error: 'An unexpected server error occurred. Please try again later.'
    });
  }
});

/**
 * ============================================================================
 * 8. RESET PASSWORD (Phase 7)
 * POST /api/auth/reset-password
 * ============================================================================
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password, confirmPassword } = req.body;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Password reset token is missing.'
      });
    }

    const pwValidation = validatePassword(password);
    if (!pwValidation.valid) {
      return res.status(400).json({ success: false, error: pwValidation.message });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, error: 'Passwords do not match.' });
    }

    const db = getDatabase();
    const tokenHash = hashToken(token);

    // Look up token
    const tokenRecord = await db.prepare(`
      SELECT * FROM password_reset_tokens
      WHERE token_hash = ?
    `).get(tokenHash);

    if (!tokenRecord) {
      return res.status(400).json({
        success: false,
        error: 'This password reset link is invalid or does not exist.'
      });
    }

    if (tokenRecord.used_at !== null) {
      return res.status(400).json({
        success: false,
        error: 'This password reset link has already been used. Please request a new one.'
      });
    }

    if (tokenRecord.expires_at < Date.now()) {
      return res.status(400).json({
        success: false,
        error: 'This password reset link has expired. Links expire after 30 minutes.'
      });
    }

    // Hash new password using Argon2id
    const newPasswordHash = await hashPassword(password);
    const now = Date.now();

    // Update password, mark token used, and REVOKE ALL SESSIONS (Phase 7 requirement 9)
    await withTransaction(async (tx) => {
      await tx.prepare(`
        UPDATE users
        SET password_hash = ?, updated_at = ?
        WHERE id = ?
      `).run(newPasswordHash, now, tokenRecord.user_id);

      await tx.prepare(`
        UPDATE password_reset_tokens
        SET used_at = ?
        WHERE id = ?
      `).run(now, tokenRecord.id);

      // Invalidate existing sessions
      await tx.prepare(`
        DELETE FROM authentication_sessions
        WHERE user_id = ?
      `).run(tokenRecord.user_id);
    });

    clearSessionCookie(res);

    await logSecurityEvent('PASSWORD_RESET_SUCCESS', {
      userId: tokenRecord.user_id,
      ipAddress: req.ip
    });

    return res.status(200).json({
      success: true,
      message: 'Your password has been successfully updated! You may now sign in with your new password.'
    });

  } catch (err) {
    console.error('[EduShare Reset Password Error]', err);
    return res.status(500).json({
      success: false,
      error: 'An unexpected server error occurred while resetting your password.'
    });
  }
});

module.exports = router;
