/**
 * Serviço de integração com o Mercado Livre
 * 
 * Estratégia:
 *   1. Lê favoritos do usuário via API oficial (Bookmarks API) — funciona sempre
 *   2. Extrai detalhes de cada produto (nome, preço, imagem) via scraping
 *      do HTML público usando User-Agent do Googlebot (que o ML libera)
 *   3. Se o Googlebot falhar, usa Playwright (navegador real headless)
 * 
 * Nota: o endpoint oficial /items/{id} está bloqueado para apps não
 * certificadas. Por isso o scraping é necessário.
 */

import { env } from '../lib/env.js';
import { chromium } from 'playwright';

// ─────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────

const API = 'https://api.mercadolibre.com';

// User-Agent do Googlebot: o ML libera o HTML completo para ele
const USER_AGENT_GOOGLEBOT =
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

// User-Agent do Chrome real: usado no Playwright
const USER_AGENT_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ─────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────

export type ItemData = {
  id: string;
  title: string;
  price: number;
  original_price: number | null;
  thumbnail: string;
  permalink: string;
};

type Bookmark = {
  item_id: string;
  bookmarked_date: string;
};

// ─────────────────────────────────────────────────────────────
// API oficial: favoritos
// ─────────────────────────────────────────────────────────────

/**
 * Retorna a lista de favoritos do usuário autenticado.
 * Esse endpoint é oficial e não é bloqueado.
 */
export async function getBookmarks(): Promise<Bookmark[]> {
  const res = await fetch(`${API}/users/me/bookmarks`, {
    headers: { Authorization: `Bearer ${env.ML_ACCESS_TOKEN}` },
  });

  if (!res.ok) {
    throw new Error(`Bookmarks falhou: HTTP ${res.status} - ${await res.text()}`);
  }

  return res.json() as Promise<Bookmark[]>;
}

// ─────────────────────────────────────────────────────────────
// Extração de detalhes do produto (orquestrador)
// ─────────────────────────────────────────────────────────────

/**
 * Obtém os dados de um produto pelo ID (ex: "MLB3525276453").
 * Retorna `null` se o produto não existir mais.
 * 
 * Estratégia:
 *   1. Tenta Googlebot (rápido, ~1-2s)
 *   2. Se falhar, usa Playwright (lento, ~5-8s, mas garantido)
 */
export async function getItem(itemId: string): Promise<ItemData | null> {
  console.log(`  [1/2] Tentando Googlebot para ${itemId}...`);
  const viaGooglebot = await fetchViaGooglebot(itemId);
  if (viaGooglebot) {
    console.log(`  [1/2] Googlebot OK`);
    return viaGooglebot;
  }

  console.log(`  [2/2] Googlebot falhou, usando Playwright...`);
  const viaPlaywright = await fetchViaPlaywright(itemId);
  if (viaPlaywright) {
    console.log(`  [2/2] Playwright OK`);
    return viaPlaywright;
  }

  console.log(`  [x] Nenhum método conseguiu extrair ${itemId}`);
  return null;
}

// ─────────────────────────────────────────────────────────────
// Método 1: Googlebot (rápido)
// ─────────────────────────────────────────────────────────────

async function fetchViaGooglebot(itemId: string): Promise<ItemData | null> {
  try {
    const idNumerico = itemId.replace('MLB', '');
    const url = `https://produto.mercadolivre.com.br/MLB-${idNumerico}`;

    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT_GOOGLEBOT,
        Accept: 'text/html',
      },
      redirect: 'follow',
    });

    if (!res.ok) {
      console.log(`  [debug] Googlebot HTTP ${res.status}`);
      return null;
    }

    const html = await res.text();

    // Página < 100KB geralmente é tela de bloqueio/verificação
    if (html.length < 100_000) {
      console.log(`  [debug] Googlebot retornou HTML pequeno (${html.length})`);
      return null;
    }

    return parseHtml(html, itemId, url);
  } catch (err) {
    console.log(`  [debug] Googlebot erro: ${(err as Error).message}`);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Método 2: Playwright (fallback garantido)
// ─────────────────────────────────────────────────────────────

async function fetchViaPlaywright(itemId: string): Promise<ItemData | null> {
  const idNumerico = itemId.replace('MLB', '');
  const url = `https://produto.mercadolivre.com.br/MLB-${idNumerico}`;

  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({
      userAgent: USER_AGENT_CHROME,
      locale: 'pt-BR',
    });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page
      .waitForSelector('h1.ui-pdp-title', { timeout: 15_000 })
      .catch(() => {});

    const title = await page
      .$eval('h1.ui-pdp-title', (el) => el.textContent?.trim() || '')
      .catch(() => '');

    if (!title || title.length < 5) return null;

    // Preço principal (schema.org)
    const priceText = await page
      .$eval('meta[itemprop="price"]', (el) => el.getAttribute('content') || '0')
      .catch(() => '0');
    const price = parseFloat(priceText) || 0;

    // Preço original (riscado)
    const originalText = await page
      .$eval('s.andes-money-amount--previous', (el) => el.textContent || '')
      .catch(() => '');
    const originalPrice = parseBrazilianPrice(originalText);

    // Imagem em alta resolução
    const imageUrl = await page
      .$eval('img.ui-pdp-gallery__figure__image', (el) => el.getAttribute('data-zoom') || el.getAttribute('src') || '')
      .catch(() => '');

    return {
      id: itemId,
      title,
      price,
      original_price: originalPrice,
      thumbnail: imageUrl,
      permalink: url,
    };
  } finally {
    await browser.close();
  }
}

// ─────────────────────────────────────────────────────────────
// Parser de HTML (usado pelo Googlebot)
// ─────────────────────────────────────────────────────────────

function parseHtml(html: string, itemId: string, url: string): ItemData | null {
  // ─── Título ───
  const titleMatch =
    html.match(/<h1[^>]*class="ui-pdp-title"[^>]*>([^<]+)<\/h1>/i) ||
    html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i);

  if (!titleMatch?.[1] || titleMatch[1].trim().length < 5) {
    console.log(`  [debug] Não conseguiu extrair título`);
    return null;
  }
  const title = titleMatch[1].trim().replace(/\s+/g, ' ');

  // ─── Preço principal (meta tag schema.org) ───
  let price = 0;
  const priceMeta = html.match(
    /<meta[^>]*itemProp="price"[^>]*content="([\d.]+)"/i
  );
  if (priceMeta) {
    price = parseFloat(priceMeta[1]);
  } else {
    // Fallback: JSON embutido no HTML
    const priceJson = html.match(/"price":\s*([\d.]+)/);
    if (priceJson) price = parseFloat(priceJson[1]);
  }

  // ─── Preço original (riscado) via aria-label ───
  let originalPrice: number | null = null;
  const originalMatch = html.match(
    /aria-label="Antes:\s*(\d+)\s*reais?\s*com\s*(\d+)\s*centavos?"/i
  );
  if (originalMatch) {
    originalPrice = parseFloat(`${originalMatch[1]}.${originalMatch[2]}`);
  }

  // ─── Imagem em alta resolução ───
  const imageMatch =
    html.match(/data-zoom="([^"]+)"/i) ||
    html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i);

  console.log(`  [debug] Title: ${title}`);
  console.log(`  [debug] Price: R$ ${price}`);
  if (originalPrice) console.log(`  [debug] Original: R$ ${originalPrice}`);

  return {
    id: itemId,
    title,
    price,
    original_price: originalPrice,
    thumbnail: imageMatch ? imageMatch[1] : '',
    permalink: url,
  };
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Converte string de preço brasileira para número.
 * Ex: "R$ 426,79" → 426.79
 *     "1.234,56" → 1234.56
 */
function parseBrazilianPrice(raw: string): number | null {
  const match = raw.match(/([\d.]+),(\d{2})/);
  if (!match) return null;
  const inteiros = match[1].replace(/\./g, '');
  const centavos = match[2];
  return parseFloat(`${inteiros}.${centavos}`);
}