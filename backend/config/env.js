/**
 * EduShare Environment Configuration & Validation
 */
const path = require('path');
const dotenv = require('dotenv');

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
const usePostgres = /^postgres(?:ql)?:\/\//i.test(databaseUrl);

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  
  frontendUrl: (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, ''),
  backendUrl: (process.env.BACKEND_URL || 'http://localhost:3000').replace(/\/+$/, ''),
  
  // Gmail SMTP Configuration
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '465', 10),
    secure: (process.env.SMTP_PORT || '465') === '465', // Port 465 uses SSL/TLS
    user: process.env.SMTP_USER || 'edushare12@gmail.com',
    pass: process.env.SMTP_PASS || '',
    from: process.env.EMAIL_FROM || 'EduShare <edushare12@gmail.com>'
  },
  
  // Database Configuration
  databaseUrl: databaseUrl || path.resolve(__dirname, '../../edushare.db'),
  usePostgres,
  
  // Security Keys
  sessionSecret: process.env.SESSION_SECRET || 'edushare-default-session-secret-change-in-prod-32bytes',
  aesEncryptionKey: process.env.AES_ENCRYPTION_KEY || '8918b6a453bc7c2df02b94bfebcd8353e3b0dc5484fccc30b7360a66d42215ca'
};

if (process.env.VERCEL) {
  if (!usePostgres) {
    throw new Error('DATABASE_URL must be a Neon Postgres connection string on Vercel.');
  }
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    throw new Error('Set SESSION_SECRET to a random value of at least 32 characters on Vercel.');
  }
  if (!/^[a-f0-9]{64}$/i.test(process.env.AES_ENCRYPTION_KEY || '')) {
    throw new Error('Set AES_ENCRYPTION_KEY to a 64-character hexadecimal key on Vercel.');
  }
}

// Validate AES key format (32 bytes = 64 hex characters)
if (config.aesEncryptionKey.length !== 64) {
  console.warn('[EduShare Config Warning] AES_ENCRYPTION_KEY should be a 64-character hex string (32 bytes).');
}

// Check SMTP configuration status
if (!config.smtp.pass) {
  console.warn(
    '[EduShare Config Warning] SMTP_PASS is empty in .env!\n' +
    '  -> Gmail verification and password reset emails will NOT be delivered until you configure your 16-character Gmail App Password.'
  );
}

module.exports = config;
