/**
 * scheduler.ts
 * ──────────────────────────────────────────────────────────────────────
 * Corredor automático de jobs com locks por categoria.
 *
 * Regras:
 *   - Jobs críticos (render, publish) NÃO correm em paralelo entre si
 *   - Jobs secundários (refresh, harvest, cleanup) correm livremente
 *   - Timeout de 5 min por job
 * ──────────────────────────────────────────────────────────────────────
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

type JobName = 'refresh' | 'harvest' | 'render' | 'publish' | 'cleanup';
type JobCategory = 'critical' | 'secondary';

type Job = {
  name: JobName;
  file: string;
  intervalMs: number;
  runOnStart: boolean;
  category: JobCategory;
  maxDurationMs: number;
};

const HORA = 60 * 60 * 1000;
const MIN = 60 * 1000;

const JOBS: Job[] = [
  { name: 'refresh', file: 'src/jobs/refresh-ml.ts', intervalMs: 5 * HORA, runOnStart: true, category: 'secondary', maxDurationMs: 2 * MIN },
  { name: 'harvest', file: 'src/jobs/harvester.ts', intervalMs: 6 * HORA, runOnStart: true,  category: 'secondary', maxDurationMs: 10 * MIN },
  { name: 'render', file: 'src/jobs/renderer.ts', intervalMs: 5 * MIN, runOnStart: false, category: 'secondary', maxDurationMs: 10 * MIN },
  { name: 'publish', file: 'src/jobs/publisher.ts', intervalMs: 5 * MIN, runOnStart: false, category: 'critical', maxDurationMs: 15 * MIN },
  { name: 'cleanup', file: 'src/jobs/cleanup.ts', intervalMs: 24 * HORA, runOnStart: false, category: 'secondary', maxDurationMs: 5 * MIN },
];

// Travas por categoria
const catRunning = new Set<JobCategory>();

function ts(): string {
  // Hora local (nao UTC)
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return hh + ':' + mm + ':' + ss;
}

function log(msg: string): void {
  console.log(`[${ts()}] ${msg}`);
}

function executarJob(job: Job): Promise<boolean> {
  return new Promise((resolve) => {
    const filePath = path.join(ROOT, job.file);
    const start = Date.now();

    log(`> [${job.name}] iniciando (${job.category})...`);

    const proc = spawn('npx', ['tsx', filePath], {
      cwd: ROOT,
      shell: true,
      windowsHide: true,
    });

    const timeout = setTimeout(() => {
      log(`X [${job.name}] excedeu ${job.maxDurationMs / 1000}s — matando`);
      try { proc.kill(); } catch { /* ignore */ }
    }, job.maxDurationMs);

    proc.stdout.on('data', (data) => {
      for (const l of data.toString().split(/\r?\n/)) {
        if (l.trim()) log(`  [${job.name}] ${l.trim()}`);
      }
    });

    proc.stderr.on('data', (data) => {
      for (const l of data.toString().split(/\r?\n/)) {
        if (l.trim()) log(`  [${job.name}] AVISO ${l.trim()}`);
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      log(`X [${job.name}] spawn erro: ${err.message}`);
      resolve(false);
    });

    proc.on('close', (code) => {
      clearTimeout(timeout);
      const dur = ((Date.now() - start) / 1000).toFixed(1);
      if (code === 0) log(`OK [${job.name}] fim (${dur}s)`);
      else log(`ERRO [${job.name}] exit ${code} (${dur}s)`);
      resolve(code === 0);
    });
  });
}

async function rodarJob(job: Job): Promise<void> {
  // Verificar trava por categoria
  if (catRunning.has(job.category)) {
    log(`SKIP [${job.name}] — categoria "${job.category}" ocupada`);
    return;
  }

  catRunning.add(job.category);
  try {
    await executarJob(job);
  } finally {
    catRunning.delete(job.category);
  }
}

async function iniciar(): Promise<void> {
  console.log('==============================================');
  console.log('  SPIDPOST - SCHEDULER');
  console.log('==============================================');
  log('Scheduler iniciado');
  log(`Pasta raiz: ${ROOT}`);
  console.log('');

  log('Jobs agendados:');
  for (const j of JOBS) {
    const min = (j.intervalMs / MIN).toFixed(0);
    log(`  - ${j.name.padEnd(10)} cada ${min.padStart(3)} min [${j.category}]${j.runOnStart ? ' (corre agora)' : ''}`);
  }
  console.log('');

  // Correr jobs do arranque em sequência
  for (const job of JOBS.filter((j) => j.runOnStart)) {
    await rodarJob(job);
  }

  // Agendar
  for (const job of JOBS) {
    setInterval(() => {
      rodarJob(job).catch((err) => {
        log(`X [${job.name}] erro: ${(err as Error).message}`);
      });
    }, job.intervalMs);
  }

  console.log('');
  log('Aguardando próximos agendamentos... (Ctrl+C para parar)');
  log('');
}

process.on('SIGINT', () => {
  console.log('');
  log('Scheduler parado.');
  process.exit(0);
});

iniciar().catch((err) => {
  console.error('Erro fatal:', err);
  process.exit(1);
});