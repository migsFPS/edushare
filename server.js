/**
 * EduShare Application Server
 * 
 * Open Educational Platform for Students and Teachers
 * University of the Assumption
 */

const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');

const config = require('./backend/config/env');
const { authenticate } = require('./backend/middleware/auth');
const { generalLimiter } = require('./backend/middleware/rateLimiter');
const authRoutes = require('./backend/routes/auth');

const app = express();

// Security Headers (Helmet) with tailored CSP to allow existing assets & CDN scripts
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdnjs.cloudflare.com"
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com"
        ],
        fontSrc: [
          "'self'",
          "https://fonts.gstatic.com"
        ],
        imgSrc: [
          "'self'",
          "data:",
          "blob:",
          "https://www.pacu.org.ph",
          "https://images.unsplash.com"
        ],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: false
  })
);

// CORS configuration
app.use(
  cors({
    origin: config.frontendUrl,
    credentials: true
  })
);

// Body Parsing & Cookie Parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser(config.sessionSecret));

// Global Rate Limiting on API endpoints
app.use('/api/', generalLimiter);

// Authentication Routes
app.use('/api/auth', authRoutes);

// Protected endpoint to demonstrate AES-256-GCM data access (Phase 5)
app.get('/api/user/profile', authenticate, (req, res) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Unauthorized.' });
  }

  return res.status(200).json({
    success: true,
    user: req.user
  });
});

// Route: Root / or /index.html
app.get(['/', '/index.html', '/login', '/login.html'], authenticate, (req, res) => {
  if (req.user) {
    return res.redirect('/generator.html');
  }
  return res.sendFile(path.resolve(__dirname, 'index.html'));
});

// Route: /generator.html (Server-side Protected)
app.get('/generator.html', authenticate, (req, res) => {
  if (!req.user) {
    return res.redirect('/index.html');
  }
  return res.sendFile(path.resolve(__dirname, 'generator.html'));
});

// Route: /quiz.html and /quiz (Server-side Protected Active Assessment)
app.get(['/quiz.html', '/quiz'], authenticate, (req, res) => {
  if (!req.user) {
    return res.redirect('/index.html');
  }
  return res.sendFile(path.resolve(__dirname, 'quiz.html'));
});

// Route: /verify-email (renders verification landing page)
app.get('/verify-email', (req, res) => {
  return res.sendFile(path.resolve(__dirname, 'verify.html'));
});

// Route: /reset-password (renders reset password landing page)
app.get('/reset-password', (req, res) => {
  return res.sendFile(path.resolve(__dirname, 'reset-password.html'));
});

// Serve static frontend files (CSS, JS, images)
app.use(express.static(path.resolve(__dirname), {
  index: false,
  dotfiles: 'ignore',
  setHeaders: (res, filePath) => {
    // Prevent direct download of sensitive files if requested
    const basename = path.basename(filePath);
    if (basename.startsWith('.') || basename.endsWith('.db') || basename.endsWith('.sql')) {
      res.status(404).end();
    }
  }
}));

// Safe Error Handler
app.use((err, req, res, next) => {
  console.error('[EduShare Server Error]', err);
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    error: config.isProduction
      ? 'An internal server error occurred.'
      : (err.message || 'Server error.')
  });
});

// Start Server if not imported by test suite
if (require.main === module) {
  const server = app.listen(config.port, () => {
    console.log(`=======================================================`);
    console.log(`  EduShare Server running at http://localhost:${config.port}`);
    console.log(`  Environment: ${config.nodeEnv}`);
    console.log(`  Official Sender: ${config.smtp.from}`);
    console.log(`  Database: ${config.databaseUrl}`);
    console.log(`=======================================================`);
  });
}

module.exports = app;
