/**
 * imagekit.ts
 * ──────────────────────────────────────────────────────────────────────
 * Upload de ficheiros (vídeos/imagens) para o ImageKit.io.
 *
 * Porque: a API do Instagram precisa de uma URL pública para buscar o
 * ficheiro. O ImageKit devolve essa URL após upload.
 *
 * Autenticação: Basic Auth com a PRIVATE_KEY.
 *   Authorization: Basic base64(private_key + ':')
 *
 * Docs: https://docs.imagekit.io/api-reference/upload-file-api
 * ──────────────────────────────────────────────────────────────────────
 */

import fs from 'node:fs';
import path from 'node:path';

const UPLOAD_URL = 'https://upload.imagekit.io/api/v1/files/upload';
const TIMEOUT_MS = 60_000;

/**
 * Faz upload de um ficheiro local para o ImageKit e devolve a URL pública.
 *
 * @param filePath  Caminho local do ficheiro (ex: renders/reels/reel-1-A.mp4)
 * @param pasta     Pasta no ImageKit (ex: 'reels', 'stories', 'feed')
 */
export async function uploadImageKit(filePath: string, pasta: string = 'spidpost'): Promise<string> {
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
  if (!privateKey) throw new Error('IMAGEKIT_PRIVATE_KEY nao definida no .env');

  if (!fs.existsSync(filePath)) {
    throw new Error(`Ficheiro nao encontrado: ${filePath}`);
  }

  const fileName = path.basename(filePath);
  const fileBuffer = fs.readFileSync(filePath);

  // FormData do Node 18+ (nativo)
  const form = new FormData();
  form.append('file', new Blob([fileBuffer]), fileName);
  form.append('fileName', fileName);
  form.append('folder', `/spidpost/${pasta}`);
  form.append('useUniqueFileName', 'true');

  // Basic Auth: base64("private_key:")
  const authHeader = 'Basic ' + Buffer.from(`${privateKey}:`).toString('base64');

  console.log(`  [imagekit] Upload: ${fileName} (${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB)`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(UPLOAD_URL, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
      },
      body: form,
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`ImageKit HTTP ${res.status}: ${err.slice(0, 300)}`);
    }

    const data = await res.json() as { url?: string; filePath?: string };
    if (!data.url) throw new Error('ImageKit nao devolveu URL');

    console.log(`  [imagekit] OK -> ${data.url}`);
    return data.url;
  } finally {
    clearTimeout(timer);
  }
}
