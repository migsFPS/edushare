/**
 * EduShare Rate Limiting Middleware
 * Protects against brute-force attacks, credential stuffing, and email spamming.
 */

const rateLimit = require('express-rate-limit');

// General API Rate Limiter
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests from this IP. Please try again after 15 minutes.'
  }
});

// Login Rate Limiter (Brute-Force Protection)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Max 10 login attempts per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many failed login attempts. Please wait 15 minutes before trying again.'
  }
});

// Registration Rate Limiter
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 15, // Max 15 account creations per hour per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many accounts created from this IP. Please wait an hour before trying again.'
  }
});

// Verification Resend Limiter
const resendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Max 5 verification email requests per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many verification email requests. Please check your inbox or wait 15 minutes.'
  }
});

// Forgot Password Limiter
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Max 5 password reset requests per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many password reset requests. Please check your inbox or wait 15 minutes.'
  }
});

module.exports = {
  generalLimiter,
  loginLimiter,
  registerLimiter,
  resendLimiter,
  forgotPasswordLimiter
};
