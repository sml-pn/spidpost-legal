/**
 * browser-persistente.ts
 * ──────────────────────────────────────────────────────────────────────
 * Módulo partilhado para abrir o browser Chromium PERSISTENTE.
 *
 * Todos os scripts usam este módulo. O perfil fica guardado em
 * ./browser-profile e mantém login, cookies e sessão entre execuções.
 *
 * Uso:
 *   import { abrirBrowser, fecharBrowser } from './src/lib/browser-persistente.js';
 *   const { context, page } = await abrirBrowser();
 *   // ... usa page ...
 *   await fecharBrowser(context);
 * ──────────────────────────────────────────────────────────────────────
 */

import { chromium, BrowserContext, Page } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const PROFILE_DIR = path.join(process.cwd(), 'browser-profile');

export type BrowserAberto = {
  context: BrowserContext;
  page: Page;
};

/**
 * Abre o browser persistente (reutiliza a sessão guardada).
 * Por defeito é visível. Passa headless=true para correr invisível.
 */
export async function abrirBrowser(headless: boolean = false): Promise<BrowserAberto> {
  if (!fs.existsSync(PROFILE_DIR)) {
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
  }

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless,
    viewport: { width: 1366, height: 900 },
    locale: 'pt-BR',
    args: ['--start-maximized'],
  });

  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();

  return { context, page };
}

/**
 * Fecha o browser e guarda o estado da sessão.
 */
export async function fecharBrowser(context: BrowserContext): Promise<void> {
  try {
    await context.close();
  } catch {
    /* ignore */
  }
}

/**
 * Extrai os cookies atuais do contexto (para passar a libs externas).
 */
export async function extrairCookies(context: BrowserContext): Promise<Array<{ name: string; value: string; domain: string; path: string }>> {
  const state = await context.storageState();
  return (state.cookies ?? [])
    .filter((c) => c.domain?.includes('mercadolivre') || c.domain?.includes('mercadolibre') || c.domain?.includes('mercadopago'))
    .map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain ?? '',
      path: c.path ?? '/',
    }));
}

/**
 * Verifica se já existe uma sessão de Mercado Livre no perfil.
 * Retorna true se o utilizador já fez login alguma vez.
 */
export function perfilExiste(): boolean {
  return fs.existsSync(PROFILE_DIR) && fs.readdirSync(PROFILE_DIR).length > 0;
}