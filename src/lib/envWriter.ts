/**
 * envWriter.ts
 * ──────────────────────────────────────────────────────────────────────
 * Atualiza variáveis no .env de forma segura (atómica).
 *
 * - Lê todas as linhas
 * - Substitui apenas a linha alvo
 * - Escreve num ficheiro temporário
 * - Faz rename (atómico em Windows via Move-Item)
 * ──────────────────────────────────────────────────────────────────────
 */

import fs from 'node:fs';
import path from 'node:path';

const ENV_PATH = path.join(process.cwd(), '.env');
const TMP_PATH = ENV_PATH + '.tmp';

export function atualizarEnv(chave: string, valor: string): void {
  if (!chave || chave.includes('=')) {
    throw new Error(`Chave invalida: "${chave}"`);
  }

  const conteudo = fs.readFileSync(ENV_PATH, 'utf-8');
  const linhas = conteudo.split(/\r?\n/);

  let encontrou = false;
  const novas = linhas.map((linha) => {
    if (linha.startsWith(`${chave}=`)) {
      encontrou = true;
      return `${chave}=${valor}`;
    }
    return linha;
  });

  if (!encontrou) {
    novas.push(`${chave}=${valor}`);
  }

  // Escrita atómica: escreve em .tmp depois renomeia
  fs.writeFileSync(TMP_PATH, novas.join('\n'), 'utf-8');
  fs.renameSync(TMP_PATH, ENV_PATH);
}

export function lerEnv(chave: string): string | null {
  const conteudo = fs.readFileSync(ENV_PATH, 'utf-8');
  const match = conteudo.match(new RegExp(`^${chave}=(.+)$`, 'm'));
  return match ? match[1].trim() : null;
}

export function envExiste(): boolean {
  return fs.existsSync(ENV_PATH);
}
/**
 * Lê a URL do túnel do .env a cada chamada (não usa cache).
 * Uso: no servidor, sempre que precisar da URL atual.
 */
export function getTunnelUrlAtual(): string | null {
  try {
    const conteudo = fs.readFileSync(ENV_PATH, 'utf-8');
    const match = conteudo.match(/^PUBLIC_VIDEO_BASE_URL=(.+)$/m);
    if (match && match[1].trim()) return match[1].trim();
    return null;
  } catch {
    return null;
  }
}
