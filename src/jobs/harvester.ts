/**
 * harvester.ts
 * ──────────────────────────────────────────────────────────────────────
 * Lê favoritos do ML, sincroniza com o banco E gera links de afiliado
 * automaticamente usando AfiliMax.
 *
 * Fluxo:
 *   1. Lê favoritos via API do ML
 *   2. Deteta removidos
 *   3. Para cada favorito NOVO:
 *      a. Extrai dados (nome, preço, imagem)
 *      b. Gera link de afiliado (AfiliMax)
 *      c. Guarda no banco já com o link correto
 * ──────────────────────────────────────────────────────────────────────
 */

import fs from 'node:fs';
import path from 'node:path';
import { getBookmarks, getItem } from '../services/mercadolivre.js';
import { db } from '../lib/db.js';

const COOKIES_PATH = path.join(process.cwd(), 'cookies-ml.json');
const TAG_AFILIADO = 'pesa9076122';

type Cookie = { name: string; value: string; domain?: string; path?: string };

function lerCookies(): Cookie[] | null {
  if (!fs.existsSync(COOKIES_PATH)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf-8'));
    const lista = Array.isArray(raw) ? raw : (raw.cookies ?? []);
    const cookies = lista
      .filter((c: any) => c.name && c.value)
      .map((c: any) => ({ name: c.name, value: c.value, domain: c.domain, path: c.path }));
    return cookies.length > 0 ? cookies : null;
  } catch {
    return null;
  }
}

async function gerarLinkAfiliado(
  provider: any,
  url: string
): Promise<string | null> {
  try {
    const link = await provider.createAffiliateUrl(url);
    return typeof link === 'string' && link.length > 0 ? link : null;
  } catch (err) {
    console.log(`      Aviso: ${(err as Error).message.slice(0, 80)}`);
    return null;
  }
}

async function main() {
  console.log('Harvester iniciado...\n');

  // ─── Preparar provider de afiliado ───
  let provider: any = null;
  const cookies = lerCookies();

  if (cookies) {
    console.log(`OK ${cookies.length} cookies de afiliado carregados`);
    const { MercadoLivreProvider } = await import('@afilimax/mercado-livre-provider');
    provider = new (MercadoLivreProvider as any)({
      tag: TAG_AFILIADO,
      cookies: cookies,
    });
  } else {
    console.log('ATENCAO: cookies-ml.json nao encontrado.');
    console.log('   Links de afiliado NAO serao gerados (usa links normais).');
    console.log('   Corre primeiro: npx tsx login-ml.ts');
  }
  console.log('');

  // ─── 1. Ler favoritos ───
  const bookmarks = await getBookmarks();
  console.log(`${bookmarks.length} favoritos no ML\n`);

  const idsAtuais = new Set(bookmarks.map((b) => b.item_id));

  // ─── 2. Detetar removidos ───
  const todosNoBanco = db.prepare(`
    SELECT id, external_id, name FROM products
    WHERE source = 'mercadolivre' AND removed_from_ml = 0
  `).all() as any[];

  let removidos = 0;
  const stmtRemover = db.prepare(`
    UPDATE products SET removed_from_ml = 1, updated_at = datetime('now')
    WHERE id = ?
  `);

  for (const p of todosNoBanco) {
    if (!idsAtuais.has(p.external_id)) {
      stmtRemover.run(p.id);
      removidos++;
      console.log(`  X   [REMOVIDO] ${p.name.slice(0, 60)}`);
    }
  }

  if (removidos > 0) console.log(`\n  ${removidos} marcados como removidos\n`);

  // ─── 3. Adicionar favoritos novos ───
  let novos = 0;
  let ignorados = 0;
  let falhas = 0;
  let comAfiliado = 0;

  for (const bm of bookmarks) {
    try {
      const existe = db.prepare(`
        SELECT id FROM products WHERE source = 'mercadolivre' AND external_id = ?
      `).get(bm.item_id);

      if (existe) {
        ignorados++;
        continue;
      }

      const item = await getItem(bm.item_id);
      if (!item) {
        falhas++;
        console.log(`  X   ${bm.item_id} - produto inexistente`);
        continue;
      }

      // ─── Gerar link de afiliado ───
      let linkFinal = item.permalink;
      if (provider) {
        const linkAfiliado = await gerarLinkAfiliado(provider, item.permalink);
        if (linkAfiliado) {
          linkFinal = linkAfiliado;
          comAfiliado++;
        }
      }

      db.prepare(`
        INSERT INTO products
          (external_id, source, name, price, original_price, thumbnail,
           affiliate_url, category, category_raw, status, next_variation)
        VALUES (?, 'mercadolivre', ?, ?, ?, ?, ?, ?, ?, 'PENDING', 'A')
      `).run(
        item.id, item.title, item.price, item.original_price,
        item.thumbnail, linkFinal, item.category, item.category_raw
      );

      novos++;
      const tag = linkFinal.includes('meli.la') ? '[AFILIADO]' : '[normal]';
      console.log(`  OK  ${tag} [${item.category}] ${item.title.slice(0, 50)} - R$ ${item.price}`);

      await new Promise((r) => setTimeout(r, 1500));
    } catch (err) {
      falhas++;
      console.error(`  ERRO ${bm.item_id}: ${(err as Error).message}`);
    }
  }

  // ─── 4. Resumo ───
  console.log(`\nResultado:`);
  console.log(`  ${novos} novos (${comAfiliado} com link afiliado)`);
  console.log(`  ${ignorados} ja existiam`);
  console.log(`  ${removidos} removidos`);
  console.log(`  ${falhas} falhas`);

  const total = db.prepare(`
    SELECT
      SUM(CASE WHEN removed_from_ml = 0 THEN 1 ELSE 0 END) as ativos,
      SUM(CASE WHEN affiliate_url LIKE '%meli.la%' THEN 1 ELSE 0 END) as com_afiliado
    FROM products
  `).get() as any;

  console.log(`\nTotal:`);
  console.log(`  ${total.ativos} ativos no banco`);
  console.log(`  ${total.com_afiliado} com link de afiliado`);
}

main().catch((err) => {
  console.error('Erro fatal:', err);
  process.exit(1);
});