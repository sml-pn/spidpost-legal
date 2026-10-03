/**
 * instagram.ts
 * ──────────────────────────────────────────────────────────────────────
 * Publicação no Instagram (Reels + Stories + Feed + comentários)
 * e no Facebook (vídeos + fotos).
 * ──────────────────────────────────────────────────────────────────────
 */

import { env } from '../lib/env.js';

const GRAPH = 'https://graph.facebook.com/v21.0';
const TIMEOUT_MS = 60_000;

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

async function fetchComTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchComRetry(
  url: string,
  options: RequestInit,
  maxTentativas = 3
): Promise<Response> {
  let ultimoErro: Error | null = null;

  for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
    try {
      const res = await fetchComTimeout(url, options);

      // Se nao for 5xx, devolve logo
      if (res.status < 500) return res;

      // 5xx: guarda e retenta
      console.log(`  [http] ${res.status}, retry (${tentativa}/${maxTentativas})...`);
      ultimoErro = new Error(`HTTP ${res.status}`);
    } catch (err) {
      // Erro de rede (ECONNRESET, UND_ERR_SOCKET, timeout, etc.)
      const e = err as Error & { cause?: unknown };
      ultimoErro = e;
      const causa = e.cause ? ` (causa: ${JSON.stringify(e.cause)})` : '';
      console.log(`  [http] erro de rede: ${e.message}${causa} — retry (${tentativa}/${maxTentativas})...`);
    }

    if (tentativa < maxTentativas) {
      const delay = 2000 * Math.pow(2, tentativa - 1); // 2s, 4s, 8s
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw ultimoErro ?? new Error('fetchComRetry falhou sem erro registado');
}

async function aguardarEPublicar(containerId: string, maxPoll = 60): Promise<string> {
  let statusCode = 'IN_PROGRESS';
  let statusDetail = '';
  let tentativas = 0;

  while (statusCode === 'IN_PROGRESS' && tentativas < maxPoll) {
    await new Promise((r) => setTimeout(r, 5000));
    tentativas++;

    const pollUrl = `${GRAPH}/${containerId}?fields=status_code,status&access_token=${env.PAGE_TOKEN}`;
    const pollRes = await fetchComRetry(pollUrl, { method: 'GET' });
    const pollData = (await pollRes.json()) as { status_code?: string; status?: string };

    statusCode = pollData.status_code ?? 'UNKNOWN';
    statusDetail = pollData.status ?? '';
    console.log(`  [IG] Status: ${statusCode} (${tentativas}/${maxPoll})`);

    if (statusCode === 'ERROR') {
      throw new Error(`IG processamento falhou: ${statusDetail}`);
    }
    if (statusCode === 'EXPIRED') {
      throw new Error('IG container expirou (24h)');
    }
  }

  if (statusCode !== 'FINISHED') {
    throw new Error(`IG timeout (status: ${statusCode})`);
  }

  console.log('  [IG] Publicando...');
  const pubRes = await fetchComRetry(`${GRAPH}/${env.IG_USER_ID}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      creation_id: containerId,
      access_token: env.PAGE_TOKEN,
    }),
  });

  if (!pubRes.ok) {
    const err = await pubRes.text();
    throw new Error(`IG publish falhou: HTTP ${pubRes.status} - ${err.slice(0, 400)}`);
  }

  const { id: mediaId } = (await pubRes.json()) as { id: string };
  console.log(`  [IG] Publicado: ${mediaId}`);
  return mediaId;
}

// ──────────────────────────────────────────────────────────────────────
// 1. Reel
// ──────────────────────────────────────────────────────────────────────

export async function publicarReel(params: {
  videoUrl: string;
  caption: string;
}): Promise<string> {
  const { videoUrl, caption } = params;
  if (!videoUrl || !videoUrl.startsWith('http')) {
    throw new Error(`videoUrl invalida: "${videoUrl}"`);
  }

  console.log('  [IG] Criando container do Reel...');
  const createRes = await fetchComRetry(`${GRAPH}/${env.IG_USER_ID}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      media_type: 'REELS',
      video_url: videoUrl,
      caption,
      share_to_feed: true,
      access_token: env.PAGE_TOKEN,
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`IG container falhou: HTTP ${createRes.status} - ${err.slice(0, 400)}`);
  }

  const { id: containerId } = (await createRes.json()) as { id: string };
  console.log(`  [IG] Container: ${containerId}`);
  return aguardarEPublicar(containerId);
}

// ──────────────────────────────────────────────────────────────────────
// 2. Story (video)
// ──────────────────────────────────────────────────────────────────────

export async function publicarStoryVideo(params: {
  videoUrl: string;
}): Promise<string> {
  const { videoUrl } = params;
  if (!videoUrl || !videoUrl.startsWith('http')) {
    throw new Error(`videoUrl invalida: "${videoUrl}"`);
  }

  console.log('  [IG] Criando container do Story...');
  const createRes = await fetchComRetry(`${GRAPH}/${env.IG_USER_ID}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      media_type: 'STORIES',
      video_url: videoUrl,
      access_token: env.PAGE_TOKEN,
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`IG story falhou: HTTP ${createRes.status} - ${err.slice(0, 400)}`);
  }

  const { id: containerId } = (await createRes.json()) as { id: string };
  console.log(`  [IG] Container: ${containerId}`);
  return aguardarEPublicar(containerId);
}

// ──────────────────────────────────────────────────────────────────────
// 3. Feed (imagem)
// ──────────────────────────────────────────────────────────────────────

export async function publicarFeedImagem(params: {
  imageUrl: string;
  caption: string;
}): Promise<string> {
  const { imageUrl, caption } = params;
  if (!imageUrl || !imageUrl.startsWith('http')) {
    throw new Error(`imageUrl invalida: "${imageUrl}"`);
  }

  console.log('  [IG] Criando container do Feed...');
  const createRes = await fetchComRetry(`${GRAPH}/${env.IG_USER_ID}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_url: imageUrl,
      caption,
      access_token: env.PAGE_TOKEN,
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`IG feed falhou: HTTP ${createRes.status} - ${err.slice(0, 400)}`);
  }

  const { id: containerId } = (await createRes.json()) as { id: string };
  console.log(`  [IG] Container: ${containerId}`);
  return aguardarEPublicar(containerId, 12);
}

// ──────────────────────────────────────────────────────────────────────
// 4. Comentario
// ──────────────────────────────────────────────────────────────────────

export async function comentarPost(params: {
  mediaId: string;
  mensagem: string;
}): Promise<string> {
  const { mediaId, mensagem } = params;
  if (!mediaId) throw new Error('mediaId vazio');
  if (!mensagem) throw new Error('mensagem vazia');

  console.log('  [IG] Postando comentario...');
  const res = await fetchComRetry(`${GRAPH}/${mediaId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: mensagem,
      access_token: env.PAGE_TOKEN,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`IG comment falhou: HTTP ${res.status} - ${err.slice(0, 400)}`);
  }

  const { id: commentId } = (await res.json()) as { id: string };
  console.log(`  [IG] Comentario: ${commentId}`);
  return commentId;
}

// ──────────────────────────────────────────────────────────────────────
// 5. Facebook - video
// ──────────────────────────────────────────────────────────────────────

export async function publicarFacebookVideo(params: {
  videoUrl: string;
  descricao: string;
}): Promise<string> {
  const { videoUrl, descricao } = params;
  if (!videoUrl || !videoUrl.startsWith('http')) {
    throw new Error(`videoUrl invalida: "${videoUrl}"`);
  }

  console.log('  [FB] Publicando video...');
  const res = await fetchComRetry(`${GRAPH}/${env.PAGE_ID}/videos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      file_url: videoUrl,
      description: descricao,
      access_token: env.PAGE_TOKEN,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`FB video falhou: HTTP ${res.status} - ${err.slice(0, 400)}`);
  }

  const { id: videoId } = (await res.json()) as { id: string };
  console.log(`  [FB] Publicado: ${videoId}`);
  return videoId;
}

// ──────────────────────────────────────────────────────────────────────
// 6. Facebook - foto
// ──────────────────────────────────────────────────────────────────────

export async function publicarFacebookFoto(params: {
  imageUrl: string;
  descricao: string;
}): Promise<string> {
  const { imageUrl, descricao } = params;
  if (!imageUrl || !imageUrl.startsWith('http')) {
    throw new Error(`imageUrl invalida: "${imageUrl}"`);
  }

  console.log('  [FB] Publicando foto...');
  const res = await fetchComRetry(`${GRAPH}/${env.PAGE_ID}/photos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: imageUrl,
      message: descricao,
      access_token: env.PAGE_TOKEN,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`FB foto falhou: HTTP ${res.status} - ${err.slice(0, 400)}`);
  }

  const { id: photoId } = (await res.json()) as { id: string };
  console.log(`  [FB] Publicado: ${photoId}`);
  return photoId;
}

// ──────────────────────────────────────────────────────────────────────
// 7. Diagnostico
// ──────────────────────────────────────────────────────────────────────

export async function obterStatusContainer(containerId: string): Promise<{
  status_code?: string;
  status?: string;
}> {
  const url = `${GRAPH}/${containerId}?fields=status_code,status&access_token=${env.PAGE_TOKEN}`;
  const res = await fetchComRetry(url, { method: 'GET' });
  if (!res.ok) {
    throw new Error(`Falha ao obter status: HTTP ${res.status}`);
  }
  return (await res.json()) as { status_code?: string; status?: string };
}