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
  const ts = () => new Date().toLocaleTimeString('pt-BR');

  log('A verificar estado do git...');
  const status = run('git status --porcelain data.db docs/products.json docs/index.html');
  
  if (!status) {
    log('Sem alteracoes para sincronizar.');
    return;
  }

  log('A guardar alteracoes locais...');
  run('git add data.db docs/products.json docs/index.html');
  run(`git commit -m "sync: data.db + landing ${ts()} [skip ci]"`);

  log('A sincronizar com o remoto (estilo forçado)...');
  try {
    // Puxa a versão do remoto para saber onde estamos
    runSilent('git fetch origin main');
    
    // Faz o rebase. Como commitamos antes, o git tenta aplicar o nosso commit por cima
    const pull = runSilent('git pull --rebase origin main');
    
    if (pull.includes('CONFLICT') || pull.includes('could not apply')) {
      log('Conflito detectado no rebase. A resolver...');
      // Se houver conflito no data.db, ficamos com o nosso (theirs no rebase context)
      runSilent('git checkout --theirs data.db');
      runSilent('git add data.db');
      // Para os docs, se houver conflito, ficamos com o nosso
      runSilent('git checkout --theirs docs/ 2>nul || git add docs/');
      runSilent('git add docs/');
      
      const cont = runSilent('git rebase --continue');
      if (cont.includes('error') || cont.includes('fatal')) {
        log('Rebase falhou. A abortar e forçar push...');
        runSilent('git rebase --abort');
        run('git push origin main -f');
        log('Push forçado concluído!');
        return;
      }
    }
    
    // Se chegou aqui, o rebase correu bem ou não houve conflito
    const push = runSilent('git push origin main');
    if (push.includes('rejected')) {
      log('Push rejeitado. A forçar envio...');
      run('git push origin main -f');
    }
    log('Sync concluído com sucesso!');
    
  } catch (err) {
    log('Erro no sync. A tentar forçar push...');
    runSilent('git rebase --abort');
    try {
      run('git push origin main -f');
      log('Push forçado de emergência concluído.');
    } catch (e) {
      log('Falha total no push. Verifique a ligação à internet.');
    }
  }
}

main().catch((e) => {
  console.error('[sync] ERRO:', e?.message || e);
  process.exit(1);
});
