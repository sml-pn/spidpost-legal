/**
 * gerar-link-afiliado.ts
 * ──────────────────────────────────────────────────────────────────────
 * Gera link de afiliado usando @afilimax/mercado-livre-provider.
 *
 * Modos de operação:
 *   1. Ficheiro: lê cookies do ficheiro ./cookies-ml.json (exportado pela extensão)
 *   2. Browser: abre o browser persistente e extrai cookies automaticamente
 *
 * Uso:
 *   npx tsx gerar-link-afiliado.ts <URL_DO_PRODUTO>
 *   npx tsx gerar-link-afiliado.ts --todos
 *   npx tsx gerar-link-afiliado.ts --browser <URL_DO_PRODUTO>
 * ──────────────────────────────────────────────────────────────────────
 */

import fs from 'node:fs';
import path from 'node:path';
import { db } from './src/lib/db.js';

const COOKIES_PATH = path.join(process.cwd(), 'cookies-ml.json');
const TAG_AFILIADO = 'pesa9076122';

type Cookie = { name: string; value: string; domain?: string; path?: string };

/**
 * Lê os cookies do ficheiro cookies-ml.json.
 * Suporta o formato da extensão AcheiVIP (array dentro de .cookies)
 * e o formato de array direto.
 */
function lerCookiesDoFicheiro(): Cookie[] | null {
  if (!fs.existsSync(COOKIES_PATH)) return null;

  try {
    const raw = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf-8'));

    // Formato 1: array direto
    if (Array.isArray(raw)) {
      return raw
        .filter((c: any) => c.name && c.value)
        .map((c: any) => ({ name: c.name, value: c.value, domain: c.domain, path: c.path }));
    }

    // Formato 2: extensão AcheiVIP (tem .cookies)
    if (raw.cookies && Array.isArray(raw.cookies)) {
      return raw.cookies
        .filter((c: any) => c.name && c.value)
        .map((c: any) => ({ name: c.name, value: c.value, domain: c.domain, path: c.path }));
    }

    // Formato 3: objeto plano
    if (typeof raw === 'object') {
      const cookies: Cookie[] = [];
      for (const [name, value] of Object.entries(raw)) {
        if (typeof value === 'string' && name !== 'csrf' && name !== 'cookie') {
          cookies.push({ name, value });
        }
      }
      return cookies.length > 0 ? cookies : null;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Abre o browser persistente, extrai os cookies e fecha.
 * Usa o mesmo perfil guardado em ./browser-profile.
 */
async function extrairCookiesDoBrowser(): Promise<Cookie[]> {
  console.log('A abrir browser para extrair cookies...');

  const { chromium } = await import('playwright');
  const PROFILE_DIR = path.join(process.cwd(), 'browser-profile');

  if (!fs.existsSync(PROFILE_DIR)) {
    throw new Error(
      'Perfil do browser nao encontrado. Corre primeiro: npx tsx login-ml.ts'
    );
  }

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    locale: 'pt-BR',
  });

  try {
    const state = await context.storageState();
    const cookies = (state.cookies ?? [])
      .filter(
        (c) =>
          c.domain?.includes('mercadolivre') ||
          c.domain?.includes('mercadolibre') ||
          c.domain?.includes('mercadopago')
      )
      .map((c) => ({ name: c.name, value: c.value, domain: c.domain, path: c.path }));

    // Guardar no ficheiro para uso futuro
    fs.writeFileSync(
      COOKIES_PATH,
      JSON.stringify({ cookies, exported_at: new Date().toISOString() }, null, 2),
      'utf-8'
    );

    console.log(`  OK ${cookies.length} cookies extraidos e guardados`);
    return cookies;
  } finally {
    await context.close();
  }
}

async function gerarLink(url: string, cookies: Cookie[]): Promise<string> {
  const { MercadoLivreProvider } = await import('@afilimax/mercado-livre-provider');

  const provider = new (MercadoLivreProvider as any)({
    tag: TAG_AFILIADO,
    cookies: cookies,
  });

  return await provider.createAffiliateUrl(url);
}

async function main() {
  const arg1 = process.argv[2];
  const arg2 = process.argv[3];

  console.log('══════════════════════════════════════════════');
  console.log('  GERAR LINK DE AFILIADO');
  console.log('══════════════════════════════════════════════');
  console.log('');

  // ─── Obter cookies ───
  let cookies: Cookie[] | null = null;
  let modo = '';

  if (arg1 === '--browser') {
    // Modo browser: extrai cookies do perfil persistente
    try {
      cookies = await extrairCookiesDoBrowser();
      modo = 'browser';
    } catch (err) {
      console.error('Erro ao extrair cookies do browser:', (err as Error).message);
      process.exit(1);
    }
  } else {
    // Modo ficheiro: lê do cookies-ml.json
    cookies = lerCookiesDoFicheiro();
    modo = 'ficheiro';

    if (!cookies) {
      console.log('Ficheiro de cookies nao encontrado ou invalido.');
      console.log('A tentar modo browser...');
      try {
        cookies = await extrairCookiesDoBrowser();
        modo = 'browser';
      } catch (err) {
        console.error('Erro:', (err as Error).message);
        console.log('');
        console.log('Alternativas:');
        console.log('  1. Exporta cookies com a extensao AcheiVIP para cookies-ml.json');
        console.log('  2. Corre: npx tsx login-ml.ts (para criar o perfil do browser)');
        process.exit(1);
      }
    }
  }

  // ─── Mostrar cookies essenciais ───
  const essenciais = ['_csrf', 'ssid', 'orguserid', 'orgnickp'];
  console.log(`Modo: ${modo}`);
  console.log(`Cookies: ${cookies.length}`);
  console.log('Essenciais:');
  essenciais.forEach((nome) => {
    const tem = cookies!.some((c) => c.name === nome);
    console.log(`  ${tem ? 'OK' : 'XX'} ${nome}`);
  });
  console.log('');

  if (cookies.length === 0) {
    console.error('Sem cookies. Nao e possivel gerar links.');
    process.exit(1);
  }

  // ─── Executar ───
  if (arg1 === '--todos') {
    const produtos = db.prepare(`
      SELECT id, name, affiliate_url FROM products
      WHERE status = 'PENDING' AND removed_from_ml = 0
      ORDER BY created_at ASC
      LIMIT 10
    `).all() as any[];

    console.log(`Modo --todos: ${produtos.length} produtos (limite 10)\n`);

    let sucesso = 0;
    let falha = 0;

    for (const p of produtos) {
      process.stdout.write(`[${sucesso + falha + 1}/${produtos.length}] ${p.name.slice(0, 40)}... `);
      try {
        const link = await gerarLink(p.affiliate_url, cookies!);
        db.prepare('UPDATE products SET affiliate_url = ? WHERE id = ?').run(link, p.id);
        console.log(`OK ${link}`);
        sucesso++;
      } catch (err) {
        console.log(`XX ${(err as Error).message.slice(0, 80)}`);
        falha++;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }

    console.log('');
    console.log(`═══ ${sucesso} sucessos, ${falha} falhas ═══`);
  } else {
    const url = arg1 === '--browser' ? arg2 : arg1;
    if (!url) {
      console.log('Uso:');
      console.log('  npx tsx gerar-link-afiliado.ts <URL>');
      console.log('  npx tsx gerar-link-afiliado.ts --todos');
      console.log('  npx tsx gerar-link-afiliado.ts --browser <URL>');
      return;
    }

    console.log(`URL: ${url}\n`);
    try {
      const link = await gerarLink(url, cookies);
      console.log('');
      console.log('═══════════════════════════════════════════════');
      console.log(`  LINK GERADO:`);
      console.log(`  ${link}`);
      console.log('═══════════════════════════════════════════════');
    } catch (err) {
      console.error('');
      console.error('ERRO:', (err as Error).message);
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error('ERRO FATAL:', err.message);
  process.exit(1);
});