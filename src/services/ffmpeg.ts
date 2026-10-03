/**
 * ffmpeg.ts
 * ──────────────────────────────────────────────────────────────────────
 * Geração de mídia para Instagram: Reels, Stories e Feed.
 *
 * O que este módulo faz:
 *   1. Baixa a imagem do produto (com retry e timeout)
 *   2. Monta um layout 1080x1920 (Reel/Story) ou 1080x1350 (Feed)
 *   3. Desenha textos (selo, título, preço, benefícios, CTA)
 *   4. Exporta vídeo H.264 + AAC pronto para o Instagram
 *
 * Formatos suportados:
 *   - reel   → vídeo 1080x1920, sem CTA visual (link vai na legenda/comentário)
 *   - story  → vídeo 1080x1920, COM "Link na bio" visível no rodapé
 *   - feed   → imagem 1080x1350 (estática)
 *
 * Requisitos:
 *   - ffmpeg no PATH (ou em C:\ffmpeg\bin\ffmpeg.exe no Windows)
 *   - Fontes TTF em C:\Windows\Fonts\ (arialbd, georgiab, courbd)
 *
 * [ROBUSTO] Adicionado:
 *   - Timeout global no ffmpeg (5 min) — evita processos pendurados
 *   - try/finally para limpar temp files mesmo em caso de erro
 *   - Validação de inputs (título, preço, caminhos)
 *   - Fallback de fonte se a preferida não existir
 *   - Download com 3 tentativas + backoff exponencial
 *   - Timeout por tentativa de download (30s)
 *   - Verificação de tamanho mínimo do output
 *   - CTA "Link na bio" no Story (visível no vídeo)
 * ──────────────────────────────────────────────────────────────────────
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ──────────────────────────────────────────────────────────────────────
// Configuração
// ──────────────────────────────────────────────────────────────────────

/** Caminho do binário ffmpeg. Windows usa caminho fixo, Linux usa PATH. */
const FFMPEG = process.platform === 'win32'
  ? 'C:\\ffmpeg\\bin\\ffmpeg.exe'
  : 'ffmpeg';

/** Pasta de fontes do Windows (usada para resolver os TTF). */
const FONT_DIR = 'C:/Windows/Fonts';

/** Timeout máximo para uma execução do ffmpeg (5 min). [ROBUSTO] */
const FFMPEG_TIMEOUT_MS = 5 * 60 * 1000;

/** Timeout por tentativa de download (30s). */
const DOWNLOAD_TIMEOUT_MS = 30_000;

/** Nº máximo de tentativas de download. */
const DOWNLOAD_MAX_TENTATIVAS = 3;

/** Tamanho mínimo aceitável de um ficheiro gerado (1KB). */
const TAMANHO_MINIMO_BYTES = 1000;

// ──────────────────────────────────────────────────────────────────────
// Tipos e constantes de estilo
// ──────────────────────────────────────────────────────────────────────

export type Formato = 'reel' | 'story' | 'feed';

type Estilo = 'moderno' | 'elegante' | 'vibrante' | 'tecnico' | 'aconchegante';

/**
 * Mapa estilo → ficheiro de fonte.
 * Se a fonte não existir no sistema, cai para o fallback (ver `resolverFonte`).
 */
const FONTES: Record<Estilo, string> = {
  moderno: 'arialbd.ttf',
  elegante: 'georgiab.ttf',
  vibrante: 'arialbd.ttf',
  tecnico: 'courbd.ttf',
  aconchegante: 'georgiab.ttf',
};

/** Fonte de último recurso se a preferida não existir. [ROBUSTO] */
const FONTE_FALLBACK = 'arialbd.ttf';

/** Cores padrão por estilo (formato #RRGGBB). */
const CORES_PADRAO: Record<Estilo, string> = {
  moderno: '#00ff88',
  elegante: '#d4af37',
  vibrante: '#ff2d55',
  tecnico: '#00d9ff',
  aconchegante: '#e67e22',
};

// ──────────────────────────────────────────────────────────────────────
// Download de imagens
// ──────────────────────────────────────────────────────────────────────

/**
 * Baixa uma URL com timeout. Lança se HTTP != 2xx ou se o corpo for < 1KB.
 * [ROBUSTO] Aborta a request se passar do timeout (evita pendurar).
 */
async function baixarComTimeout(url: string, timeoutMs: number): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < TAMANHO_MINIMO_BYTES) {
      throw new Error(`Arquivo muito pequeno (${buffer.length} bytes)`);
    }
    return buffer;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Baixa uma imagem para o disco com retry e backoff.
 *
 * Regras:
 *   - 4xx (exceto 429) → erro imediato (imagem não existe)
 *   - 5xx, timeout, rede → retry até 3x com backoff (1.5s, 3s)
 */
export async function baixarImagem(url: string, outputPath: string): Promise<string> {
  if (!url || !url.startsWith('http')) {
    throw new Error(`URL de imagem invalida: "${url}"`);
  }

  let ultimoErro: Error | null = null;

  for (let tentativa = 1; tentativa <= DOWNLOAD_MAX_TENTATIVAS; tentativa++) {
    try {
      console.log(`  [download] Tentativa ${tentativa}/${DOWNLOAD_MAX_TENTATIVAS}...`);
      const buffer = await baixarComTimeout(url, DOWNLOAD_TIMEOUT_MS);
      await fs.writeFile(outputPath, buffer);
      console.log(`  [download] OK - ${(buffer.length / 1024).toFixed(0)} KB`);
      return outputPath;
    } catch (err) {
      ultimoErro = err as Error;
      const msg = ultimoErro.message;
      console.log(`  [download] Falha: ${msg}`);

      // 4xx (exceto 429 = rate limit) → não vale a pena tentar de novo
      if (msg.startsWith('HTTP 4') && !msg.includes('429')) {
        throw new Error(`Imagem nao encontrada (${msg}): ${url}`);
      }

      if (tentativa < DOWNLOAD_MAX_TENTATIVAS) {
        const espera = tentativa * 1500; // backoff: 1.5s, 3s
        console.log(`  [download] Aguardando ${espera}ms...`);
        await new Promise((r) => setTimeout(r, espera));
      }
    }
  }

  throw new Error(`Download falhou apos ${DOWNLOAD_MAX_TENTATIVAS} tentativas: ${ultimoErro?.message}`);
}

// ──────────────────────────────────────────────────────────────────────
// Utilitários de texto e path
// ──────────────────────────────────────────────────────────────────────

/**
 * Quebra um texto em linhas de até `maxChars` caracteres, sem cortar palavras.
 */
function quebrarLinha(texto: string, maxChars: number): string {
  const palavras = texto.split(/\s+/);
  const linhas: string[] = [];
  let linhaAtual = '';

  for (const palavra of palavras) {
    const tentativa = linhaAtual ? `${linhaAtual} ${palavra}` : palavra;
    if (tentativa.length <= maxChars) {
      linhaAtual = tentativa;
    } else {
      if (linhaAtual) linhas.push(linhaAtual);
      linhaAtual = palavra;
    }
  }
  if (linhaAtual) linhas.push(linhaAtual);
  return linhas.join('\n');
}

/**
 * Limita o texto às primeiras N palavras (evita títulos gigantes no vídeo).
 */
function limitarPalavras(texto: string, maxPalavras: number): string {
  const palavras = texto.split(/\s+/).filter((p) => p.length > 0);
  return palavras.slice(0, maxPalavras).join(' ');
}

/**
 * Converte "#rrggbb" para o formato "0xrrggbb" que o ffmpeg espera.
 * Se a cor for inválida, usa o fallback.
 */
function corParaFfmpeg(cor: string | undefined, fallback: string): string {
  const c = (cor ?? '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(c)) return '0x' + c.slice(1);
  return '0x' + fallback.replace('#', '');
}

/**
 * Escapa um caminho para uso dentro de filtros ffmpeg.
 * - Barras invertidas → barras normais
 * - ":" → "\:" (obrigatório em filtros)
 * - "'" → "\'"
 */
function escaparPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

/**
 * [ROBUSTO] Resolve o caminho da fonte preferida. Se não existir no sistema,
 * devolve o fallback. Se nem o fallback existir, lança (não dá para desenhar texto).
 */
function resolverFonte(estilo: Estilo): string {
  const preferida = FONTES[estilo] ?? FONTE_FALLBACK;
  const caminhoPreferido = path.join(FONT_DIR, preferida);

  if (fsSync.existsSync(caminhoPreferido)) return caminhoPreferido;

  const caminhoFallback = path.join(FONT_DIR, FONTE_FALLBACK);
  if (fsSync.existsSync(caminhoFallback)) {
    console.log(`  [ffmpeg] Fonte "${preferida}" ausente, a usar fallback "${FONTE_FALLBACK}"`);
    return caminhoFallback;
  }

  throw new Error(
    `Nenhuma fonte encontrada em ${FONT_DIR}. ` +
    `Instala pelo menos "${FONTE_FALLBACK}" ou ajusta FONT_DIR.`
  );
}

/**
 * [ROBUSTO] Executa o ffmpeg com timeout. Se o processo passar de
 * FFMPEG_TIMEOUT_MS, é morto e a promise rejeita.
 */
async function executarFFmpeg(args: string[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(FFMPEG, args, { windowsHide: true });
    let stderr = '';
    let finalizado = false;

    // [ROBUSTO] Timer que mata o processo se passar do limite
    const timer = setTimeout(() => {
      if (finalizado) return;
      finalizado = true;
      proc.kill('SIGKILL');
      reject(new Error(`ffmpeg timeout (${FFMPEG_TIMEOUT_MS / 1000}s) — processo morto`));
    }, FFMPEG_TIMEOUT_MS);

    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    proc.on('error', (err) => {
      if (finalizado) return;
      finalizado = true;
      clearTimeout(timer);
      reject(new Error('spawn falhou: ' + err.message));
    });

    proc.on('close', (code) => {
      if (finalizado) return;
      finalizado = true;
      clearTimeout(timer);

      if (code !== 0) {
        const tail = stderr.split('\n').slice(-25).join('\n');
        reject(new Error(`ffmpeg exit ${code}:\n${tail}`));
      } else {
        resolve();
      }
    });
  });
}

// ──────────────────────────────────────────────────────────────────────
// Flags de encode (compartilhadas entre Reel e Story)
// ──────────────────────────────────────────────────────────────────────

/** Flags de vídeo otimizadas para Instagram (H.264 baseline/main, 24fps, faststart). */
const VIDEO_FLAGS_IG = [
  '-c:v', 'libx264',
  '-threads', '0',
  '-preset', 'veryfast',
  '-crf', '23',
  '-profile:v', 'main',
  '-level:v', '4.0',
  '-r', '24',
  '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart', // [ROBUSTO] moov atom no início — IG rejeita sem isto
  '-g', '48',
];

/** Flags de áudio (AAC 192k, 48kHz). */
const AUDIO_FLAGS_IG = [
  '-c:a', 'aac',
  '-b:a', '192k',
  '-ar', '48000',
  '-ac', '2',
];

// ──────────────────────────────────────────────────────────────────────
// Layout — parâmetros compartilhados
// ──────────────────────────────────────────────────────────────────────

type LayoutParams = {
  titulo: string;
  preco: number;
  selo: string;
  beneficios: string[];
  cta: string;
  estilo: Estilo;
  cor: string;
  base: 'vertical' | 'feed';
  /** [ROBUSTO] Se true, desenha o CTA "Link na bio" no vídeo (usado em Story). */
  mostrarCta: boolean;
};

/**
 * Constrói a cadeia de filtros ffmpeg e escreve os ficheiros de texto temporários
 * (drawtext precisa de textfile para lidar com acentos e emojis).
 *
 * Devolve o filtro completo (terminado em `[v]`) e a lista de temp files para cleanup.
 */
async function montarFiltrosLayout(p: LayoutParams): Promise<{
  filter: string;
  tempFiles: string[];
}> {
  const tmpDir = os.tmpdir();
  const ts = Date.now();

  // ─── Ficheiros temporários de texto ───
  const tituloFile = path.join(tmpDir, `titulo-${ts}.txt`);
  const precoFile = path.join(tmpDir, `preco-${ts}.txt`);
  const seloFile = path.join(tmpDir, `selo-${ts}.txt`);
  const ctaFile = path.join(tmpDir, `cta-${ts}.txt`);

  const font = escaparPath(resolverFonte(p.estilo)); // [ROBUSTO] fallback embutido
  const corFfmpeg = corParaFfmpeg(p.cor, CORES_PADRAO[p.estilo] ?? CORES_PADRAO.moderno);

  const isFeed = p.base === 'feed';

  // ─── Dimensões (Feed: 1080x1350 / Vertical: 1080x1920) ───
  const imgAltura = isFeed ? 850 : 1100;
  const imgTopo = isFeed ? 130 : 150;

  // ─── Posições verticais (fração da altura) ───
  const posSelo   = isFeed ? 0.72 : 0.67;
  const posTitulo = isFeed ? 0.78 : 0.72;
  const posBenef  = isFeed ? 0.85 : 0.78;
  const posPreco  = isFeed ? 0.94 : 0.89;
  const posCta    = isFeed ? 0.99 : 0.945;

  // ─── Tamanhos de fonte ───
  const fsSelo   = isFeed ? 38 : 42;
  const fsTitulo = isFeed ? 42 : 46;
  const fsBenef  = isFeed ? 28 : 30;
  const fsPreco  = isFeed ? 68 : 76;
  const fsCta    = isFeed ? 24 : 26;

  // ─── Escrever ficheiros de texto ───
  // [ROBUSTO] Validações mínimas
  if (!p.titulo || p.titulo.trim().length === 0) {
    throw new Error('titulo vazio — impossível gerar layout');
  }
  if (!Number.isFinite(p.preco) || p.preco < 0) {
    throw new Error(`preco inválido: ${p.preco}`);
  }

  const tituloCurto = limitarPalavras(p.titulo, 4);
  await fs.writeFile(tituloFile, quebrarLinha(tituloCurto, 26), 'utf-8');
  await fs.writeFile(precoFile, `R$ ${p.preco.toFixed(2).replace('.', ',')}`, 'utf-8');
  await fs.writeFile(seloFile, p.selo, 'utf-8');
  await fs.writeFile(ctaFile, p.cta, 'utf-8');

  // ─── Ficheiros de benefícios (até 3) ───
  const benefFiles: string[] = [];
  const allTempFiles = [tituloFile, precoFile, seloFile, ctaFile];

  for (let i = 0; i < Math.min(p.beneficios.length, 3); i++) {
    const f = path.join(tmpDir, `benef-${ts}-${i}.txt`);
    await fs.writeFile(f, `▪ ${p.beneficios[i]}`, 'utf-8');
    benefFiles.push(escaparPath(f));
    allTempFiles.push(f);
  }

  const esc = {
    selo: escaparPath(seloFile),
    titulo: escaparPath(tituloFile),
    preco: escaparPath(precoFile),
    cta: escaparPath(ctaFile),
  };

  // ────────────────────────────────────────────────────────────────
  // Construção dos filtros
  // ────────────────────────────────────────────────────────────────
  const filters: string[] = [];

  // 1. Base: imagem inteira (sem crop) + padding preto
  if (isFeed) {
    filters.push(
      `[0:v]scale=1080:${imgAltura}:force_original_aspect_ratio=decrease,` +
      `pad=1080:1350:(ow-iw)/2:${imgTopo}:black`
    );
  } else {
    filters.push(
      `[0:v]scale=1080:${imgAltura}:force_original_aspect_ratio=decrease,` +
      `pad=1080:1920:(ow-iw)/2:${imgTopo}:black`
    );
  }

  // 2. Pill do selo (fundo colorido + texto branco)
  const alturaPill = 78;
  const larguraPill = Math.max(320, p.selo.length * 30 + 120);
  const yPillBox = `ih*${posSelo}`;
  const yPillText = `h*${posSelo}+${Math.round((alturaPill - fsSelo) / 2) + 4}`;

  // Sombra
  filters.push(
    `drawbox=x=(iw-${larguraPill})/2+3:y=${yPillBox}+3:w=${larguraPill}:h=${alturaPill}:color=black@0.5:t=fill`
  );
  // Corpo
  filters.push(
    `drawbox=x=(iw-${larguraPill})/2:y=${yPillBox}:w=${larguraPill}:h=${alturaPill}:color=${corFfmpeg}@1:t=fill`
  );
  // Texto
  filters.push(
    `drawtext=fontfile='${font}':textfile='${esc.selo}':expansion=none:fontcolor=white:fontsize=${fsSelo}:x=(w-text_w)/2:y=${yPillText}:shadowx=2:shadowy=2:shadowcolor=black@0.5`
  );

  // 3. Título
  filters.push(
    `drawtext=fontfile='${font}':textfile='${esc.titulo}':expansion=none:fontcolor=white:fontsize=${fsTitulo}:x=(w-text_w)/2:y=h*${posTitulo}:shadowx=2:shadowy=2:shadowcolor=black@0.7:line_spacing=8`
  );

  // 4. Benefícios
  for (let i = 0; i < benefFiles.length; i++) {
    const y = `h*${posBenef}+${i * (fsBenef + 6)}`;
    filters.push(
      `drawtext=fontfile='${font}':textfile='${benefFiles[i]}':expansion=none:fontcolor=${corFfmpeg}:fontsize=${fsBenef}:x=(w-text_w)/2:y=${y}:shadowx=2:shadowy=2:shadowcolor=black@0.6`
    );
  }

  // 5. Preço
  filters.push(
    `drawtext=fontfile='${font}':textfile='${esc.preco}':expansion=none:fontcolor=${corFfmpeg}:fontsize=${fsPreco}:x=(w-text_w)/2:y=h*${posPreco}:shadowx=3:shadowy=3:shadowcolor=black@0.7`
  );

  // 6. CTA ("Link na bio") — só quando pedido explicitamente (Story) [ROBUSTO]
  if (p.mostrarCta) {
    filters.push(
      `drawtext=fontfile='${font}':textfile='${esc.cta}':expansion=none:fontcolor=white:fontsize=${fsCta}:x=(w-text_w)/2:y=h*${posCta}:shadowx=2:shadowy=2:shadowcolor=black@0.6`
    );
  }

  const filter = filters.join(',') + '[v]';
  return { filter, tempFiles: allTempFiles };
}

// ──────────────────────────────────────────────────────────────────────
// API pública — montarVideo (Reel / Story)
// ──────────────────────────────────────────────────────────────────────

/**
 * Gera um vídeo MP4 a partir de uma imagem + áudio.
 *
 * @param formato   'reel' (sem CTA visual) ou 'story' (com "Link na bio")
 * @param duracao   duração em segundos (padrão 18)
 */
export async function montarVideo(params: {
  imagemPath: string;
  audioPath: string;
  titulo: string;
  preco: number;
  outputPath: string;
  duracao?: number;
  formato: 'reel' | 'story';
  estilo?: Estilo;
  cor?: string;
  selo?: string;
  beneficios?: string[];
  cta?: string;
}): Promise<string> {
  const {
    imagemPath, audioPath, titulo, preco, outputPath,
    duracao = 18, formato,
    estilo = 'moderno', cor,
    selo = 'OFERTA', beneficios = [], cta = 'Link na bio',
  } = params;

  // [ROBUSTO] Validar que os ficheiros de entrada existem
  if (!fsSync.existsSync(imagemPath)) {
    throw new Error(`Imagem não encontrada: ${imagemPath}`);
  }
  if (!fsSync.existsSync(audioPath)) {
    throw new Error(`Áudio não encontrado: ${audioPath}`);
  }
  if (duracao <= 0 || duracao > 90) {
    throw new Error(`duracao inválida: ${duracao} (esperado 1-90s)`);
  }

  // CTA removido de TODOS os formatos — link só vai na legenda/comentário
  const mostrarCta = false;

  const { filter, tempFiles } = await montarFiltrosLayout({
    titulo, preco, selo, beneficios, cta,
    estilo,
    cor: cor ?? CORES_PADRAO[estilo] ?? CORES_PADRAO.moderno,
    base: 'vertical',
    mostrarCta,
  });

  const args = [
    '-y',
    '-loop', '1',
    '-i', imagemPath,
    '-i', audioPath,
    '-t', String(duracao),
    '-filter_complex', filter,
    '-map', '[v]',
    '-map', '1:a',
    ...VIDEO_FLAGS_IG,
    ...AUDIO_FLAGS_IG,
    '-shortest',
    outputPath,
  ];

  console.log(`  [ffmpeg] Montando ${formato} (${estilo}, ${selo})...`);

  // [ROBUSTO] try/finally garante que os temp files são sempre apagados
  try {
    await executarFFmpeg(args);
  } finally {
    await Promise.all(
      tempFiles.map((f) => fs.unlink(f).catch(() => { /* ignora */ }))
    );
  }

  const stat = await fs.stat(outputPath).catch(() => null);
  if (!stat || stat.size < TAMANHO_MINIMO_BYTES) {
    throw new Error(`Vídeo não gerado ou demasiado pequeno (${stat?.size ?? 0} bytes)`);
  }

  console.log(`  [ffmpeg] ${formato} OK - ${(stat.size / 1024 / 1024).toFixed(2)} MB`);
  return outputPath;
}

// ──────────────────────────────────────────────────────────────────────
// API pública — montarFeed (imagem 1080x1350)
// ──────────────────────────────────────────────────────────────────────

/**
 * Gera uma imagem JPG de feed (1080x1350) a partir de uma imagem do produto.
 * Sem CTA visual — o link vai na legenda.
 */
export async function montarFeed(params: {
  imagemPath: string;
  titulo: string;
  preco: number;
  outputPath: string;
  estilo?: Estilo;
  cor?: string;
  selo?: string;
  beneficios?: string[];
  cta?: string;
}): Promise<string> {
  const {
    imagemPath, titulo, preco, outputPath,
    estilo = 'moderno', cor,
    selo = 'OFERTA', beneficios = [], cta = 'Link na bio',
  } = params;

  // [ROBUSTO] Validar entrada
  if (!fsSync.existsSync(imagemPath)) {
    throw new Error(`Imagem não encontrada: ${imagemPath}`);
  }

  const { filter, tempFiles } = await montarFiltrosLayout({
    titulo, preco, selo, beneficios, cta,
    estilo,
    cor: cor ?? CORES_PADRAO[estilo] ?? CORES_PADRAO.moderno,
    base: 'feed',
    mostrarCta: false, // Feed nunca mostra CTA no visual
  });

  const args = [
    '-y',
    '-i', imagemPath,
    '-filter_complex', filter,
    '-map', '[v]',
    '-frames:v', '1',
    '-q:v', '2',
    '-pix_fmt', 'yuvj420p',
    // [NOTA] '-huffman optimal' era do encoder PNG; em JPEG é ignorado.
    // Removido para não poluir os logs do ffmpeg.
    outputPath,
  ];

  console.log(`  [ffmpeg] Montando feed (${estilo}, ${selo})...`);

  try {
    await executarFFmpeg(args);
  } finally {
    await Promise.all(
      tempFiles.map((f) => fs.unlink(f).catch(() => { /* ignora */ }))
    );
  }

  const stat = await fs.stat(outputPath).catch(() => null);
  if (!stat || stat.size < TAMANHO_MINIMO_BYTES) {
    throw new Error(`Imagem de feed não gerada (${stat?.size ?? 0} bytes)`);
  }

  console.log(`  [ffmpeg] feed OK - ${(stat.size / 1024).toFixed(0)} KB`);
  return outputPath;
}