/**
 * importar-lista.ts
 * ──────────────────────────────────────────────────────────────────────
 * Faz scraping da lista de afiliados usando o browser persistente.
 * Reutiliza a sessão do login-ml.ts (não pede login novamente).
 * ──────────────────────────────────────────────────────────────────────
 */

import { abrirBrowser, fecharBrowser } from './src/lib/browser-persistente.js';
import { db } from './src/lib/db.js';

const URL_LISTA = 'https://www.mercadolivre.com.br/social/pesa9076122/lists/9505c18b-1417-49d3-bd00-9ccf2927a453?matt_tool=25916945';

function parsePreco(raw: string): number {
  if (!raw) return 0;
  const limpo = raw.replace(/[^\d,.]/g, '').replace(/\./g, '').replace(',', '.');
  return parseFloat(limpo) || 0;
}

function extrairExternalId(link: string): string | null {
  const match = link.match(/(MLB-?\d+)/);
  return match ? match[1] : null;
}

async function main() {
  console.log('══════════════════════════════════════════════');
  console.log('  IMPORTAR LISTA (browser persistente)');
  console.log('══════════════════════════════════════════════');
  console.log('');

  const { context, page } = await abrirBrowser(true);

  try {
    console.log('A abrir a lista...');
    await page.goto(URL_LISTA, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('.poly-component__title', { timeout: 30000 }).catch(() => {});

    console.log('A fazer scroll para carregar tudo...');
    let alturaAnt = 0;
    let tentativas = 0;
    const MAX = 50;

    while (tentativas < MAX) {
      alturaAnt = await page.evaluate(() => document.body.scrollHeight);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1500);
      const alturaNova = await page.evaluate(() => document.body.scrollHeight);
      if (alturaNova === alturaAnt) break;
      tentativas++;
      await page.evaluate(() => window.scrollBy(0, -300));
      await page.waitForTimeout(500);
    }

    const produtos = await page.evaluate(() => {
      const items: any[] = [];
      const containers = document.querySelectorAll('.poly-card, [class*="poly-card"], [class*="search-result"]');
      containers.forEach((el) => {
        const titulo = el.querySelector('.poly-component__title, [class*="poly-component__title"]')?.textContent?.trim() ?? '';
        const link = (el.querySelector('a[href*="produto"], a[href*="MLB"], a[href]') as HTMLAnchorElement)?.href ?? '';
        const precoAtual = el.querySelector('.poly-price__current .andes-money-amount__fraction')?.textContent?.trim() ?? '0';
        const precoAnterior = el.querySelector('.andes-money-amount--previous .andes-money-amount__fraction')?.textContent?.trim() ?? '';
        const imagem = (el.querySelector('.poly-component__picture, img') as HTMLImageElement)?.src ?? '';
        if (titulo && link) items.push({ titulo, link, preco: precoAtual, preco_anterior: precoAnterior, imagem });
      });
      return items;
    });

    console.log(`  Encontrados: ${produtos.length} produtos\n`);

    if (produtos.length === 0) {
      console.log('X Nenhum produto encontrado.');
      await page.screenshot({ path: 'debug-lista.png', fullPage: true });
      return;
    }

    let novos = 0, ignorados = 0, erros = 0;

    for (const p of produtos) {
      try {
        const externalId = extrairExternalId(p.link);
        if (!externalId) { erros++; continue; }

        const existe = db.prepare('SELECT id FROM products WHERE external_id = ?').get(externalId);
        if (existe) { ignorados++; continue; }

        const preco = parsePreco(p.preco);
        const precoAnterior = p.preco_anterior ? parsePreco(p.preco_anterior) : null;

        db.prepare(`
          INSERT INTO products
            (external_id, source, name, price, original_price, thumbnail, affiliate_url, category, status, next_variation)
          VALUES (?, 'mercadolivre', ?, ?, ?, ?, ?, 'outros', 'PENDING', 'A')
        `).run(externalId, p.titulo, preco, precoAnterior, p.imagem, p.link);

        novos++;
        console.log(`  OK ${p.titulo.slice(0, 60)} — R$ ${preco}`);
      } catch (err) {
        erros++;
        console.error(`  ERRO: ${(err as Error).message}`);
      }
    }

    console.log('');
    console.log('═══════════════════════════════════════════════');
    console.log(`  ${novos} novos`);
    console.log(`  ${ignorados} ja existiam`);
    console.log(`  ${erros} erros`);
    console.log('═══════════════════════════════════════════════');
  } finally {
    await fecharBrowser(context);
  }
}

main().catch((err) => {
  console.error('ERRO FATAL:', err.message);
  process.exit(1);
});