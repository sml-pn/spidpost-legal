/**
 * rotate.ts
 * ──────────────────────────────────────────────────────────────────────
 * Repõe produtos em COOLDOWN quando a fila está vazia.
 *
 * Regra:
 *   1. Se existem produtos PENDING ou READY → não faz nada
 *   2. Se fila vazia → pega o COOLDOWN mais antigo
 *   3. Volta a PENDING com a next_variation definida
 *   4. Repete até encher a fila OU acabar cooldowns
 *
 * Ignora cooldown por tempo — a fila vazia é prioridade máxima.
 * ──────────────────────────────────────────────────────────────────────
 */

import { db } from '../lib/db.js';

const FILA_MINIMA = 3; // Manter pelo menos N produtos na fila

async function main() {
  console.log('Rotate iniciado...\n');

  // 1. Ver quantos estão na fila (PENDING + READY)
  const fila = db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'READY' THEN 1 ELSE 0 END) as ready
    FROM products
    WHERE removed_from_ml = 0
  `).get() as any;

  const totalFila = (fila.pending ?? 0) + (fila.ready ?? 0);
  console.log(`Fila atual: ${totalFila} (${fila.pending} PENDING + ${fila.ready} READY)`);

  if (totalFila >= FILA_MINIMA) {
    console.log(`Fila cheia (>= ${FILA_MINIMA}). Nada a fazer.`);
    return;
  }

  // 2. Quantos repor?
  const precisa = FILA_MINIMA - totalFila;
  console.log(`Precisa repor: ${precisa}\n`);

  // 3. Buscar produtos COOLDOWN mais antigos
  const cooldowns = db.prepare(`
    SELECT id, name, category, next_variation, variations_done, last_posted_at
    FROM products
    WHERE status = 'COOLDOWN'
      AND removed_from_ml = 0
      AND next_variation IS NOT NULL
    ORDER BY last_posted_at ASC
    LIMIT ?
  `).all(precisa) as any[];

  if (cooldowns.length === 0) {
    console.log('Sem produtos COOLDOWN disponiveis.');
    return;
  }

  // 4. Repor cada um
  const stmtRepor = db.prepare(`
    UPDATE products
    SET status = 'PENDING',
        updated_at = datetime('now')
    WHERE id = ?
  `);

  console.log('Repondo:');
  for (const c of cooldowns) {
    stmtRepor.run(c.id);
    const dias = c.last_posted_at
      ? Math.round((Date.now() - new Date(c.last_posted_at).getTime()) / 86400000)
      : 0;
    console.log(`  OK  [${c.category}] ${c.name.slice(0, 50)}`);
    console.log(`       variacao: ${c.next_variation} (publicou ${c.variations_done}x, ultima ha ${dias}d)`);
  }

  console.log(`\n${cooldowns.length} produtos repostos.`);

  // 5. Resumo
  const novo = db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'READY' THEN 1 ELSE 0 END) as ready,
      SUM(CASE WHEN status = 'COOLDOWN' THEN 1 ELSE 0 END) as cooldown
    FROM products
    WHERE removed_from_ml = 0
  `).get() as any;

  console.log(`\nEstado final:`);
  console.log(`  PENDING:  ${novo.pending}`);
  console.log(`  READY:    ${novo.ready}`);
  console.log(`  COOLDOWN: ${novo.cooldown}`);
}

main().catch((err) => {
  console.error('Erro fatal:', err);
  process.exit(1);
});