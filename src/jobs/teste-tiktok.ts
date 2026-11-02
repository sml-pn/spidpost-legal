import { env } from '../lib/env.js';
import { renovarToken, enviarParaRascunho, verificarStatus } from '../services/tiktok.js';
import fs from 'node:fs';
import path from 'node:path';

const REFRESH_TOKEN = env.TIKTOK_REFRESH_TOKEN;

if (!REFRESH_TOKEN) {
  console.error('❌ TIKTOK_REFRESH_TOKEN não encontrado no .env');
  process.exit(1);
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  TESTE DE PUBLICAÇÃO NO TIKTOK (SANDBOX)');
  console.log('═══════════════════════════════════════════════════════════');

  // 1. Procurar um vídeo na pasta renders/reels
  const reelsDir = path.join(process.cwd(), 'renders', 'reels');
  if (!fs.existsSync(reelsDir)) {
    console.error('❌ Pasta renders/reels não existe. Corre "npm run render" primeiro.');
    process.exit(1);
  }

  const ficheiros = fs.readdirSync(reelsDir).filter(f => f.endsWith('.mp4'));
  if (ficheiros.length === 0) {
    console.error('❌ Nenhum vídeo MP4 na pasta renders/reels. Corre "npm run render" primeiro.');
    process.exit(1);
  }

  const videoPath = path.join(reelsDir, ficheiros[0]);
  console.log(`\n📁 Vídeo escolhido: ${ficheiros[0]}`);

  // 2. Renovar o access_token
  console.log('\n🔄 A renovar o access_token...');
  const tokens = await renovarToken(REFRESH_TOKEN);
  console.log(`✅ Token renovado! Expira em ${tokens.expires_in}s`);

  // 3. Publicar o vídeo
  console.log('\n📤 A publicar o vídeo no TikTok...');
  try {
    const publishId = await enviarParaRascunho({
      accessToken: tokens.access_token,
      videoPath,
        });

    console.log(`✅ Vídeo enviado! publish_id: ${publishId}`);

    // 4. Verificar o status
    console.log('\n⏳ A verificar o status da publicação...');
    for (let i = 0; i < 5; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const status = await verificarStatus(tokens.access_token, publishId);
      console.log(`  Tentativa ${i + 1}: ${status}`);
      if (status === 'PUBLISH_COMPLETE' || status === 'FAILED') break;
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  ✅ TESTE CONCLUÍDO! Vai ao teu TikTok e verifica se o vídeo aparece como privado.');
    console.log('═══════════════════════════════════════════════════════════');

  } catch (e: any) {
    console.error('\n❌ ERRO:', e.message);
  }
}

main();
