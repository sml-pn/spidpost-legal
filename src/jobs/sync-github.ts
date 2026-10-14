/**
 * sync-github.ts
 * ─────────────────────────────────────────────────────────────
 * Faz commit + push do data.db para o GitHub.
 *
 * [v2 - ORDEM CORRIGIDA]
 *   1. Commit PRIMEIRO (antes do pull)
 *   2. pull --rebase
 *   3. Auto-resolve conflito em data.db (ficheiro binário)
 *   4. Push
 *
 * Uso: npm run sync
 *      (chamado pelo daily.ts no fim)
 */

import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const MAX_TENTATIVAS = 3;

function run(cmd: string): string {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function runSilent(cmd: string): { ok: boolean; out: string } {
  try {
    const out = execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    return { ok: true, out };
  } catch (e: any) {
    const out = (e?.stdout || '') + (e?.stderr || '') + (e?.message || '');
    return { ok: false, out };
  }
}

function ts(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function log(msg: string) {
  console.log(`[sync ${new Date().toLocaleTimeString('pt-PT')}] ${msg}`);
}

function resolverConflitoDataDb(): boolean {
  // Durante o rebase, --theirs = o commit sendo aplicado = o NOSSO local
  const r1 = runSilent('git checkout --theirs data.db');
  const r2 = runSilent('git add data.db');
  const r3 = runSilent('git -c core.editor=true rebase --continue');
  return r1.ok && r2.ok && r3.ok;
}

async function main() {
  log('A verificar estado do git...');

  try {
    run('git rev-parse --is-inside-work-tree');
  } catch {
    throw new Error('Nao e um repositorio git. Abortar.');
  }

  // 1. Ver se data.db mudou
  const status = run('git status --porcelain data.db');
  if (!status) {
    log('data.db sem alteracoes. Nada a fazer.');
    return;
  }

  log(`data.db mudou: ${status}`);

  // ─── FASE 1: Commit PRIMEIRO (ordem correcta) ───
  log('A adicionar data.db ao staging...');
  run('git add data.db');

  log('A fazer commit...');
  try {
    run(`git commit -m "sync: data.db ${ts()} [skip ci]"`);
    log('Commit feito.');
  } catch (e) {
    log('Nada a commitar (possivelmente ja estava).');
    return;
  }

  // ─── FASE 2: Pull --rebase (agora funciona: nada por commitar) ───
  let rebaseOk = false;
  for (let tent = 1; tent <= MAX_TENTATIVAS; tent++) {
    log(`A fazer pull --rebase (tentativa ${tent}/${MAX_TENTATIVAS})...`);

    const pull = runSilent('git pull --rebase origin main');

    if (pull.ok) {
      log('Pull OK.');
      rebaseOk = true;
      break;
    }

    // Se o pull falhou por conflito no data.db
    if (pull.out.includes('CONFLICT') || pull.out.includes('conflict')) {
      log('Conflito detectado. A resolver (ficando com data.db local)...');
      if (resolverConflitoDataDb()) {
        log('Rebase concluido.');
        rebaseOk = true;
        break;
      } else {
        log('Falha ao resolver conflito. A abortar rebase e tentar de novo...');
        runSilent('git rebase --abort');
        await new Promise((r) => setTimeout(r, 2000 * tent));
        continue;
      }
    }

    log(`Pull falhou (nao e conflito): ${pull.out.slice(0, 200)}`);
    await new Promise((r) => setTimeout(r, 2000 * tent));
  }

  if (!rebaseOk) {
    log('AVISO: pull --rebase falhou apos varias tentativas. Continuo mesmo assim.');
  }

  // ─── FASE 3: Push ───
  log('A fazer push...');
  let pushOk = false;
  for (let tent = 1; tent <= MAX_TENTATIVAS; tent++) {
    const push = runSilent('git push origin main');
    if (push.ok) {
      log('Push OK.');
      pushOk = true;
      break;
    }

    // Se o push falhou porque ficou atras (rebase nao chegou), tenta rebase outra vez
    if (push.out.includes('rejected') || push.out.includes('fetch first')) {
      log('Push rejeitado (atras do remoto). A tentar rebase novamente...');
      const pull2 = runSilent('git pull --rebase origin main');
      if (!pull2.ok && (pull2.out.includes('CONFLICT') || pull2.out.includes('conflict'))) {
        resolverConflitoDataDb();
      }
    }

    await new Promise((r) => setTimeout(r, 2000 * tent));
  }

  if (!pushOk) {
    throw new Error('Push falhou apos varias tentativas.');
  }

  log('Sync concluido.');
}

main().catch((e) => {
  console.error('[sync] ERRO:', e?.message || e);
  process.exit(1);
});
