/**
 * rotate.ts
 * ──────────────────────────────────────────────────────────────────────
 * Repõe produtos em COOLDOWN quando a fila está baixa.
 *
 * Regras:
 *   1. Se fila >= FILA_MINIMA → não faz nada
 *   2. Cooldown dinâmico:
 *      - mínimo 7 dias (nunca repete rápido)
 *      - máximo 30 dias (nunca fica muito tempo sem aparecer)
 *      - entre estes: ceil((ativos × 3) / limite)
 *   3. Prioriza produtos com MENOS variações usadas (variations_done ASC)
 *   4. Fallback para o mais antigo (nunca deixa fila vazia)
 * ──────────────────────────────────────────────────────────────────────
 */

import { db } from '../lib/db.js';

const FILA_MINIMA = 30;              // Stock mínimo (era 15)
const LIMITE_DIARIO = Number(process.env.LIMITE_DIARIO || 15);
const COOLDOWN_MIN = 7;              // mínimo de dias entre posts do mesmo produto
const COOLDOWN_MAX = 30;             // máximo de dias (força reaparecer)

async function main() {
  console.log('Rotate iniciado...\n');

  const stats = db.prepare(`
    SELECT
      COUNT(*) as total_ativos,
      SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'READY' THEN 1 ELSE 0 END) as ready,
      SUM(CASE WHEN status = 'COOLDOWN' THEN 1 ELSE 0 END) as cooldown
    FROM products
    WHERE removed_from_ml = 0
  `).get() as any;

  const totalFila = (stats.pending ?? 0) + (stats.ready ?? 0);
  console.log(`📊 Estado geral:`);
  console.log(`   Ativos:   ${stats.total_ativos}`);
  console.log(`   PENDING:  ${stats.pending ?? 0}`);
  console.log(`   READY:    ${stats.ready ?? 0}`);
  console.log(`   COOLDOWN: ${stats.cooldown ?? 0}`);
  console.log(`   Fila:     ${totalFila} (PENDING + READY)`);
  console.log('');

  if (totalFila >= FILA_MINIMA) {
    console.log(`✅ Fila cheia (>= ${FILA_MINIMA}). Nada a fazer.`);
    return;
  }

  // Cooldown dinâmico com min/max
  const ativos = stats.total_ativos || 0;
  const cooldownRaw = Math.ceil((ativos * 3) / LIMITE_DIARIO);
  const cooldownDias = Math.max(COOLDOWN_MIN, Math.min(COOLDOWN_MAX, cooldownRaw));

  console.log(`📊 Cooldown dinâmico:`);
  console.log(`   Produtos ativos:  ${ativos}`);
  console.log(`   Limite diário:    ${LIMITE_DIARIO}`);
  console.log(`   Fórmula bruta:    ceil((${ativos} × 3) / ${LIMITE_DIARIO}) = ${cooldownRaw} dias`);
  console.log(`   Cooldown final:   ${cooldownDias} dias (min ${COOLDOWN_MIN}, max ${COOLDOWN_MAX})`);
  console.log('');

  const precisa = FILA_MINIMA - totalFila;
  console.log(`📊 Precisa repor: ${precisa} produtos`);
  console.log('');

  // Buscar elegíveis: ordenados por variations_done ASC (menos postados primeiro)
  const elegiveis = db.prepare(`
    SELECT id, name, category, next_variation, variations_done, last_posted_at
    FROM products
    WHERE status = 'COOLDOWN'
      AND removed_from_ml = 0
      AND next_variation IS NOT NULL
      AND last_posted_at < datetime('now', '-${cooldownDias} days')
    ORDER BY variations_done ASC, last_posted_at ASC
    LIMIT ?
  `).all(precisa) as any[];

  console.log(`📊 COOLDOWN elegíveis (>= ${cooldownDias}d): ${elegiveis.length}`);

  if (elegiveis.length === 0) {
    console.log(`⚠️  Nenhum elegível. A usar fallback (mais antigo).`);
    console.log('');

    const fallback = db.prepare(`
      SELECT id, name, category, next_variation, variations_done, last_posted_at
      FROM products
      WHERE status = 'COOLDOWN'
        AND removed_from_ml = 0
        AND next_variation IS NOT NULL
      ORDER BY variations_done ASC, last_posted_at ASC
      LIMIT ?
    `).all(precisa) as any[];

    if (fallback.length === 0) {
      console.log(`❌ SEM COOLDOWN. Precisa de harvest (produtos novos).`);
      return;
    }

    const stmtRepor = db.prepare(`UPDATE products SET status = 'PENDING', updated_at = datetime('now') WHERE id = ?`);
    console.log('Repondo (fallback):');
    for (const c of fallback) {
      stmtRepor.run(c.id);
      const dias = c.last_posted_at ? Math.round((Date.now() - new Date(c.last_posted_at).getTime()) / 86400000) : 0;
      console.log(`  ⚠️  [${c.category}] ${c.name.slice(0, 45)}`);
      console.log(`       variação: ${c.next_variation} (${c.variations_done}x, há ${dias}d)`);
    }
    console.log(`\n✅ ${fallback.length} repostos (fallback).`);
  } else {
    const stmtRepor = db.prepare(`UPDATE products SET status = 'PENDING', updated_at = datetime('now') WHERE id = ?`);
    console.log('');
    console.log('Repondo:');
    for (const c of elegiveis) {
      stmtRepor.run(c.id);
      const dias = c.last_posted_at ? Math.round((Date.now() - new Date(c.last_posted_at).getTime()) / 86400000) : 0;
      console.log(`  ✅ [${c.category}] ${c.name.slice(0, 45)}`);
      console.log(`       variação: ${c.next_variation} (${c.variations_done}x, há ${dias}d)`);
    }
    console.log('');
    console.log(`✅ ${elegiveis.length} repostos.`);
  }

  const novo = db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'READY' THEN 1 ELSE 0 END) as ready,
      SUM(CASE WHEN status = 'COOLDOWN' THEN 1 ELSE 0 END) as cooldown
    FROM products
    WHERE removed_from_ml = 0
  `).get() as any;

  console.log('');
  console.log('📊 Estado final:');
  console.log(`   PENDING:  ${novo.pending ?? 0}`);
  console.log(`   READY:    ${novo.ready ?? 0}`);
  console.log(`   COOLDOWN: ${novo.cooldown ?? 0}`);
}

main().catch((err) => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
