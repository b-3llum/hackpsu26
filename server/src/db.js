import { DatabaseSync } from "node:sqlite";

export function openDb(path) {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      stripe_customer_id TEXT UNIQUE,
      plan TEXT NOT NULL DEFAULT 'free',
      subscription_status TEXT,
      current_period_end INTEGER,
      cancel_at_period_end INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS summary_cache (
      key TEXT PRIMARY KEY,
      summary TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS stripe_events (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audio_cache (
      key TEXT PRIMARY KEY,
      mp3 BLOB NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS listen_usage (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day TEXT NOT NULL,
      count INTEGER NOT NULL,
      PRIMARY KEY (user_id, day)
    );
    CREATE TABLE IF NOT EXISTS oauth_states (
      state TEXT PRIMARY KEY,
      verifier TEXT NOT NULL,
      next TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
  // Columns added after the first deploy.
  ensureColumn(db, "users", "auth0_sub", "TEXT");
  // Rows left behind by deletes made without foreign keys on (for example from the sqlite3 shell). User ids can be
  // reused, so an orphan session or listen count would otherwise attach to the next new account.
  db.exec(`DELETE FROM sessions WHERE user_id NOT IN (SELECT id FROM users);
           DELETE FROM listen_usage WHERE user_id NOT IN (SELECT id FROM users);`);
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS users_auth0_sub ON users(auth0_sub) WHERE auth0_sub IS NOT NULL");
  return db;
}

function ensureColumn(db, table, column, type) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}
