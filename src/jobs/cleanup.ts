/**
 * cleanup.ts
 * ──────────────────────────────────────────────────────────────────────
 * Limpa ficheiros temporários e renders antigos.
 *
 * Regras:
 *   1. renders/temp/* → apaga ficheiros com mais de 1 hora
 *   2. renders/reels/*, stories/*, feed/* → apaga os POSTED com mais de 24h
 *   3. renders/* → apaga QUALQUER ficheiro com mais de 7 dias (mesmo READY)
 *   4. logs/*.log → apaga com mais de 7 dias
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
const RENDER_MAX_IDADE_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias
const POSTED_MAX_IDADE_HORAS = 24;                   // 24 horas

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
  let removidos = 0;

  // 1. Renders POSTED com mais de 24h
  const posted = db.prepare(`
    SELECT id, reel_path FROM renders
    WHERE status = 'POSTED'
      AND posted_at IS NOT NULL
      AND datetime(posted_at) < datetime('now', '-${POSTED_MAX_IDADE_HORAS} hours')
  `).all() as Array<{ id: number; reel_path: string }>;

  for (const r of posted) {
    try {
      await fs.unlink(r.reel_path);
      db.prepare(`UPDATE renders SET status = 'DELETED' WHERE id = ?`).run(r.id);
      removidos++;
    } catch {
      // ficheiro já não existe — marca na DB na mesma
      db.prepare(`UPDATE renders SET status = 'DELETED' WHERE id = ?`).run(r.id);
    }
  }
  console.log(`  Renders POSTED (>24h): ${removidos} ficheiro(s) removido(s)`);

  // 2. Qualquer render com mais de 7 dias (mesmo READY)
  const pastas = ['reels', 'stories', 'feed'];
  const agora = Date.now();
  let velhos = 0;

  for (const pasta of pastas) {
    const dir = path.join(ROOT, 'renders', pasta);
    try {
      const ficheiros = await fs.readdir(dir);
      for (const nome of ficheiros) {
        const ficheiroPath = path.join(dir, nome);
        const stat = await fs.stat(ficheiroPath).catch(() => null);
        if (!stat || !stat.isFile()) continue;

        const idade = agora - stat.mtimeMs;
        if (idade > RENDER_MAX_IDADE_MS) {
          await fs.unlink(ficheiroPath).catch(() => {});
          velhos++;
        }
      }
    } catch {
      // pasta não existe
    }
  }
  console.log(`  Renders >7 dias: ${velhos} ficheiro(s) removido(s)`);

  return removidos + velhos;
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