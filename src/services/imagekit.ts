/**
 * imagekit.ts
 * ---------------------------------------------------------------------------
 * Upload de ficheiros (videos/imagens) para o ImageKit.io.
 *
 * Usa o modulo nativo `https` do Node (nao undici/fetch) porque o undici
 * aborta uploads multipart grandes com "This operation was aborted" em
 * redes instaveis. O https.request e mais robusto para bodies >1MB.
 *
 * Autenticacao: Basic Auth com a PRIVATE_KEY.
 *   Authorization: Basic base64(private_key + ':')
 *
 * Docs: https://docs.imagekit.io/api-reference/upload-file-api
 * ---------------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';

const UPLOAD_URL = 'https://upload.imagekit.io/api/v1/files/upload';
const TIMEOUT_MS = 180_000; // 3 min por tentativa
const MAX_TENTATIVAS = 3;

/**
 * Faz upload de um ficheiro local para o ImageKit e devolve a URL publica.
 * Faz 3 tentativas internas com backoff exponencial.
 */
export async function uploadImageKit(filePath: string, pasta: string = 'spidpost'): Promise<string> {
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
  if (!privateKey) throw new Error('IMAGEKIT_PRIVATE_KEY nao definida no .env');

  if (!fs.existsSync(filePath)) {
    throw new Error(`Ficheiro nao encontrado: ${filePath}`);
  }

  const fileName = path.basename(filePath);
  const fileBuffer = fs.readFileSync(filePath);
  const authHeader = 'Basic ' + Buffer.from(`${privateKey}:`).toString('base64');

  console.log(`  [imagekit] Upload: ${fileName} (${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB)`);

  let ultimoErro: Error | null = null;

  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    try {
      const data = await uploadViaHttps(fileBuffer, fileName, pasta, authHeader);
      if (!data.url) throw new Error('ImageKit nao devolveu URL');
      console.log(`  [imagekit] OK -> ${data.url}`);
      return data.url;
    } catch (err) {
      ultimoErro = err as Error;
      console.log(`  [imagekit] Tentativa ${tentativa}/${MAX_TENTATIVAS} falhou: ${ultimoErro.message}`);
      if (tentativa < MAX_TENTATIVAS) {
        const espera = tentativa * 5000;
        await new Promise((r) => setTimeout(r, espera));
      }
    }
  }

  throw new Error(`ImageKit falhou apos ${MAX_TENTATIVAS} tentativas: ${ultimoErro?.message}`);
}

/**
 * Upload multipart via https.request nativo do Node.
 */
function uploadViaHttps(
  fileBuffer: Buffer,
  fileName: string,
  pasta: string,
  authHeader: string,
): Promise<{ url?: string; filePath?: string }> {
  return new Promise((resolve, reject) => {
    const boundary = '----SpidPostBoundary' + Date.now() + Math.random().toString(36).slice(2);

    const parts: Buffer[] = [];

    // Campo "file"
    parts.push(Buffer.from(`--${boundary}\r\n`));
    parts.push(Buffer.from(`Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`));
    parts.push(Buffer.from(`Content-Type: application/octet-stream\r\n\r\n`));
    parts.push(fileBuffer);
    parts.push(Buffer.from('\r\n'));

    // Campo "fileName"
    parts.push(Buffer.from(`--${boundary}\r\n`));
    parts.push(Buffer.from(`Content-Disposition: form-data; name="fileName"\r\n\r\n`));
    parts.push(Buffer.from(fileName + '\r\n'));

    // Campo "folder"
    parts.push(Buffer.from(`--${boundary}\r\n`));
    parts.push(Buffer.from(`Content-Disposition: form-data; name="folder"\r\n\r\n`));
    parts.push(Buffer.from(`/spidpost/${pasta}` + '\r\n'));

    // Campo "useUniqueFileName"
    parts.push(Buffer.from(`--${boundary}\r\n`));
    parts.push(Buffer.from(`Content-Disposition: form-data; name="useUniqueFileName"\r\n\r\n`));
    parts.push(Buffer.from('true\r\n'));

    // Fecho
    parts.push(Buffer.from(`--${boundary}--\r\n`));

    const body = Buffer.concat(parts);
    const u = new URL(UPLOAD_URL);

    const req = https.request(
      {
        hostname: u.hostname,
        port: 443,
        path: u.pathname,
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length.toString(),
          'Connection': 'close',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk.toString(); });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try { resolve(JSON.parse(data)); }
            catch { reject(new Error(`JSON invalido: ${data.slice(0, 200)}`)); }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 300)}`));
          }
        });
      },
    );

    req.on('error', (err) => reject(err));
    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy(new Error(`timeout ${TIMEOUT_MS / 1000}s`));
    });

    req.write(body);
    req.end();
  });
}
