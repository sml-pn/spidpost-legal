import { execSync } from 'node:child_process';

const ROOT = process.cwd();

function run(cmd: string): string {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function ts(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function log(msg: string) {
  console.log(`[sync ${new Date().toLocaleTimeString('pt-PT')}] ${msg}`);
}

async function main() {
  log('A verificar estado do git...');

  try {
    run('git rev-parse --is-inside-work-tree');
  } catch {
    throw new Error('Nao e um repositorio git. Abortar.');
  }

  const status = run('git status --porcelain data.db');
  if (!status) {
    log('data.db sem alteracoes. Nada a fazer.');
    return;
  }

  log(`data.db mudou: ${status}`);

  log('A fazer pull --rebase...');
  try {
    run('git pull --rebase origin main');
  } catch (e) {
    log('Aviso: pull falhou. Continuo.');
  }

  run('git add data.db');
  try {
    run(`git commit -m "sync: data.db ${ts()} [skip ci]"`);
    log('Commit feito.');
  } catch (e) {
    log('Nada a commitar.');
    return;
  }

  log('A fazer push...');
  try {
    const out = run('git push origin main');
    log(`Push OK. ${out}`);
  } catch (e: any) {
    throw new Error(`Push falhou: ${e?.stdout || e?.message || e}`);
  }

  log('Sync concluido.');
}

main().catch((e) => {
  console.error('[sync] ERRO:', e?.message || e);
  process.exit(1);
});
