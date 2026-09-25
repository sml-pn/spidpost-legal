/**
 * login-ml.ts
 * ──────────────────────────────────────────────────────────────────────
 * SETUP ÚNICO: abre o browser, faz login no Mercado Livre e fecha.
 * Depois disto, todos os outros scripts reutilizam a sessão.
 *
 * Uso:
 *   npx tsx login-ml.ts
 * ──────────────────────────────────────────────────────────────────────
 */

import { abrirBrowser, fecharBrowser } from './src/lib/browser-persistente.js';

const URL_AFILIADOS = 'https://www.mercadolivre.com.br/afiliados';

async function main() {
  console.log('══════════════════════════════════════════════');
  console.log('  LOGIN MERCADO LIVRE (setup unico)');
  console.log('══════════════════════════════════════════════');
  console.log('');

  const { context, page } = await abrirBrowser(false);

  console.log('A abrir o Mercado Livre Afiliados...\n');
  await page.goto(URL_AFILIADOS, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);

  const url = page.url();
  const jaLogado = !url.includes('login') && !url.includes('signin') && !url.includes('account-verification');

  console.log('╔══════════════════════════════════════════════╗');
  if (jaLogado) {
    console.log('║  JA ESTAS LOGADO!                            ║');
    console.log('║  Podes fechar o browser quando quiseres.    ║');
  } else {
    console.log('║  FAZ LOGIN AGORA:                            ║');
    console.log('║  1. Entra na tua conta Mercado Livre        ║');
    console.log('║  2. Confirma que chegas ao painel Afiliados ║');
    console.log('║  3. Fecha a janela do browser               ║');
  }
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
  console.log('A aguardar que feches o browser...');

  await new Promise<void>((resolve) => {
    context.on('close', () => resolve());
  });

  console.log('');
  console.log('OK Sessao guardada em ./browser-profile/');
  console.log('   Os proximos scripts ja nao pedem login.');
  process.exit(0);
}

main().catch((err) => {
  console.error('ERRO:', err.message);
  process.exit(1);
});