/**
 * EduShare Database Connection & Initialization
 * Uses SQLite locally and Neon Postgres in serverless deployments.
 */

const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const config = require('../config/env');

let dbInstance = null;
let databaseAdapter = null;
let postgresPool = null;
let initialization = null;
let sqliteLock = Promise.resolve();

function getDb(customPath = null) {
  if (dbInstance && !customPath) {
    return dbInstance;
  }

  const dbPath = customPath || config.databaseUrl;

  // Ensure parent directory exists if using a file path
  if (dbPath !== ':memory:') {
    const dir = path.dirname(path.resolve(dbPath));
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new DatabaseSync(dbPath);

  // Set SQLite pragmas for integrity, concurrency, and performance
  db.exec('PRAGMA foreign_keys = ON;');
  if (dbPath !== ':memory:' && !process.env.VERCEL) {
    try {
      db.exec('PRAGMA journal_mode = WAL;');
    } catch {
      // WAL mode may not be supported on certain network drives or serverless environments, silently continue
    }
  }

  // Load and execute schema
  const schemaPath = path.resolve(__dirname, 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schemaSql);
  } else {
    // Fallback embedded schema if file tracing omits schema.sql in serverless build
    const embeddedSchema = `
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('student', 'teacher')) DEFAULT 'student',
        email_verified INTEGER NOT NULL DEFAULT 0 CHECK(email_verified IN (0, 1)),
        sensitive_data_encrypted TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS email_verification_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at INTEGER NOT NULL,
        used_at INTEGER DEFAULT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at INTEGER NOT NULL,
        used_at INTEGER DEFAULT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS authentication_sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        is_persistent INTEGER NOT NULL DEFAULT 0 CHECK(is_persistent IN (0, 1)),
        expires_at INTEGER NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        created_at INTEGER NOT NULL,
        last_active_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS security_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        user_id INTEGER,
        email TEXT,
        ip_address TEXT,
        details TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
      CREATE INDEX IF NOT EXISTS idx_email_verif_token_hash ON email_verification_tokens(token_hash);
      CREATE INDEX IF NOT EXISTS idx_email_verif_user_id ON email_verification_tokens(user_id);
      CREATE INDEX IF NOT EXISTS idx_pw_reset_token_hash ON password_reset_tokens(token_hash);
      CREATE INDEX IF NOT EXISTS idx_pw_reset_user_id ON password_reset_tokens(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON authentication_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON authentication_sessions(expires_at);
    `;
    db.exec(embeddedSchema);
  }

  if (!customPath) {
    dbInstance = db;
  }

  return db;
}

/**
 * Executes a function within a transaction.
 * @param {Function} fn Function taking (db) and executing queries
 * @param {DatabaseSync} [db] Optional database instance
 */
function transaction(fn, db = null) {
  const currentDb = db || getDb();
  currentDb.exec('BEGIN IMMEDIATE TRANSACTION;');
  try {
    const result = fn(currentDb);
    currentDb.exec('COMMIT;');
    return result;
  } catch (err) {
    currentDb.exec('ROLLBACK;');
    throw err;
  }
}

function replacePlaceholders(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function createAdapter(execute) {
  return {
    prepare(sql) {
      return {
        async get(...params) {
          const result = await execute(sql, params, 'get');
          return result.rows[0];
        },
        async all(...params) {
          const result = await execute(sql, params, 'all');
          return result.rows;
        },
        async run(...params) {
          const result = await execute(sql, params, 'run');
          return {
            lastInsertRowid: result.lastInsertRowid ?? result.rows[0]?.id,
            changes: result.rowCount
          };
        }
      };
    }
  };
}

function acquireSqliteLock() {
  const previous = sqliteLock;
  let release;
  sqliteLock = new Promise((resolve) => {
    release = resolve;
  });
  return previous.then(() => release);
}

async function executeSqlite(db, sql, params, mode, lock = true) {
  const release = lock ? await acquireSqliteLock() : null;
  try {
    const statement = db.prepare(sql);
    if (mode === 'get') {
      const row = statement.get(...params);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    if (mode === 'all' || /\bRETURNING\b/i.test(sql)) {
      const rows = statement.all(...params);
      return {
        rows,
        rowCount: rows.length,
        lastInsertRowid: rows[0]?.id
      };
    }
    const result = statement.run(...params);
    return {
      rows: [],
      rowCount: result.changes,
      lastInsertRowid: result.lastInsertRowid
    };
  } finally {
    if (release) release();
  }
}

async function initializeDatabase() {
  if (!initialization) {
    initialization = (async () => {
      if (!config.usePostgres) {
        getDb();
        return;
      }

      const { Pool, neonConfig } = require('@neondatabase/serverless');
      const WebSocket = require('ws');
      neonConfig.webSocketConstructor = WebSocket;
      postgresPool = new Pool({ connectionString: config.databaseUrl, max: 1 });

      const schemaPath = path.resolve(__dirname, 'schema.postgres.sql');
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      const client = await postgresPool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(731942105)');
        for (const statement of schemaSql.split(';').map((part) => part.trim()).filter(Boolean)) {
          await client.query(statement);
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    })();
  }

  return initialization;
}

function getDatabase() {
  if (databaseAdapter) return databaseAdapter;

  databaseAdapter = createAdapter(async (sql, params, mode) => {
    await initializeDatabase();
    if (config.usePostgres) {
      const result = await postgresPool.query(replacePlaceholders(sql), params);
      return {
        rows: result.rows,
        rowCount: result.rowCount,
        lastInsertRowid: result.rows[0]?.id
      };
    }
    return executeSqlite(getDb(), sql, params, mode);
  });

  return databaseAdapter;
}

async function withTransaction(fn) {
  await initializeDatabase();

  if (config.usePostgres) {
    const client = await postgresPool.connect();
    try {
      await client.query('BEGIN');
      const tx = createAdapter(async (sql, params, mode) => {
        const result = await client.query(replacePlaceholders(sql), params);
        return {
          rows: result.rows,
          rowCount: result.rowCount,
          lastInsertRowid: result.rows[0]?.id
        };
      });
      const result = await fn(tx);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  const release = await acquireSqliteLock();
  const db = getDb();
  db.exec('BEGIN IMMEDIATE TRANSACTION;');
  try {
    const tx = createAdapter((sql, params, mode) => executeSqlite(db, sql, params, mode, false));
    const result = await fn(tx);
    db.exec('COMMIT;');
    return result;
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  } finally {
    release();
  }
}

/**
 * Logs a security event without exposing credentials or secrets.
 */
async function logSecurityEvent(eventType, { userId = null, email = null, ipAddress = null, details = null } = {}, db = getDatabase()) {
  const serializedDetails = typeof details === 'object' && details !== null
    ? JSON.stringify(details)
    : details;
  await db.prepare(`
    INSERT INTO security_logs (event_type, user_id, email, ip_address, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(eventType, userId, email, ipAddress, serializedDetails, Date.now());
}

module.exports = {
  getDb,
  getDatabase,
  initializeDatabase,
  transaction,
  withTransaction,
  logSecurityEvent
};
