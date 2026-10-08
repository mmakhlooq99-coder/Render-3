// Database layer — built on Node's built-in node:sqlite (no external deps).
// WAL mode is enabled so concurrent reads/writes from multiple RMs don't block each other.

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

// DATA_DIR can be overridden with an env var so the database can live on a
// persistent disk (e.g. Render's attached disk mounted at /var/data) instead
// of the app folder itself, which gets wiped every time the service restarts.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'app.db');

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN','RM')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  week_start TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS merchants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  rm_user_id INTEGER REFERENCES users(id),
  rm_name_raw TEXT,
  mid TEXT NOT NULL,
  merchant_name TEXT NOT NULL,
  value_worth REAL NOT NULL DEFAULT 0,
  feedback TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','COMPLETED')),
  feedback_updated_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_merchants_batch ON merchants(batch_id);
CREATE INDEX IF NOT EXISTS idx_merchants_rm ON merchants(rm_user_id);
CREATE INDEX IF NOT EXISTS idx_merchants_mid ON merchants(mid);
CREATE INDEX IF NOT EXISTS idx_merchants_status ON merchants(status);
CREATE INDEX IF NOT EXISTS idx_merchants_name ON merchants(merchant_name);

-- "Merchant Tracking" — a separate tool living in the same platform: tracks
-- merchants with blank/near-zero turnover on a given snapshot date, grouped
-- into priority buckets (Urgent / Watch / Recent) so RMs know who to call.
CREATE TABLE IF NOT EXISTS tracking_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date_label TEXT NOT NULL,
  range_label TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tracking_merchants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL REFERENCES tracking_batches(id) ON DELETE CASCADE,
  rm_user_id INTEGER REFERENCES users(id),
  rm_name_raw TEXT,
  mid TEXT NOT NULL,
  merchant_name TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'Watch' CHECK (priority IN ('Urgent','Watch','Recent')),
  status_label TEXT NOT NULL DEFAULT '',
  latest_value REAL NOT NULL DEFAULT 0,
  last_active_label TEXT NOT NULL DEFAULT '',
  days_inactive INTEGER NOT NULL DEFAULT 0,
  grand_total REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tm_batch ON tracking_merchants(batch_id);
CREATE INDEX IF NOT EXISTS idx_tm_rm ON tracking_merchants(rm_user_id);
`);

// Migration: add service_type / current_rate to merchants if this is an
// existing database from before these columns existed (CREATE TABLE IF NOT
// EXISTS above doesn't touch an already-created table).
const merchantCols = db.prepare("PRAGMA table_info(merchants)").all().map((c) => c.name);
if (!merchantCols.includes('service_type')) {
  db.exec("ALTER TABLE merchants ADD COLUMN service_type TEXT NOT NULL DEFAULT ''");
}
if (!merchantCols.includes('current_rate')) {
  db.exec("ALTER TABLE merchants ADD COLUMN current_rate TEXT NOT NULL DEFAULT ''");
}
if (!merchantCols.includes('contact_1')) {
  db.exec("ALTER TABLE merchants ADD COLUMN contact_1 TEXT NOT NULL DEFAULT ''");
}
if (!merchantCols.includes('contact_2')) {
  db.exec("ALTER TABLE merchants ADD COLUMN contact_2 TEXT NOT NULL DEFAULT ''");
}
if (!merchantCols.includes('contact_3')) {
  db.exec("ALTER TABLE merchants ADD COLUMN contact_3 TEXT NOT NULL DEFAULT ''");
}

module.exports = db;
