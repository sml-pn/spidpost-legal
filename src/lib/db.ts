import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', '..', 'data.db');

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    external_id TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'mercadolivre',
    name TEXT NOT NULL,
    price REAL,
    original_price REAL,
    thumbnail TEXT,
    affiliate_url TEXT,
    category TEXT DEFAULT 'outros',
    category_raw TEXT,
    variation_used INTEGER DEFAULT 0,
    status TEXT DEFAULT 'PENDING',
    attempts INTEGER DEFAULT 0,
    error TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT,
    last_variation TEXT,
    variations_done INTEGER DEFAULT 0,
    last_posted_at TEXT,
    next_variation TEXT DEFAULT 'A',
    removed_from_ml INTEGER DEFAULT 0,
    images_urls TEXT,
    image_used_index INTEGER DEFAULT 0,
    UNIQUE(source, external_id)
  );

  CREATE INDEX IF NOT EXISTS idx_products_status ON products(status, created_at);
  CREATE INDEX IF NOT EXISTS idx_products_category ON products(category, status);
  CREATE INDEX IF NOT EXISTS idx_products_removed ON products(removed_from_ml, status);
  CREATE INDEX IF NOT EXISTS idx_products_next_variation ON products(next_variation, status);

  CREATE TABLE IF NOT EXISTS renders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variation TEXT NOT NULL,
    reel_path TEXT,
    drive_file_id TEXT,
    caption TEXT,
    hashtags TEXT,
    status TEXT DEFAULT 'READY',
    views_count INTEGER DEFAULT 0,
    rendered_at TEXT DEFAULT (datetime('now')),
    posted_at TEXT,
    ig_media_id TEXT,
    image_used TEXT,
    variation_angle TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_renders_product ON renders(product_id, variation);
  CREATE INDEX IF NOT EXISTS idx_renders_status ON renders(status, rendered_at);

  CREATE TABLE IF NOT EXISTS posts_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    render_id INTEGER REFERENCES renders(id),
    turno TEXT,
    source TEXT,
    category TEXT,
    posted_at TEXT DEFAULT (datetime('now')),
    ig_media_id TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_posts_log_date ON posts_log(posted_at);
  CREATE INDEX IF NOT EXISTS idx_posts_log_product ON posts_log(product_id, posted_at);

  CREATE TABLE IF NOT EXISTS category_rotation (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    posted_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_cat_rot_date ON category_rotation(category, posted_at);

  CREATE TABLE IF NOT EXISTS schedule_slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL UNIQUE,
    janela_inicio TEXT NOT NULL,
    janela_fim TEXT NOT NULL,
    cota_reels INTEGER DEFAULT 2,
    cota_feed INTEGER DEFAULT 1,
    ativo INTEGER DEFAULT 1,
    ultima_exec TEXT
  );

  INSERT OR IGNORE INTO schedule_slots (nome, janela_inicio, janela_fim, cota_reels, cota_feed)
  VALUES
    ('manha', '08:00', '12:00', 2, 1),
    ('tarde', '13:00', '17:00', 2, 1),
    ('noite', '19:00', '23:00', 2, 1);
`);

// ──────────────────────────────────────────────────────────────────────
// Tipos
// ──────────────────────────────────────────────────────────────────────

export type Variacao = 'A' | 'B' | 'C';

export type ProductStatus =
  | 'PENDING'      // aguarda render
  | 'READY'        // renderizado, aguarda publicação
  | 'POSTED'       // publicado (aguarda cooldown)
  | 'COOLDOWN'     // em espera para próxima variação
  | 'ARCHIVED'     // esgotou as 3 variações
  | 'REMOVED'      // saiu dos favoritos
  | 'FAILED';      // erro persistente

export type Product = {
  id: number;
  external_id: string;
  source: string;
  name: string;
  price: number | null;
  original_price: number | null;
  thumbnail: string | null;
  affiliate_url: string | null;
  category: string;
  category_raw: string | null;
  variation_used: number;
  status: ProductStatus;
  attempts: number;
  error: string | null;
  created_at: string;
  updated_at: string | null;
  // Novos campos v2
  last_variation: Variacao | null;
  variations_done: number;
  last_posted_at: string | null;
  next_variation: Variacao;
  removed_from_ml: number;
  images_urls: string | null;    // JSON array de URLs
  image_used_index: number;
};

export type Render = {
  id: number;
  product_id: number;
  variation: string;
  reel_path: string | null;
  reel_url: string | null;
  drive_file_id: string | null;
  caption: string | null;
  hashtags: string | null;
  status: string;
  views_count: number;
  rendered_at: string;
  posted_at: string | null;
  ig_media_id: string | null;
  image_used: string | null;
  variation_angle: string | null;
};

// ──────────────────────────────────────────────────────────────────────
// Helpers de lógica de variação
// ──────────────────────────────────────────────────────────────────────

/**
 * Retorna a próxima variação a usar, dada a última usada.
 * A → B → C → ARCHIVED (null)
 */
export function proximaVariacao(ultima: Variacao | null): Variacao | null {
  if (!ultima) return 'A';
  if (ultima === 'A') return 'B';
  if (ultima === 'B') return 'C';
  return null; // C já foi, esgotou
}

/**
 * Ângulo de copy por variação.
 */
export const ANGULOS: Record<Variacao, string> = {
  A: 'Educacional',
  B: 'Economico',
  C: 'Storytelling',
};