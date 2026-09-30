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

/** 20 slots nos melhores horarios para compra por impulso (BR). */
export const SLOTS = [
  '08:00', '09:00', '10:00', '11:00',
  '12:30', '13:00', '13:30', '14:00', '14:30',
  '15:30', '16:00', '16:30', '17:00',
  '19:00', '19:30', '20:00', '20:30', '21:00', '21:30', '22:00'
];

/** Backoff (minutos) para cada tentativa de retry. */
export const BACKOFFS_MIN = [3, 10, 30, 60];

/**
 * Devolve o slot atual (HH:MM), ou null se estivermos fora de algum slot.
 * Tolerancia: +-7 min (para dar margem ao scheduler de 5 min).
 */
export function slotAtual(toleranciaMin = 7): string | null {
  const agora = new Date();
  const minutosAgora = agora.getHours() * 60 + agora.getMinutes();

  for (const slot of SLOTS) {
    const partes = slot.split(':');
    const minutosSlot = Number(partes[0]) * 60 + Number(partes[1]);
    if (Math.abs(minutosAgora - minutosSlot) <= toleranciaMin) return slot;
  }
  return null;
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
