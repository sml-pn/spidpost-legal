/**
 * clean-files.ts
 * ──────────────────────────────────────────────────────────────────────
 * Limpa ficheiros de renders no disco.
 *
 * Regras:
 *   1. temp/ → apaga TUDO
 *   2. Renders POSTED há mais de 30 dias → apaga ficheiros
 *   3. Ficheiros sem registo no banco → apaga (órfãos)
 *   4. Renders READY → mantém sempre
 * ──────────────────────────────────────────────────────────────────────
 */

import fs from 'node:fs';
import path from 'node:path';
import { db } from './src/lib/db.js';

const RENDERS_DIR = path.join(process.cwd(), 'renders');
const TEMP_DIR = path.join(RENDERS_DIR, 'temp');
const DIAS_MANTER_POSTED = 30;

function tamanhoMB(p: string): number {
  try { return fs.statSync(p).size / (1024 * 1024); } catch { return 0; }
}

/** Aceita paths absolutos OU relativos */
function resolverPath(p: string): string {
  if (path.isAbsolute(p)) return p;
  return path.join(process.cwd(), p);
}

console.log('═══════════════════════════════════════════════════════════');
console.log('  LIMPEZA DE FICHEIROS');
console.log('═══════════════════════════════════════════════════════════');

let totalRemovidos = 0;
let totalMB = 0;

// ─────────────────────────────────────────────────────────────────────
// 1. Temp
// ─────────────────────────────────────────────────────────────────────
console.log('\n--- 1. Limpar temp/ ---');
if (fs.existsSync(TEMP_DIR)) {
  const files = fs.readdirSync(TEMP_DIR);
  for (const f of files) {
    const p = path.join(TEMP_DIR, f);
    const mb = tamanhoMB(p);
    try {
      fs.unlinkSync(p);
      console.log(`  X ${f} (${mb.toFixed(2)} MB)`);
      totalRemovidos++;
      totalMB += mb;
    } catch { /* ignore */ }
  }
  if (files.length === 0) console.log('  (vazio)');
}

// ─────────────────────────────────────────────────────────────────────
// 2. Ficheiros POSTED com mais de 30 dias
// ─────────────────────────────────────────────────────────────────────
console.log(`\n--- 2. Ficheiros POSTED (>${DIAS_MANTER_POSTED} dias) ---`);
const posted = db.prepare(`
  SELECT id, reel_path, posted_at FROM renders
  WHERE status = 'POSTED'
    AND posted_at IS NOT NULL
    AND datetime(posted_at) < datetime('now', '-${DIAS_MANTER_POSTED} days')
`).all() as any[];

let postedRemovidos = 0;
for (const r of posted) {
  if (!r.reel_path) continue;
  const p = resolverPath(r.reel_path);
  if (fs.existsSync(p)) {
    const mb = tamanhoMB(p);
    try {
      fs.unlinkSync(p);
      console.log(`  X ${path.basename(p)} (${mb.toFixed(2)} MB) — publicado em ${r.posted_at}`);
      totalRemovidos++;
      totalMB += mb;
      postedRemovidos++;
    } catch { /* ignore */ }
  }
}
if (postedRemovidos === 0) console.log(`  (nenhum com mais de ${DIAS_MANTER_POSTED} dias)`);

// ─────────────────────────────────────────────────────────────────────
// 3. Órfãos (ficheiros no disco sem registo no banco)
// ─────────────────────────────────────────────────────────────────────
console.log('\n--- 3. Ficheiros órfãos ---');

// Nomes de ficheiros válidos (só o basename)
const todos = db.prepare(`SELECT reel_path FROM renders`).all() as any[];
const basenamesValidos = new Set(todos.map((r: any) => path.basename(r.reel_path)));

const subdirs = ['reels', 'stories', 'feed'];
let orfaos = 0;

for (const sub of subdirs) {
  const dir = path.join(RENDERS_DIR, sub);
  if (!fs.existsSync(dir)) continue;

  for (const f of fs.readdirSync(dir)) {
    if (!basenamesValidos.has(f)) {
      const p = path.join(dir, f);
      const mb = tamanhoMB(p);
      try {
        fs.unlinkSync(p);
        console.log(`  X ${sub}/${f} (${mb.toFixed(2)} MB)`);
        totalRemovidos++;
        totalMB += mb;
        orfaos++;
      } catch { /* ignore */ }
    }
  }
}
if (orfaos === 0) console.log('  (nenhum)');

// ─────────────────────────────────────────────────────────────────────
// Resumo
// ─────────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════════');
console.log(`  ${totalRemovidos} ficheiros removidos`);
console.log(`  ${totalMB.toFixed(2)} MB libertados`);
console.log('═══════════════════════════════════════════════════════════');

console.log('\n--- Estado final ---');
for (const sub of subdirs) {
  const dir = path.join(RENDERS_DIR, sub);
  if (!fs.existsSync(dir)) continue;
  const files = fs.readdirSync(dir);
  const tamanho = files.reduce((acc, f) => acc + tamanhoMB(path.join(dir, f)), 0);
  console.log(`  renders/${sub.padEnd(10)} ${files.length} ficheiros, ${tamanho.toFixed(2)} MB`);
}

const dbCounts = db.prepare(`SELECT status, COUNT(*) as c FROM renders GROUP BY status`).all() as any[];
console.log('\n--- Renders no banco ---');
dbCounts.forEach((r: any) => console.log(`  ${r.status}: ${r.c}`));