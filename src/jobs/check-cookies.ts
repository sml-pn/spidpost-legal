/**
 * check-cookies.ts
 * ─────────────────────────────────────────────────────────────────────
 * Verifica se a sessão do Mercado Livre ainda está válida.
 *
 * Fluxo:
 *   1. Abre browser HEADLESS (invisível)
 *   2. Vai à página de afiliados
 *   3. Se estiver logado → fecha e sai OK
 *   4. Se NÃO estiver logado → abre browser VISÍVEL, mostra instruções,
 *      espera o utilizador fazer login e fechar
 *   5. Volta a verificar que está OK
 *
 * Uso:
 *   npx tsx src/jobs/check-cookies.ts
 *
 * Exit codes:
 *   0 = sessão válida (ou renovada com sucesso)
 *   1 = utilizador não fez login / sessão inválida
 * ─────────────────────────────────────────────────────────────────────
 */

import { abrirBrowser, fecharBrowser } from '../lib/browser-persistente.js';

const URL_AFILIADOS = 'https://www.mercadolivre.com.br/afiliados';
const TIMEOUT_PAGINA = 60_000;
const ESPERA_APOS_LOAD_MS = 3000;

async function sessaoValida(page: any): Promise<boolean> {
  try {
    await page.goto(URL_AFILIADOS, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_PAGINA });
    await page.waitForTimeout(ESPERA_APOS_LOAD_MS);

    const url = page.url();

    // Se redirecionou para login → sessão expirou
    if (url.includes('login') || url.includes('signin') || url.includes('account-verification')) {
      return false;
    }

    // Heurística: se a página mostra "Entrar" + "Criar conta", não estamos logados
    const bodyText = await page.evaluate(() => document.body.innerText);
    if (bodyText.includes('Entrar') && bodyText.includes('Criar conta')) {
      return false;
    }

    return true;
  } catch (err) {
    console.error('  Erro ao verificar sessão:', (err as Error).message);
    return false;
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  VERIFICAR SESSÃO MERCADO LIVRE');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  // ─── 1ª verificação: headless ───
  console.log('[1/3] A verificar sessão (headless)...');
  const v1 = await abrirBrowser(true);
  const ok = await sessaoValida(v1.page);
  await fecharBrowser(v1.context);

  if (ok) {
    console.log('');
    console.log('✅ SESSÃO VÁLIDA — cookies ainda funcionam');
    console.log('   Não precisas fazer nada.');
    process.exit(0);
  }

  // ─── Sessão expirou: abrir browser visível ───
  console.log('');
  console.log('⚠️  SESSÃO EXPIRADA!');
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  FAZ LOGIN AGORA');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log('  1. Vai abrir o browser');
  console.log('  2. Faz login na tua conta Mercado Livre');
  console.log('  3. Confirma que chegas ao painel de afiliados');
  console.log('  4. Fecha a janela do browser');
  console.log('');
  console.log('  A aguardar que feches a janela...');
  console.log('');

  const v2 = await abrirBrowser(false);
  await v2.page.goto(URL_AFILIADOS, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_PAGINA });

  // Esperar que o utilizador feche o browser
  await new Promise<void>((resolve) => {
    v2.context.on('close', () => resolve());
  });

  // ─── 2ª verificação: confirmar ───
  console.log('');
  console.log('[2/3] Browser fechado. A confirmar sessão...');

  const v3 = await abrirBrowser(true);
  const okFinal = await sessaoValida(v3.page);
  await fecharBrowser(v3.context);

  if (okFinal) {
    console.log('');
    console.log('[3/3] ✅ SESSÃO RENOVADA COM SUCESSO');
    console.log('   Cookies guardados em ./browser-profile/');
    process.exit(0);
  } else {
    console.log('');
    console.log('[3/3] ❌ SESSÃO AINDA INVÁLIDA');
    console.log('   Repete o processo: npx tsx src/jobs/check-cookies.ts');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('ERRO FATAL:', err.message);
  process.exit(1);
});
