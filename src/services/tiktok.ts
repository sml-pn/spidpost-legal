import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { env } from '../lib/env.js';

const TIKTOK_API = 'https://open.tiktokapis.com';
const CLIENT_KEY = env.TIKTOK_CLIENT_KEY as string;
const CLIENT_SECRET = env.TIKTOK_CLIENT_SECRET as string;
const REDIRECT_URI = (env.TIKTOK_REDIRECT_URI as string) || 'https://spidpost-legal.vercel.app/auth/tiktok/callback';


function extrairTokens(json: any): TikTokTokens {
  const data = json.data || json;
  if (!data.refresh_token) {
    console.error('❌ Resposta inesperada do TikTok:', JSON.stringify(json));
    throw new Error('TikTok não devolveu refresh_token. Verifica as chaves do Sandbox.');
  }
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
    refresh_expires_in: data.refresh_expires_in,
    open_id: data.open_id,
  };
}

export type TikTokTokens = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
  open_id: string;
};

/** Troca o código de autorização por tokens (OAuth 2.0) */
export async function trocarCodigoPorToken(code: string): Promise<TikTokTokens> {
  const body = new URLSearchParams({
    client_key: CLIENT_KEY,
    client_secret: CLIENT_SECRET,
    code,
    grant_type: 'authorization_code',
    redirect_uri: REDIRECT_URI,
  });

  const res = await fetch(`${TIKTOK_API}/v2/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`TikTok OAuth falhou: HTTP ${res.status} - ${err.slice(0, 300)}`);
  }

  return extrairTokens(await res.json());
}

/** Renova o access_token usando o refresh_token */
export async function renovarToken(refreshToken: string): Promise<TikTokTokens> {
  const body = new URLSearchParams({
    client_key: CLIENT_KEY,
    client_secret: CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const res = await fetch(`${TIKTOK_API}/v2/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`TikTok refresh falhou: HTTP ${res.status} - ${err.slice(0, 300)}`);
  }

  return extrairTokens(await res.json());
}

/** Publica um vídeo no TikTok (Direct Post) */
export async function publicarVideo(params: {
  accessToken: string;
  videoPath: string;
  titulo: string;
  privacidade?: 'SELF_ONLY' | 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'FOLLOWER_OF_CREATOR';
}): Promise<string> {
  const { accessToken, videoPath, titulo, privacidade = 'SELF_ONLY' } = params;

  if (!fs.existsSync(videoPath)) {
    throw new Error(`Vídeo não encontrado: ${videoPath}`);
  }

  const videoBuffer = fs.readFileSync(videoPath);
  const videoSize = videoBuffer.length;

  // 1. Inicializar o upload (Direct Post)
  const initRes = await fetch(`${TIKTOK_API}/v2/post/publish/video/init/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({
      post_info: {
        title: titulo,
        privacy_level: privacidade,
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
      },
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: videoSize,
        chunk_size: videoSize,
        total_chunk_count: 1,
      },
    }),
  });

  if (!initRes.ok) {
    const err = await initRes.text();
    throw new Error(`TikTok init falhou: HTTP ${initRes.status} - ${err.slice(0, 300)}`);
  }

  const initData = (await initRes.json()) as { data: { publish_id: string; upload_url: string } };
  const { upload_url: uploadUrl, publish_id: publishId } = initData.data;

  // 2. Fazer o upload do vídeo para a URL fornecida
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Range': `bytes 0-${videoSize - 1}/${videoSize}`,
    },
    body: videoBuffer,
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`TikTok upload falhou: HTTP ${uploadRes.status} - ${err.slice(0, 300)}`);
  }

  console.log(`  [tiktok] Vídeo enviado. publish_id: ${publishId}`);
  return publishId;
}


/** Envia um vídeo para a Caixa de Entrada (Rascunhos) do criador (Inbox Upload) */
export async function enviarParaRascunho(params: {
  accessToken: string;
  videoPath: string;
}): Promise<string> {
  const { accessToken, videoPath } = params;

  if (!fs.existsSync(videoPath)) {
    throw new Error(`Vídeo não encontrado: ${videoPath}`);
  }

  const videoBuffer = fs.readFileSync(videoPath);
  const videoSize = videoBuffer.length;

  // 1. Inicializar o upload para a Inbox
  const initRes = await fetch(`${TIKTOK_API}/v2/post/publish/inbox/video/init/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: videoSize,
        chunk_size: videoSize,
        total_chunk_count: 1,
      },
    }),
  });

  if (!initRes.ok) {
    const err = await initRes.text();
    throw new Error(`TikTok init (inbox) falhou: HTTP ${initRes.status} - ${err.slice(0, 300)}`);
  }

  const initData = (await initRes.json()) as { data: { publish_id: string; upload_url: string } };
  const { upload_url: uploadUrl, publish_id: publishId } = initData.data;

  // 2. Fazer o upload do vídeo
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Range': `bytes 0-${videoSize - 1}/${videoSize}`,
    },
    body: videoBuffer,
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`TikTok upload (inbox) falhou: HTTP ${uploadRes.status} - ${err.slice(0, 300)}`);
  }

  console.log(`  [tiktok] Vídeo enviado para a Caixa de Entrada. publish_id: ${publishId}`);
  return publishId;
}

/** Verifica o status da publicação */
export async function verificarStatus(accessToken: string, publishId: string): Promise<string> {
  const res = await fetch(`${TIKTOK_API}/v2/post/publish/status/fetch/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ publish_id: publishId }),
  });

  const data = (await res.json()) as any;
  return data?.data?.status || 'UNKNOWN';
}
