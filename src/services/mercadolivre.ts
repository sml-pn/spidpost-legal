import { env } from '../lib/env.js';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const COOKIES_PATH = path.join(process.cwd(), 'cookies-ml.json');
function lerCookies(): string {
  try {
    const raw = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf-8'));
    const lista = Array.isArray(raw) ? raw : (raw.cookies ?? []);
    return lista.map((c: any) => c.name + '=' + c.value).join('; ');
  } catch { return ''; }
}

const API = 'https://api.mercadolibre.com';
const USER_AGENT_GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const USER_AGENT_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const CATEGORY_MAP: Record<string, string> = {
  'eletronicos': 'eletronicos', 'celulares': 'eletronicos', 'informatica': 'eletronicos',
  'audio': 'eletronicos', 'tv': 'eletronicos',
  'casa': 'casa', 'cozinha': 'casa', 'moveis': 'casa', 'decoracao': 'casa',
  'moda': 'moda', 'calcados': 'moda', 'bolsas': 'moda', 'acessorios': 'moda',
  'beleza': 'beleza', 'cuidado pessoal': 'beleza', 'perfumes': 'beleza',
  'ferramentas': 'ferramentas', 'construcao': 'ferramentas', 'industria': 'ferramentas',
  'automotivo': 'automotivo', 'carros': 'automotivo', 'motos': 'automotivo',
  'esporte': 'esporte', 'fitness': 'esporte', 'camping': 'esporte', 'ciclismo': 'esporte',
  'pet': 'pet', 'animais': 'pet',
  'brinquedos': 'brinquedos', 'infantil': 'brinquedos',
  'games': 'games', 'videogames': 'games',
  'solar': 'solar', 'energia': 'solar',
};

export type ItemData = {
  id: string;
  title: string;
  price: number;
  original_price: number | null;
  thumbnail: string;
  permalink: string;
  category: string;
  category_raw: string | null;
};

type Bookmark = { item_id: string; bookmarked_date: string };

export async function getBookmarks(): Promise<Bookmark[]> {
  const res = await fetch(`${API}/users/me/bookmarks`, {
    headers: { Authorization: `Bearer ${env.ML_ACCESS_TOKEN}` },
  });
  if (!res.ok) throw new Error(`Bookmarks falhou: HTTP ${res.status}`);
  return res.json() as Promise<Bookmark[]>;
}

export async function getItem(itemId: string): Promise<ItemData | null> {
  console.log(`  [1/3] Googlebot: ${itemId}...`);
  const viaGooglebot = await fetchViaGooglebot(itemId);
  if (viaGooglebot) {
    console.log(`  [1/3] Googlebot OK`);
    return viaGooglebot;
  }

  console.log(`  [2/3] Playwright: ${itemId}...`);
  const viaPlaywright = await fetchViaPlaywright(itemId);
  if (viaPlaywright) {
    console.log(`  [2/3] Playwright OK`);
    return viaPlaywright;
  }

  console.log(`  [3/3] Catalogo (anuncio de catalogo): ${itemId}...`);
  const viaCatalogo = await fetchViaCatalogo(itemId);
  if (viaCatalogo) {
    console.log(`  [3/3] Catalogo OK`);
    return viaCatalogo;
  }

  console.log(`  [x] Nenhum metodo funcionou para ${itemId}`);
  return null;
}

async function fetchViaGooglebot(itemId: string): Promise<ItemData | null> {
  try {
    const idNumerico = itemId.replace('MLB', '');
    const url = `https://produto.mercadolivre.com.br/MLB-${idNumerico}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT_GOOGLEBOT, Accept: 'text/html', Cookie: lerCookies() },
      redirect: 'follow',
    });
    if (!res.ok) {
      console.log(`  [debug] Googlebot HTTP ${res.status}`);
      return null;
    }
    const html = await res.text();
    if (html.length < 100_000) {
      console.log(`  [debug] HTML pequeno (${html.length})`);
      return null;
    }
    return parseHtml(html, itemId, url);
  } catch (err) {
    console.log(`  [debug] Googlebot erro: ${(err as Error).message}`);
    return null;
  }
}

async function fetchViaPlaywright(itemId: string): Promise<ItemData | null> {
  const idNumerico = itemId.replace('MLB', '');
  const url = `https://produto.mercadolivre.com.br/MLB-${idNumerico}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ userAgent: USER_AGENT_CHROME, locale: 'pt-BR' });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForSelector('h1.ui-pdp-title', { timeout: 15_000 }).catch(() => {});
    const title = await page.$eval('h1.ui-pdp-title', (el) => el.textContent?.trim() || '').catch(() => '');
    if (!title || title.length < 5) return null;
    const priceText = await page.$eval('meta[itemprop="price"]', (el) => el.getAttribute('content') || '0').catch(() => '0');
    const price = parseFloat(priceText) || 0;
    const imageUrl = await page.$eval('img.ui-pdp-gallery__figure__image', (el) => el.getAttribute('data-zoom') || el.getAttribute('src') || '').catch(() => '');
    const breadcrumb = await page.$$eval('.andes-breadcrumb__link', (els) => els.map((e) => e.textContent?.trim() || '')).catch(() => [] as string[]);
    const categoryRaw = breadcrumb.length > 0 ? breadcrumb[breadcrumb.length - 1] : null;
    const category = mapCategory(breadcrumb);
    return { id: itemId, title, price, original_price: null, thumbnail: imageUrl, permalink: url, category, category_raw: categoryRaw };
  } finally {
    await browser.close();
  }
}

/**
 * [ANTI-FALHA] Tenta ler anuncios de catalogo.
 * O ML redireciona produto.mercadolivre.com.br/MLB-XXXX para
 * mercadolivre.com.br/.../p/{catalog_id}?pdp_filters=item_id:MLB-XXXX
 * Este metodo le o redirect e vai buscar a pagina do catalogo.
 */
async function fetchViaCatalogo(itemId: string): Promise<ItemData | null> {
  const idNumerico = itemId.replace('MLB', '');
  const urlOriginal = `https://produto.mercadolivre.com.br/MLB-${idNumerico}`;

  try {
    // Passo 1: descobrir o redirect (catalog_id)
    const resRedirect = await fetch(urlOriginal, {
      headers: { 'User-Agent': USER_AGENT_CHROME, Accept: 'text/html', Cookie: lerCookies() },
      redirect: 'manual',
    });

    const location = resRedirect.headers.get('location') || '';
    console.log(`  [debug] redirect: ${location.slice(0, 80)}...`);

    // Se nao houver redirect, o produto pode estar noutro formato
    if (!location) {
      console.log(`  [debug] sem redirect - produto nao encontrado no catalogo`);
      return null;
    }

    // Passo 2: ir buscar a pagina do catalogo
    const resCatalogo = await fetch(location, {
      headers: { 'User-Agent': USER_AGENT_CHROME, Accept: 'text/html', Cookie: lerCookies() },
      redirect: 'follow',
    });

    if (!resCatalogo.ok) {
      console.log(`  [debug] Catalogo HTTP ${resCatalogo.status}`);
      return null;
    }

    const html = await resCatalogo.text();
    if (html.length < 100_000) {
      console.log(`  [debug] Catalogo HTML pequeno (${html.length})`);
      return null;
    }

    // Passo 3: extrair dados do HTML do catalogo
    const item = parseHtml(html, itemId, location);
    if (item) {
      item.permalink = location; // usar o URL do catalogo
    }
    return item;
  } catch (err) {
    console.log(`  [debug] Catalogo erro: ${(err as Error).message}`);
    return null;
  }
}

function parseHtml(html: string, itemId: string, url: string): ItemData | null {
  const titleMatch =
    html.match(/<h1[^>]*class="ui-pdp-title"[^>]*>([^<]+)<\/h1>/i) ||
    html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i);
  if (!titleMatch?.[1] || titleMatch[1].trim().length < 5) return null;
  const title = titleMatch[1].trim().replace(/\s+/g, ' ');

  let price = 0;
  const priceMeta = html.match(/<meta[^>]*itemProp="price"[^>]*content="([\d.]+)"/i);
  if (priceMeta) price = parseFloat(priceMeta[1]);
  else {
    const priceJson = html.match(/"price":\s*([\d.]+)/);
    if (priceJson) price = parseFloat(priceJson[1]);
  }

  let originalPrice: number | null = null;
  const originalMatch = html.match(/aria-label="Antes:\s*(\d+)\s*reais?\s*com\s*(\d+)\s*centavos?"/i);
  if (originalMatch) originalPrice = parseFloat(`${originalMatch[1]}.${originalMatch[2]}`);

  const imageMatch = html.match(/data-zoom="([^"]+)"/i) || html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i);

  const breadcrumb: string[] = [];
  const bcRegex = /<a[^>]*class="andes-breadcrumb__link"[^>]*title="([^"]+)"/gi;
  let match;
  while ((match = bcRegex.exec(html)) !== null) breadcrumb.push(match[1]);
  const categoryRaw = breadcrumb.length > 0 ? breadcrumb[breadcrumb.length - 1] : null;
  const category = mapCategory(breadcrumb);

  return {
    id: itemId, title, price, original_price: originalPrice,
    thumbnail: imageMatch ? imageMatch[1] : '',
    permalink: url, category, category_raw: categoryRaw,
  };
}

function mapCategory(breadcrumb: string[]): string {
  const texto = breadcrumb.join(' ').toLowerCase();
  for (const [key, value] of Object.entries(CATEGORY_MAP)) {
    if (texto.includes(key)) return value;
  }
  return 'outros';
}