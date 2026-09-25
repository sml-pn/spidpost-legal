import fs from 'node:fs';
import path from 'node:path';

const ENV_PATH = path.join(process.cwd(), '.env');

async function refreshMLToken() {
  console.log('Renovando token do Mercado Livre...');

  const envContent = fs.readFileSync(ENV_PATH, 'utf-8');
  const getEnv = (key: string) => {
    const match = envContent.match(new RegExp(`^${key}=(.+)$`, 'm'));
    return match ? match[1].trim() : '';
  };

  const clientId = getEnv('ML_CLIENT_ID');
  const clientSecret = getEnv('ML_CLIENT_SECRET');
  const refreshToken = getEnv('ML_REFRESH_TOKEN');

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Credenciais ML faltando no .env');
  }

  const res = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    throw new Error(`Refresh falhou: HTTP ${res.status} - ${await res.text()}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  let newEnv = envContent
    .replace(/^ML_ACCESS_TOKEN=.*$/m, `ML_ACCESS_TOKEN=${data.access_token}`)
    .replace(/^ML_REFRESH_TOKEN=.*$/m, `ML_REFRESH_TOKEN=${data.refresh_token}`);

  fs.writeFileSync(ENV_PATH, newEnv, 'utf-8');

  console.log(`OK - Token renovado (expira em ${data.expires_in / 3600}h)`);
  console.log(`    Novo access: ${data.access_token.slice(0, 30)}...`);
  console.log(`    Novo refresh: ${data.refresh_token.slice(0, 30)}...`);
}

refreshMLToken().catch((err) => {
  console.error('Erro:', err.message);
  process.exit(1);
});
