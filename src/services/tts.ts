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
  feminina_alt: 'pt-BR-ThalitaMultilingualNeural',
} as const;

/** Voz por variação A/B/C */
export const VOZ_POR_VARIACAO: Record<'A' | 'B' | 'C', string> = {
  A: VOZES_PTBR.masculina,    // Antonio (educacional, autoridade)
  B: VOZES_PTBR.feminina,     // Francisca (económico, próxima)
  C: VOZES_PTBR.feminina_alt, // Thalita (cenário, narrativa)
};

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
/**
 * Naturaliza medidas e unidades para o TTS ler de forma humana.
 * Ex: "400w" -> "400 watts"; "127/220v" -> "127 ou 220 volts"; "IP67" -> "IP 67".
 */
export function naturalizarMedidas(texto: string): string {
  return texto
    .replace(/\bIP\s*(\d+)\b/gi, 'IP $1')
    .replace(/\b(\d+)\s*[kK][wW]\b/g, '$1 quilowatts')
    .replace(/\b(\d+(?:[.,]\d+)?)\s*[wW]\b/g, '$1 watts')
    .replace(/\b(\d+)\s*\/\s*(\d+)\s*[vV]\b/g, '$1 ou $2 volts')
    .replace(/\b(\d+)\s*[vV]\b/g, '$1 volts')
    .replace(/\b(\d+)\s*[hH][zZ]\b/g, '$1 hertz')
    .replace(/\b(\d+)\s*[bB][tT][uU]s?\b/g, '$1 BTUs');
}

export async function gerarAudio(options: TTSOptions): Promise<string> {
  // [MEDIDAS] Naturalizar 400w -> 400 watts, 127/220v -> 127 ou 220 volts, IP67 -> IP 67
  options = { ...options, texto: naturalizarMedidas(options.texto) };

  const {
    texto,
    outputPath,
    voice = VOZES_PTBR.masculina,
    rate = '-10%',
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
