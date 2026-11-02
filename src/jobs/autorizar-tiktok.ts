import { env } from '../lib/env.js';
import { trocarCodigoPorToken } from '../services/tiktok.js';
import fs from 'node:fs';

const CLIENT_KEY = env.TIKTOK_CLIENT_KEY;
const REDIRECT_URI = env.TIKTOK_REDIRECT_URI || 'https://spidpost-legal.vercel.app/auth/tiktok/callback';

async function main() {
  const code = process.argv[2];

  if (!code) {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  AUTENTICAÇÃO TIKTOK');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('\n1. Abre este link no teu browser e autoriza a conta:\n');
    
    const url = `https://www.tiktok.com/v2/auth/authorize/?client_key=${CLIENT_KEY}&scope=user.info.basic,video.upload,video.publish&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI as string)}&state=spidpost`;
    console.log(url);
    console.log('\n2. Depois de autorizares, o browser vai redirecionar para uma página.');
    console.log('3. Copia o parâmetro "code" da URL (ex: ...?code=ABC123XYZ...).');
    console.log('4. Corre este script novamente com o código:');
    console.log('   npx tsx src/jobs/autorizar-tiktok.ts "O_TEU_CODE_AQUI"\n');
    return;
  }

  console.log('A trocar o código por token...');
  try {
    const codigoDescodificado = decodeURIComponent(code);
    const tokens = await trocarCodigoPorToken(codigoDescodificado);
    console.log('\n✅ AUTENTICAÇÃO COM SUCESSO!');
    
    let envContent = fs.readFileSync('.env', 'utf8');
    envContent = envContent.replace(/TIKTOK_REFRESH_TOKEN=.*\n?/g, '');
    if (!tokens.refresh_token || tokens.refresh_token === "undefined") { throw new Error("TikTok não devolveu refresh_token"); }
    envContent += `\nTIKTOK_REFRESH_TOKEN=${tokens.refresh_token}\n`;
    fs.writeFileSync('.env', envContent);
    
    console.log('✅ Refresh token guardado no .env');
  } catch (e: any) {
    console.error('\n❌ FALHOU:', e.message);
  }
}

main();
