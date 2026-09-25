/**
 * publisher.ts
 * ──────────────────────────────────────────────────────────────────────
 * Estratégia HÍBRIDA com protecções anti-rate-limit:
 *   1. Só publica se passaram >= 30 min desde o último post
 *   2. Só publica se passaram >= 3h desde um erro 2207077 no mesmo produto
 *   3. Comentário com link após publicar o Reel
 * ──────────────────────────────────────────────────────────────────────
 */

import path from 'node:path';
import { db, proximaVariacao, type Variacao } from '../lib/db.js';
import { publicarReel, publicarStoryVideo, publicarFeedImagem, comentarPost } from '../services/instagram.js';

const MINUTOS_ENTRE_POSTS = Number(process.env.FORCE_MINUTOS || 30);
const HORAS_BACKOFF_APOS_ERRO = 3;

function montarUrl(caminhoLocal: string): string {
  const base = process.env.PUBLIC_VIDEO_BASE_URL;
  if (!base) throw new Error('PUBLIC_VIDEO_BASE_URL nao definida no .env');
  const fileName = path.basename(caminhoLocal);
  const subDir = fileName.startsWith('story-') ? 'stories' : fileName.startsWith('feed-') ? 'feed' : 'reels';
  return `${base}/${subDir}/${fileName}`;
}

function tipoDoRender(p: string): 'reel' | 'story' | 'feed' | 'unknown' {
  const n = path.basename(p);
  if (n.startsWith('reel-')) return 'reel';
  if (n.startsWith('story-')) return 'story';
  if (n.startsWith('feed-')) return 'feed';
  return 'unknown';
}

function montarLegenda(caption: string, hashtags: string): string {
  const cta = '💬 Comenta QUERO que eu envio o link com desconto no teu privado!';
  return `${caption}\n\n${cta}\n\n${hashtags}`;
}

/**
 * Verifica se podemos publicar agora.
 * Retorna { ok: true } ou { ok: false, motivo, minutosAtePoder }
 */
function podePublicarAgora(): { ok: boolean; motivo?: string; minutosAte?: number } {
  const ultimo = db.prepare(`
    SELECT posted_at FROM renders
    WHERE status = 'POSTED'
    ORDER BY posted_at DESC LIMIT 1
  `).get() as any;

  if (!ultimo?.posted_at) {
    return { ok: true };
  }

  const agora = Date.now();
  const ultimoMs = new Date(ultimo.posted_at).getTime();
  const diffMin = (agora - ultimoMs) / 1000 / 60;

  if (diffMin < MINUTOS_ENTRE_POSTS) {
    return {
      ok: false,
      motivo: `Ultimo post ha ${Math.round(diffMin)}min (minimo ${MINUTOS_ENTRE_POSTS}min)`,
      minutosAte: Math.round(MINUTOS_ENTRE_POSTS - diffMin),
    };
  }

  return { ok: true };
}

/**
 * Verifica se o produto esta em backoff (erro recente).
 */
function produtoEmBackoff(productId: number): { emBackoff: boolean; minutosAte?: number } {
  const recente = db.prepare(`
    SELECT error, updated_at FROM products
    WHERE id = ? AND error IS NOT NULL AND error LIKE '%2207077%'
  `).get(productId) as any;

  if (!recente?.updated_at) return { emBackoff: false };

  const agora = Date.now();
  const updated = new Date(recente.updated_at).getTime();
  const diffHoras = (agora - updated) / 1000 / 60 / 60;

  if (diffHoras < HORAS_BACKOFF_APOS_ERRO) {
    return {
      emBackoff: true,
      minutosAte: Math.round((HORAS_BACKOFF_APOS_ERRO - diffHoras) * 60),
    };
  }

  return { emBackoff: false };
}

async function comentarComLink(mediaId: string, produto: any): Promise<void> {
  const link = produto.affiliate_url;
  if (!link) {
    console.log('  [IG] Sem link de afiliado — comentario ignorado');
    return;
  }

  const mensagem = [
    '🛒 Link com desconto:',
    link,
    '',
    'Ou comenta QUERO que eu envio no teu privado 👇',
  ].join('\n');

  try {
    const commentId = await comentarPost({ mediaId, mensagem });
    console.log(`  [IG] Comentario com link: ${commentId}`);
  } catch (err) {
    console.log('  [IG] Comentario falhou:', (err as Error).message.slice(0, 150));
  }
}

async function publicarStoryComRetry(url: string): Promise<string | null> {
  try {
    return await publicarStoryVideo({ videoUrl: url });
  } catch (err) {
    const msg = (err as Error).message;
    console.log(`  [IG] Story erro: ${msg.slice(0, 150)}`);
    return null;
  }
}

async function main() {
  console.log('Publisher iniciado...\n');

  // ─── Protecção 1: intervalo minimo entre posts ───
  const check = podePublicarAgora();
  if (!check.ok) {
    console.log('⏸ Bloqueado:', check.motivo);
    console.log('   Proximo publish em ~', check.minutosAte, 'min');
    return;
  }

  // ─── Encontrar produto READY que não esteja em backoff ───
  const candidatos = db.prepare(`
    SELECT DISTINCT p.* FROM products p
    INNER JOIN renders r ON r.product_id = p.id
    WHERE p.status IN ('READY', 'PARTIAL')
      AND p.removed_from_ml = 0
      AND r.status = 'READY'
    ORDER BY p.created_at ASC
    LIMIT 5
  `).all() as any[];

  let produto: any = null;
  for (const c of candidatos) {
    const backoff = produtoEmBackoff(c.id);
    if (backoff.emBackoff) {
      console.log(`⏭ Produto ${c.id} em backoff (${backoff.minutosAte}min restantes)`);
      continue;
    }
    produto = c;
    break;
  }

  if (!produto) {
    console.log('Nenhum produto disponivel (todos em backoff ou nenhum READY).');
    return;
  }

  const variacao = (produto.next_variation ?? 'A') as Variacao;
  console.log(`Produto: [${produto.category}] ${produto.name.slice(0, 60)}`);
  console.log(`Variacao: ${variacao}`);
  console.log(`Link: ${produto.affiliate_url ?? '(nenhum)'}`);
  console.log('');

  const renders = db.prepare(`
    SELECT * FROM renders WHERE product_id = ? AND status = 'READY'
  `).all(produto.id) as any[];

  const porTipo: Record<string, any> = {};
  for (const r of renders) {
    const t = tipoDoRender(r.reel_path);
    if (t !== 'unknown') porTipo[t] = r;
  }

  console.log('Formatos:', Object.keys(porTipo).join(', '));
  console.log('');

  const primeiro = renders[0];
  const caption = montarLegenda(primeiro.caption, primeiro.hashtags);

  const publicados: number[] = [];
  let reelId: string | null = null;
  let storyId: string | null = null;
  let feedId: string | null = null;
  let erro2207077 = false;

  // ─── Reel ───
  if (porTipo.reel) {
    console.log('[1/3] Publicando Reel...');
    try {
      const url = montarUrl(porTipo.reel.reel_path);
      console.log('  URL:', url);
      reelId = await publicarReel({ videoUrl: url, caption });
      publicados.push(porTipo.reel.id);

      await new Promise((r) => setTimeout(r, 5000));
      console.log('  A postar comentario com link...');
      await comentarComLink(reelId, produto);

      console.log('');
    } catch (err) {
      const msg = (err as Error).message;
      console.error('  ERRO reel:', msg.slice(0, 250), '\n');
      if (msg.includes('2207077')) erro2207077 = true;
    }
  }

  // ─── Story ───
  if (porTipo.story && !erro2207077) {
    console.log('[2/3] Publicando Story...');
    const url = montarUrl(porTipo.story.reel_path);
    console.log('  URL:', url);
    storyId = await publicarStoryComRetry(url);
    if (storyId) publicados.push(porTipo.story.id);
    console.log('');
  } else if (erro2207077) {
    console.log('[2/3] Story saltado (rate limit detectado no reel)\n');
  }

  // ─── Feed ───
  if (porTipo.feed && !erro2207077) {
    console.log('[3/3] Publicando Feed...');
    try {
      const url = montarUrl(porTipo.feed.reel_path);
      console.log('  URL:', url);
      feedId = await publicarFeedImagem({ imageUrl: url, caption });
      publicados.push(porTipo.feed.id);
      console.log('');
    } catch (err) {
      console.log('  ERRO feed:', (err as Error).message.slice(0, 250), '\n');
    }
  } else if (erro2207077) {
    console.log('[3/3] Feed saltado (rate limit detectado no reel)\n');
  }

  const agora = new Date().toISOString();

  if (publicados.length === 0) {
    console.log('═══════════════════════════════════════════════════════════');
    if (erro2207077) {
      console.log('  RATE LIMIT DETECTADO — produto marcado em backoff 3h');
      db.prepare(`
        UPDATE products
        SET error = 'rate_limit_2207077', updated_at = datetime('now')
        WHERE id = ?
      `).run(produto.id);
    } else {
      console.log('  NADA FOI PUBLICADO — produto mantido como READY');
    }
    console.log('═══════════════════════════════════════════════════════════');
    return;
  }

  for (const id of publicados) {
    db.prepare(`UPDATE renders SET status = 'POSTED', posted_at = ? WHERE id = ?`).run(agora, id);
  }

  const proxima = proximaVariacao(variacao);
  const novoVariationsDone = (produto.variations_done ?? 0) + 1;
  const novoStatus = proxima === null ? 'ARCHIVED' : 'COOLDOWN';

  db.prepare(`
    UPDATE products
    SET status = ?, last_variation = ?, variations_done = ?,
        next_variation = COALESCE(?, next_variation),
        last_posted_at = ?, updated_at = datetime('now'), error = NULL
    WHERE id = ?
  `).run(novoStatus, variacao, novoVariationsDone, proxima, agora, produto.id);

  db.prepare(`
    INSERT INTO posts_log (product_id, turno, source, category, ig_media_id)
    VALUES (?, 'manual', ?, ?, ?)
  `).run(produto.id, produto.source, produto.category, reelId ?? storyId ?? feedId ?? '');

  db.prepare(`
    INSERT INTO category_rotation (category, product_id) VALUES (?, ?)
  `).run(produto.category, produto.id);

  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  ${publicados.length} formato(s) publicados`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Reel:  ${reelId || '—'}`);
  console.log(`  Story: ${storyId || '—'}`);
  console.log(`  Feed:  ${feedId || '—'}`);
  console.log(`  Estado: ${novoStatus}${proxima ? ` (proxima: ${proxima})` : ' (esgotou)'}`);
}

main().catch((err) => {
  console.error('\nERRO FATAL:', err.message || err);
  process.exit(1);
});