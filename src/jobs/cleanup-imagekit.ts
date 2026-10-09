/**
 * cleanup-imagekit.ts
 * Limpa ficheiros antigos do ImageKit via API.
 *
 * Uso:
 *   npm run cleanup-imagekit              -> dry run (so mostra)
 *   npm run cleanup-imagekit -- --confirm -> apaga mesmo
 *   npm run cleanup-imagekit -- --days=60 -> so >60 dias (default 30)
 */

import '../lib/env.js';
import { db } from '../lib/db.js';

const PRIVATE_KEY = process.env.IMAGEKIT_PRIVATE_KEY;
if (!PRIVATE_KEY) {
  console.error('ERRO: IMAGEKIT_PRIVATE_KEY nao definida no .env');
  process.exit(1);
}

const AUTH = 'Basic ' + Buffer.from(PRIVATE_KEY + ':').toString('base64');
const API_BASE = 'https://api.imagekit.io/v1';

const args = process.argv.slice(2);
const CONFIRM = args.includes('--confirm');
const DAYS_ARG = args.find(a => a.startsWith('--days='));
const DAYS = DAYS_ARG ? parseInt(DAYS_ARG.split('=')[1], 10) : 30;
const MAX_AGE_MS = DAYS * 24 * 60 * 60 * 1000;

interface ImageKitFile {
  fileId: string;
  name: string;
  url: string;
  filePath: string;
  createdAt: string;
  size: number;
}

async function listarTodos(): Promise<ImageKitFile[]> {
  const todos: ImageKitFile[] = [];
  let skip = 0;
  const limit = 1000;

  while (true) {
    const url = API_BASE + '/files?limit=' + limit + '&skip=' + skip + '&sort=ASC_CREATED';
    const res = await fetch(url, { headers: { Authorization: AUTH } });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error('ImageKit list HTTP ' + res.status + ': ' + txt.slice(0, 200));
    }
    const pagina = (await res.json()) as ImageKitFile[];
    if (pagina.length === 0) break;
    todos.push(...pagina);
    if (pagina.length < limit) break;
    skip += limit;
  }
  return todos;
}

async function apagar(fileId: string): Promise<boolean> {
  const res = await fetch(API_BASE + '/files/' + fileId, {
    method: 'DELETE',
    headers: { Authorization: AUTH },
  });
  return res.ok;
}

function estaNaDB(url: string): boolean {
  const r = db.prepare(
    "SELECT 1 FROM renders WHERE reel_url = ? AND status IN ('READY', 'POSTED') LIMIT 1"
  ).get(url);
  return !!r;
}

async function main() {
  console.log('Cleanup ImageKit iniciado.');
  console.log('  Modo: ' + (CONFIRM ? 'APAGAR' : 'DRY RUN (so mostra)'));
  console.log('  Idade minima: ' + DAYS + ' dias\n');

  console.log('A listar ficheiros no ImageKit...');
  const todos = await listarTodos();
  console.log('  Total no ImageKit: ' + todos.length + '\n');

  const agora = Date.now();
  const candidatos: ImageKitFile[] = [];
  const protegidos: ImageKitFile[] = [];
  const recentes: ImageKitFile[] = [];

  for (const f of todos) {
    const idade = agora - new Date(f.createdAt).getTime();
    if (idade < MAX_AGE_MS) {
      recentes.push(f);
      continue;
    }
    if (estaNaDB(f.url)) {
      protegidos.push(f);
      continue;
    }
    candidatos.push(f);
  }

  console.log('Resumo:');
  console.log('  Recentes (<' + DAYS + 'd): ' + recentes.length);
  console.log('  Protegidos (READY/POSTED na DB): ' + protegidos.length);
  console.log('  Candidatos a apagar: ' + candidatos.length + '\n');

  const totalBytes = candidatos.reduce((s, f) => s + (f.size || 0), 0);
  console.log('Espaco a libertar: ' + (totalBytes / 1024 / 1024).toFixed(1) + ' MB\n');

  if (candidatos.length === 0) {
    console.log('Nada a apagar.');
    return;
  }

  console.log('Primeiros 10 candidatos:');
  candidatos.slice(0, 10).forEach(f => {
    const idade = Math.floor((agora - new Date(f.createdAt).getTime()) / (24 * 60 * 60 * 1000));
    console.log('  ' + f.name + ' (' + idade + 'd, ' + (f.size / 1024).toFixed(0) + ' KB)');
  });

  if (!CONFIRM) {
    console.log('\nDRY RUN. Para apagar mesmo, corre:');
    console.log('  npm run cleanup-imagekit -- --confirm');
    return;
  }

  console.log('\nA apagar...');
  let ok = 0, fail = 0;
  for (const f of candidatos) {
    const sucesso = await apagar(f.fileId);
    if (sucesso) { ok++; } else { fail++; }
  }
  console.log('\nApagados: ' + ok + ' | Falhas: ' + fail);
  console.log('Espaco libertado: ' + (totalBytes / 1024 / 1024).toFixed(1) + ' MB');
}

main().catch(e => {
  console.error('ERRO:', e.message);
  process.exit(1);
});
