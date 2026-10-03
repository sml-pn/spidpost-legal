import { spawn } from 'node:child_process';

const ROOT = process.cwd();

type Step = { nome: string; cmd: string; args: string[]; fatal: boolean };

const STEPS: Step[] = [
  { nome: 'refresh', cmd: 'npx', args: ['tsx', 'src/jobs/refresh-ml.ts'], fatal: false },
  { nome: 'harvest', cmd: 'npx', args: ['tsx', 'src/jobs/harvester.ts'], fatal: true },
  { nome: 'render',  cmd: 'npx', args: ['tsx', 'src/jobs/renderer.ts'],  fatal: true },
  { nome: 'cleanup', cmd: 'npx', args: ['tsx', 'src/jobs/cleanup.ts'],    fatal: false },
  { nome: 'sync',    cmd: 'npx', args: ['tsx', 'src/jobs/sync-github.ts'], fatal: false },
];

function log(msg: string) {
  console.log(`\n[daily] ${msg}`);
}

function correrStep(step: Step): Promise<number> {
  return new Promise((resolve) => {
    log(`> ${step.nome.toUpperCase()}`);
    const p = spawn(step.cmd, step.args, {
      cwd: ROOT,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    p.on('exit', (code) => resolve(code ?? 1));
    p.on('error', (err) => {
      console.error(`[daily] erro a arrancar ${step.nome}:`, err.message);
      resolve(1);
    });
  });
}

async function main() {
  const t0 = Date.now();
  log(`Inicio. ${STEPS.length} passos.`);

  for (const step of STEPS) {
    const code = await correrStep(step);
    if (code !== 0) {
      if (step.fatal) {
        console.error(`\n[daily] PASSO FATAL FALHOU: ${step.nome} (codigo ${code}). Abortar.`);
        process.exit(code);
      } else {
        console.warn(`\n[daily] aviso: ${step.nome} saiu com codigo ${code}. Continuo.`);
      }
    }
  }

  const dur = ((Date.now() - t0) / 1000).toFixed(1);
  log(`FIM. Durou ${dur}s. Podes desligar o PC.`);
}

main().catch((e) => {
  console.error('[daily] ERRO FATAL:', e);
  process.exit(1);
});
