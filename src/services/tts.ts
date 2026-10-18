import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export type TTSOptions = {
  texto: string;
  outputPath: string;
  voice?: string;
  rate?: string;
};

export const VOZES_PTBR = {
  masculina: 'pt-BR-AntonioNeural',
  feminina: 'pt-BR-FranciscaNeural',
  masculina_alt: 'pt-BR-DonatoNeural',
  feminina_alt: 'pt-BR-BrendaNeural',
} as const;

/**
 * Executa o edge-tts (Python) via spawn.
 */
function executarEdgeTts(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('py', args, { windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', (c) => { stderr += c.toString(); });
    proc.on('error', (err) => reject(new Error('spawn py falhou: ' + err.message)));
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`edge-tts exit ${code}: ${stderr.slice(-300)}`));
    });
  });
}

/**
 * Gera audio usando edge-tts (Python CLI).
 * Voz neural pt-BR nativa, sem dependencia de bibliotecas Node.
 */
export async function gerarAudio(options: TTSOptions): Promise<string> {
  const {
    texto,
    outputPath,
    voice = VOZES_PTBR.masculina,
    rate = '+0%',
  } = options;

  const MAX_TENTATIVAS = 3;
  let ultimoErro: Error | null = null;

  // Escrever texto num ficheiro temporario (evita problemas de escaping)
  const tmpFile = path.join(os.tmpdir(), `tts-${Date.now()}.txt`);
  await fs.writeFile(tmpFile, texto, 'utf-8');

  try {
    for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
      try {
        console.log(`  [tts] Tentativa ${tentativa}/${MAX_TENTATIVAS} (Edge TTS Python)...`);

        await executarEdgeTts([
          '-m', 'edge_tts',
          '--voice', voice,
          `--rate=${rate}`,
          '--file', tmpFile,
          '--write-media', outputPath,
        ]);

        const stat = await fs.stat(outputPath).catch(() => null);
        if (!stat || stat.size < 1000) {
          throw new Error(`Ficheiro gerado demasiado pequeno (${stat?.size ?? 0} bytes)`);
        }

        console.log(`  [tts] OK - ${(stat.size / 1024).toFixed(0)} KB`);
        return outputPath;
      } catch (err) {
        ultimoErro = err as Error;
        console.log(`  [tts] Falha: ${ultimoErro.message}`);

        if (tentativa < MAX_TENTATIVAS) {
          const espera = tentativa * 2000;
          console.log(`  [tts] Aguardando ${espera}ms...`);
          await new Promise((r) => setTimeout(r, espera));
        }
      }
    }

    throw new Error(`TTS falhou apos ${MAX_TENTATIVAS} tentativas: ${ultimoErro?.message}`);
  } finally {
    await fs.unlink(tmpFile).catch(() => { /* ignora */ });
  }
}
