import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', '..', 'data.db');

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    external_id TEXT UNIQUE NOT NULL,
    source TEXT NOT NULL DEFAULT 'mercadolivre',
    name TEXT NOT NULL,
    price REAL,
    original_price REAL,
    thumbnail TEXT,
    affiliate_url TEXT,
    status TEXT DEFAULT 'PENDING',
    attempts INTEGER DEFAULT 0,
    error TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    rendered_at TEXT,
    posted_at TEXT,
    ig_media_id TEXT,
    reel_path TEXT,
    caption TEXT,
    hashtags TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_products_status
    ON products(status, created_at);
`);
