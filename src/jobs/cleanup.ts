/**
 * cleanup.ts
 * ──────────────────────────────────────────────────────────────────────
 * Limpa ficheiros temporários e renders antigos.
 *
 * Regras:
 *   1. renders/temp/* → apaga ficheiros com mais de 1 hora
 *   2. renders/reels/*, stories/*, feed/* → apaga os POSTED com mais de 45 dias
 *   3. logs/*.log → apaga com mais de 7 dias
 * ──────────────────────────────────────────────────────────────────────
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { db } from '../lib/db.js';

const ROOT = process.cwd();
const TEMP_DIR = path.join(ROOT, 'renders', 'temp');
const LOGS_DIR = path.join(ROOT, 'logs');

const TEMP_MAX_IDADE_MS = 60 * 60 * 1000;           // 1 hora
const LOGS_MAX_IDADE_MS = 7 * 24 * 60 * 60 * 1000;  // 7 dias
const RENDER_MAX_IDADE_MS = 45 * 24 * 60 * 60 * 1000; // 45 dias

async function limparPasta(dir: string, maxIdadeMs: number, descricao: string): Promise<number> {
  let removidos = 0;
  try {
    const ficheiros = await fs.readdir(dir);
    const agora = Date.now();

    for (const nome of ficheiros) {
      const ficheiroPath = path.join(dir, nome);
      const stat = await fs.stat(ficheiroPath).catch(() => null);
      if (!stat || !stat.isFile()) continue;

      const idade = agora - stat.mtimeMs;
      if (idade > maxIdadeMs) {
        await fs.unlink(ficheiroPath).catch(() => {});
        removidos++;
      }
    }
  } catch {
    // pasta não existe
  }

  console.log(`  ${descricao}: ${removidos} ficheiro(s) removido(s)`);
  return removidos;
}

async function limparRendersAntigos(): Promise<number> {
  const pastas = ['reels', 'stories', 'feed'];
  let removidos = 0;
  const agora = Date.now();

  // Buscar renders POSTED antigos do banco
  const renders = db.prepare(`
    SELECT id, reel_path FROM renders
    WHERE status = 'POSTED'
      AND posted_at IS NOT NULL
      AND datetime(posted_at) < datetime('now', '-45 days')
  `).all() as Array<{ id: number; reel_path: string }>;

  for (const r of renders) {
    try {
      await fs.unlink(r.reel_path);
      db.prepare(`UPDATE renders SET status = 'DELETED' WHERE id = ?`).run(r.id);
      removidos++;
    } catch {
      // ficheiro já não existe
    }
  }

  console.log(`  Renders antigos (>45 dias): ${removidos} ficheiro(s) removido(s)`);
  return removidos;
}

async function main() {
  console.log('Cleanup iniciado...\n');

  let total = 0;
  total += await limparPasta(TEMP_DIR, TEMP_MAX_IDADE_MS, 'Temp (>1h)');
  total += await limparPasta(LOGS_DIR, LOGS_MAX_IDADE_MS, 'Logs (>7 dias)');
  total += await limparRendersAntigos();

  console.log(`\nTotal: ${total} ficheiro(s) removido(s)`);
}

main().catch((err) => {
  console.error('Erro:', err.message);
  process.exit(1);
});