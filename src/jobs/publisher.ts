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
import { slotAtual, getPending, setPending, clearPending, proximoBackoff, ensureScheduleTable, markSlotUsado } from '../lib/schedule.js';
import { uploadImageKit } from '../services/imagekit.js';

const MINUTOS_ENTRE_POSTS   = Number(process.env.FORCE_MINUTOS || 25);
const MINUTOS_APERTADO      = Number(process.env.MINUTOS_APERTADO || 60);
const LIMITE_DIARIO_24H     = Number(process.env.LIMITE_DIARIO || 15);
const HORAS_BACKOFF_NIVEIS  = [3, 6, 12, 24];

function montarUrl(caminhoLocal: string): string {
  const base = process.env.PUBLIC_VIDEO_BASE_URL;
  if (!base) throw new Error('PUBLIC_VIDEO_BASE_URL nao definida no .env');
  const fileName = path.basename(caminhoLocal);
  const subDir = fileName.startsWith('story-') ? 'stories' : fileName.startsWith('feed-') ? 'feed' : 'reels';
  return `${base}/${subDir}/${fileName}`;
}

/**
 * Faz upload do ficheiro ao ImageKit e devolve a URL publica.
 * Fallback: se IMAGEKIT_PRIVATE_KEY nao estiver definida, usa montarUrl (Tailscale).
 */
async function uploadPublico(caminhoLocal: string): Promise<string> {
  // Fallback: sem ImageKit configurado, usa URL do Tailscale
  if (!process.env.IMAGEKIT_PRIVATE_KEY) {
    console.log("  [imagekit] Sem chave configurada — a usar Tailscale");
    return montarUrl(caminhoLocal);
  }

  const fileName = caminhoLocal.split(/[\\/]/).pop() || "";
  const pasta = fileName.startsWith("story-") ? "stories"
              : fileName.startsWith("feed-")  ? "feed"
              : "reels";

  return await uploadImageKit(caminhoLocal, pasta);
}

function tipoDoRender(p: string): 'reel' | 'story' | 'feed' | 'unknown' {
  // [FIX] Aceita '/' e '\\' — path.basename do Linux nao corta em '\\'
  const n = p.split(/[\\/]/).pop() ?? p;
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
function contarPosts24h(): number {
  const r = db.prepare(`
    SELECT COUNT(*) as c FROM posts_log
    WHERE datetime(posted_at) > datetime('now', '-24 hours')
  `).get() as any;
  return r?.c ?? 0;
}

function estaEmModoApertado(): boolean {
  const r = db.prepare(`
    SELECT COUNT(*) as c FROM products
    WHERE error LIKE '%2207077%'
      AND datetime(updated_at) > datetime('now', '-24 hours')
  `).get() as any;
  return (r?.c ?? 0) > 0;
}

function podePublicarAgora(): { ok: boolean; motivo?: string; minutosAte?: number } {
  const posts24h = contarPosts24h();
  if (posts24h >= LIMITE_DIARIO_24H) {
    return {
      ok: false,
      motivo: `Limite diario atingido (${posts24h}/${LIMITE_DIARIO_24H} posts em 24h)`,
    };
  }

  const apertado = estaEmModoApertado();
  const minutosExigidos = apertado ? MINUTOS_APERTADO : MINUTOS_ENTRE_POSTS;

  const ultimo = db.prepare(`
    SELECT posted_at FROM renders
    WHERE status = 'POSTED'
    ORDER BY posted_at DESC LIMIT 1
  `).get() as any;

  if (!ultimo?.posted_at) return { ok: true };

  const diffMin = (Date.now() - new Date(ultimo.posted_at).getTime()) / 1000 / 60;

  if (diffMin < minutosExigidos) {
    const modo = apertado ? ' [MODO APERTADO]' : '';
    return {
      ok: false,
      motivo: `Ultimo post ha ${Math.round(diffMin)}min (minimo ${minutosExigidos}min${modo})`,
      minutosAte: Math.round(minutosExigidos - diffMin),
    };
  }

  return { ok: true };
}

/**
 * Verifica se o produto esta em backoff (erro recente).
 */
function produtoEmBackoff(productId: number): { emBackoff: boolean; minutosAte?: number } {
  const p = db.prepare(`
    SELECT error, updated_at, COALESCE(attempts, 0) as attempts
    FROM products WHERE id = ?
  `).get(productId) as any;

  if (!p?.error || !p.updated_at) return { emBackoff: false };
  if (!String(p.error).includes('2207077')) return { emBackoff: false };

  const nivelIdx = Math.max(0, Math.min(p.attempts, HORAS_BACKOFF_NIVEIS.length) - 1);
  const horasExigidas = HORAS_BACKOFF_NIVEIS[nivelIdx];

  const diffHoras = (Date.now() - new Date(p.updated_at).getTime()) / 1000 / 60 / 60;

  if (diffHoras < horasExigidas) {
    return {
      emBackoff: true,
      minutosAte: Math.round((horasExigidas - diffHoras) * 60),
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

/**
 * [LOCK] Recupera produtos presos em PUBLISHING ha mais de 15 min.
 * Acontece quando um servidor crasha ou fica pendurado a meio.
 */
function recuperarPublishingPresos(): number {
  const r = db.prepare(`
    UPDATE products
    SET status = 'READY', updated_at = datetime('now')
    WHERE status = 'PUBLISHING'
      AND datetime(updated_at) < datetime('now', '-15 minutes')
  `).run();
  if (r.changes > 0) {
    console.log(`  [lock] ${r.changes} produto(s) PUBLISHING presos -> READY`);
  }
  return r.changes;
}

async function main() {
  console.log('Publisher iniciado...\n');

  // ─── Protecção 1: intervalo minimo entre posts ───
  // [LOCK] Libertar produtos presos em PUBLISHING
  recuperarPublishingPresos();

  // [SLOTS] Verificar se estamos num slot valido ou a retomar um pending
  ensureScheduleTable();
  const slot = slotAtual();
  const pending = getPending();
  let slotParaPublicar: string | null = null;

  if (slot) {
    // Dentro de um slot — publicar normalmente
    slotParaPublicar = slot;
    if (pending) {
      console.log(`  [slot] ${slot} — limpando pendente anterior`);
      clearPending();
    }
    console.log(`  [slot] Dentro da janela: ${slot}`);
  } else if (pending) {
    // Fora de slot mas ha pending — verificar backoff
    const backoff = proximoBackoff(pending.retry_count);
    const decorrido = (Date.now() - new Date(pending.pending_since).getTime()) / 60000;
    if (decorrido >= backoff) {
      slotParaPublicar = pending.pending_slot;
      console.log(`  [slot] Retomar pendente ${pending.pending_slot} (tentativa ${pending.retry_count + 1}, backoff ${backoff}min)`);
    } else {
      const faltam = Math.round(backoff - decorrido);
      console.log(`  [slot] Fora de janela. Retry em ${faltam} min.`);
      return;
    }
  } else {
    const agora = new Date();
    const hhmm = String(agora.getHours()).padStart(2, "0") + ":" + String(agora.getMinutes()).padStart(2, "0");
    console.log(`  [slot] Fora de janela (${hhmm}). Aguarda proximo slot.`);
    return;
  }

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
    // [LOCK] Reclamar produto atomicamente
    const claim = db.prepare(`
      UPDATE products
      SET status = 'PUBLISHING', updated_at = datetime('now')
      WHERE id = ? AND status IN ('READY', 'PARTIAL')
    `).run(c.id);

    if (claim.changes === 0) {
      console.log(`  [lock] Produto ${c.id} ja reclamado por outro servidor`);
      continue;
    }

    produto = { ...c, status: 'PUBLISHING' };
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

  const publicados: { id: number; mediaId: string }[] = [];
  let reelId: string | null = null;
  let storyId: string | null = null;
  let feedId: string | null = null;
  let erro2207077 = false;
  let erro2207082 = false;

  // ─── Reel ───
  if (porTipo.reel) {
    console.log('[1/3] Publicando Reel...');
    try {
      const url = porTipo.reel.reel_url || await uploadPublico(porTipo.reel.reel_path);
      console.log('  URL:', url);
      reelId = await publicarReel({ videoUrl: url, caption });
      publicados.push({ id: porTipo.reel.id, mediaId: reelId! });

      await new Promise((r) => setTimeout(r, 5000));
      console.log('  A postar comentario com link...');
      await comentarComLink(reelId, produto);

      console.log('');
    } catch (err) {
      const msg = (err as Error).message;
      console.error('  ERRO reel:', msg.slice(0, 250), '\n');
      if (msg.includes('2207077')) erro2207077 = true;
    if (msg.includes('IG_RETRY_2207082')) erro2207082 = true;
    }
  }

  // ─── Story ───
  if (porTipo.story && !erro2207077) {
    console.log('[2/3] Publicando Story...');
    const url = porTipo.story.reel_url || await uploadPublico(porTipo.story.reel_path);
    console.log('  URL:', url);
    storyId = await publicarStoryComRetry(url);
    if (storyId) publicados.push({ id: porTipo.story.id, mediaId: storyId });
    console.log('');
  } else if (erro2207077) {
    console.log('[2/3] Story saltado (rate limit detectado no reel)\n');
  }

  // ─── Feed ───
  if (porTipo.feed && !erro2207077) {
    console.log('[3/3] Publicando Feed...');
    try {
      const url = porTipo.feed.reel_url || await uploadPublico(porTipo.feed.reel_path);
      console.log('  URL:', url);
      feedId = await publicarFeedImagem({ imageUrl: url, caption });
      publicados.push({ id: porTipo.feed.id, mediaId: feedId! });
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
    if (erro2207082 && !erro2207077) {
      console.log('  2207082 - COOLDOWN 5 min (retry automatico)');
      db.prepare(`
        UPDATE products
        SET status = 'COOLDOWN',
            error = 'retry_2207082',
            updated_at = datetime('now')
        WHERE id = ?
      `).run(produto.id);
    } else if (erro2207077) {
      const tentativas = (produto.attempts ?? 0) + 1;
      const nivelIdx = Math.min(tentativas, HORAS_BACKOFF_NIVEIS.length) - 1;
      const horas = HORAS_BACKOFF_NIVEIS[nivelIdx];
      console.log(`  RATE LIMIT DETECTADO — produto em backoff ${horas}h (tentativa ${tentativas})`);
      db.prepare(`
        UPDATE products
        SET status = 'COOLDOWN',
            error = 'rate_limit_2207077',
            attempts = COALESCE(attempts, 0) + 1,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(produto.id);

      // [SLOTS] Marcar slot como pendente para retry
      if (slotParaPublicar) {
        setPending(slotParaPublicar);
        const proximo = proximoBackoff((getPending()?.retry_count ?? 1));
        console.log(`  [slot] Slot ${slotParaPublicar} guardado. Retry em ${proximo} min.`);
      }
    } else {
      console.log('  NADA FOI PUBLICADO — produto mantido como READY');
    }
    console.log('═══════════════════════════════════════════════════════════');
    return;
  }

  for (const p of publicados) {
    db.prepare(`UPDATE renders SET status = 'POSTED', posted_at = ?, ig_media_id = ? WHERE id = ?`).run(agora, p.mediaId, p.id);
  }

  const proxima = proximaVariacao(variacao);
  const novoVariationsDone = (produto.variations_done ?? 0) + 1;
  const novoStatus = proxima === null ? 'ARCHIVED' : 'COOLDOWN';

  db.prepare(`
    UPDATE products
    SET status = ?, last_variation = ?, variations_done = ?,
        next_variation = COALESCE(?, next_variation),
        last_posted_at = ?, updated_at = datetime('now'),
        error = NULL, attempts = 0
    WHERE id = ?
  `).run(novoStatus, variacao, novoVariationsDone, proxima, agora, produto.id);

  db.prepare(`
    INSERT INTO posts_log (product_id, turno, source, category, ig_media_id)
    VALUES (?, 'manual', ?, ?, ?)
  `).run(produto.id, produto.source, produto.category, reelId ?? storyId ?? feedId ?? '');

  db.prepare(`
    INSERT INTO category_rotation (category, product_id) VALUES (?, ?)
  `).run(produto.category, produto.id);

  // [SLOTS] Publicou com sucesso — limpar estado pendente
  clearPending();

  // [SLOTS] Marcar slot como usado hoje (para nao repetir)
  if (slotParaPublicar) {
    markSlotUsado(slotParaPublicar);
    console.log(`  [slot] Slot ${slotParaPublicar} marcado como usado`);
  }

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