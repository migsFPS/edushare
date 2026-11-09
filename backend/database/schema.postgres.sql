CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('student', 'teacher')) DEFAULT 'student',
  email_verified SMALLINT NOT NULL DEFAULT 0 CHECK(email_verified IN (0, 1)),
  sensitive_data_encrypted TEXT,
  created_at DOUBLE PRECISION NOT NULL,
  updated_at DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at DOUBLE PRECISION NOT NULL,
  used_at DOUBLE PRECISION DEFAULT NULL,
  created_at DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at DOUBLE PRECISION NOT NULL,
  used_at DOUBLE PRECISION DEFAULT NULL,
  created_at DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS authentication_sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_persistent SMALLINT NOT NULL DEFAULT 0 CHECK(is_persistent IN (0, 1)),
  expires_at DOUBLE PRECISION NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at DOUBLE PRECISION NOT NULL,
  last_active_at DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS security_logs (
  id SERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  user_id INTEGER,
  email TEXT,
  ip_address TEXT,
  details TEXT,
  created_at DOUBLE PRECISION NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_email_verif_token_hash ON email_verification_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_email_verif_user_id ON email_verification_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_pw_reset_token_hash ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_pw_reset_user_id ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON authentication_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON authentication_sessions(expires_at);
