/**
 * schedule.ts
 * ──────────────────────────────────────────────────────────────────────
 * Slots fixos de publicacao + estado persistente de retry.
 *
 * Regras:
 *   - 20 slots fixos entre 08:00 e 22:00
 *   - Fora dos slots, publish nao corre
 *   - Se rate limit, guarda slot pendente e retenta com backoff
 *     (3 min -> 10 min -> 30 min -> 60 min)
 * ──────────────────────────────────────────────────────────────────────
 */

import { db } from './db.js';

/** PRNG deterministico (mesmo dia = mesma sequencia em qualquer maquina). */
function mulberry32(a: number): () => number {
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 16 slots por dia (POSTS_POR_DIA), horarios aleatorios entre 06:00 e 23:00, sempre >= 40 min entre si. */
export function obterSlotsHoje(): string[] {
  const d = new Date();
  const seed = Number(String(d.getFullYear()) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0'));
  const rand = mulberry32(seed);
  rand(); rand(); rand();

  const qtd = Number(process.env.POSTS_POR_DIA || 16);
  const inicio = Number(process.env.SLOT_INICIO_MIN || 360);
  const fim = Number(process.env.SLOT_FIM_MIN || 1380);
  const gap = Number(process.env.SLOT_GAP_MIN || 40);
  const folga = Math.max(0, (fim - inicio) - (qtd - 1) * gap);

  const base: number[] = [];
  for (let i = 0; i < qtd; i++) base.push(Math.floor(rand() * (folga + 1)));
  base.sort((a, b) => a - b);

  return base.map((b, i) => {
    const m = inicio + b + i * gap;
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  });
}
/** Backoff (minutos) para cada tentativa de retry. */
export const BACKOFFS_MIN = [3, 10, 30, 60];

/** Data local no formato YYYY-MM-DD. */
function dataLocal(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Garante que a tabela schedule_used existe. */
export function ensureScheduleUsedTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schedule_used (
      slot TEXT NOT NULL,
      data TEXT NOT NULL,
      used_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (slot, data)
    )
  `);
}

/**
 * Devolve o slot MAIS RECENTE que ja passou hoje e ainda nao foi usado.
 *
 * Permite publicar mesmo com atrasos de 30min-2h do GitHub Actions:
 * se o slot das 08:00 foi perdido, publica em 08:35 e marca como usado.
 *
 * Se todos os slots que ja passaram ja foram usados, devolve null.
 */
export function slotAtual(): string | null {
  ensureScheduleUsedTable();

  const agora = new Date();
  const hoje = dataLocal(agora);
  const minutosAgora = agora.getHours() * 60 + agora.getMinutes();

  const SLOTS_HOJE = obterSlotsHoje();
  const passados = SLOTS_HOJE.filter((s) => {
    const partes = s.split(':');
    const sm = Number(partes[0]) * 60 + Number(partes[1]); return sm <= minutosAgora && minutosAgora - sm <= Number(process.env.SLOT_TOLERANCIA_MIN || 120);
  });

  if (passados.length === 0) return null;

  for (let i = passados.length - 1; i >= 0; i--) {
    const s = passados[i];
    const usado = db.prepare(
      'SELECT 1 FROM schedule_used WHERE slot = ? AND data = ? LIMIT 1'
    ).get(s, hoje);
    if (!usado) return s;
  }

  return null;
}

/** Marca um slot como usado hoje (para nao repetir). */
export function markSlotUsado(slot: string): void {
  ensureScheduleUsedTable();
  const hoje = dataLocal();
  db.prepare(
    `INSERT OR IGNORE INTO schedule_used (slot, data) VALUES (?, ?)`
  ).run(slot, hoje);
}

/** Garante que a tabela schedule_state existe. */
export function ensureScheduleTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schedule_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      pending_slot TEXT,
      pending_since TEXT,
      retry_count INTEGER DEFAULT 0
    )
  `);
}

/** Devolve o estado pendente, ou null. */
export function getPending(): { pending_slot: string; pending_since: string; retry_count: number } | null {
  ensureScheduleTable();
  const r = db.prepare('SELECT * FROM schedule_state WHERE id = 1').get() as any;
  if (!r || !r.pending_slot) return null;

  // SQLite grava datetime('now') em UTC sem sufixo. Adicionar 'Z' para
  // new Date() interpretar corretamente (senao assume hora local).
  if (r.pending_since && !String(r.pending_since).endsWith('Z')) {
    r.pending_since = String(r.pending_since).replace(' ', 'T') + 'Z';
  }

  return r;
}

/** Marca um slot como pendente (houve rate limit). */
export function setPending(slot: string): void {
  ensureScheduleTable();
  db.prepare(`
    INSERT INTO schedule_state (id, pending_slot, pending_since, retry_count)
    VALUES (1, ?, datetime('now'), 1)
    ON CONFLICT(id) DO UPDATE SET
      pending_slot = excluded.pending_slot,
      pending_since = datetime('now'),
      retry_count = schedule_state.retry_count + 1
  `).run(slot);
}

/** Limpa o estado pendente (publicou com sucesso). */
export function clearPending(): void {
  ensureScheduleTable();
  db.prepare('DELETE FROM schedule_state WHERE id = 1').run();
}

/** Devolve o proximo backoff (min) para a tentativa atual. */
export function proximoBackoff(retryCount: number): number {
  const idx = Math.min(retryCount - 1, BACKOFFS_MIN.length - 1);
  return BACKOFFS_MIN[Math.max(0, idx)];
}
