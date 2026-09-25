import { EdgeTTS } from 'node-edge-tts';

export type TTSOptions = {
  texto: string;
  outputPath: string;
  voice?: string;
  rate?: string;
  volume?: string;
  pitch?: string;
};

export const VOZES_PTBR = {
  masculina: 'pt-BR-AntonioNeural',
  feminina: 'pt-BR-FranciscaNeural',
  masculina_alt: 'pt-BR-DonatoNeural',
  feminina_alt: 'pt-BR-BrendaNeural',
} as const;

/**
 * Gera audio com retry automatico.
 * O Edge TTS as vezes da ECONNRESET — retry resolve.
 */
export async function gerarAudio(options: TTSOptions): Promise<string> {
  const {
    texto,
    outputPath,
    voice = VOZES_PTBR.masculina,
    rate = '+0%',
    volume = '+0%',
    pitch = '+0Hz',
  } = options;

  const MAX_TENTATIVAS = 3;
  let ultimoErro: Error | null = null;

  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    try {
      console.log(`  [tts] Tentativa ${tentativa}/${MAX_TENTATIVAS}...`);

      const tts = new EdgeTTS({
        voice,
        lang: 'pt-BR',
        rate,
        volume,
        pitch,
        outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
        timeout: 30000,
      });

      await tts.ttsPromise(texto, outputPath);
      console.log(`  [tts] OK`);
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
}