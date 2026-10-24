import { chromium, BrowserContext, Page } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const PROFILE_DIR = path.join(process.cwd(), 'browser-profile');

export type BrowserAberto = { context: BrowserContext; page: Page };

export async function abrirBrowser(headless: boolean = false): Promise<BrowserAberto> {
  if (!fs.existsSync(PROFILE_DIR)) fs.mkdirSync(PROFILE_DIR, { recursive: true });

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless,
    channel: 'chrome',
    viewport: { width: 1366, height: 900 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    args: [
      '--start-maximized',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
  });

  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();
  return { context, page };
}

export async function fecharBrowser(context: BrowserContext): Promise<void> {
  try { await context.close(); } catch {}
}

export async function extrairCookies(context: BrowserContext): Promise<Array<{ name: string; value: string; domain: string; path: string }>> {
  const state = await context.storageState();
  return (state.cookies ?? [])
    .filter((c) => c.domain?.includes('mercadolivre') || c.domain?.includes('mercadolibre'))
    .map((c) => ({ name: c.name, value: c.value, domain: c.domain ?? '', path: c.path ?? '/' }));
}

export function perfilExiste(): boolean {
  return fs.existsSync(PROFILE_DIR) && fs.readdirSync(PROFILE_DIR).length > 0;
}
