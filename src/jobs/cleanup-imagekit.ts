import 'dotenv/config';
import fs from 'node:fs';

const PRIVATE_KEY = process.env.IMAGEKIT_PRIVATE_KEY;
const auth = Buffer.from(`${PRIVATE_KEY}:`).toString('base64');
const headers = { Authorization: `Basic ${auth}`, Accept: 'application/json' };

async function main() {
  console.log('A verificar uso do ImageKit...');
  const usageRes = await fetch(`https://api.imagekit.io/v1/accounts/usage`, { headers });
  const usage = await usageRes.json();
  const usadoBytes = usage.mediaLibraryStorageBytes || 0;
  
  const LIMITE_SEGURO = 2 * 1024 * 1024 * 1024; // 2 GB

  if (usadoBytes < LIMITE_SEGURO) {
    console.log('✅ Armazenamento abaixo de 2GB (', (usadoBytes / 1024 / 1024).toFixed(1), 'MB). Nenhuma limpeza necessária.');
    return;
  }

  console.log('⚠️ Armazenamento acima de 2GB. A limpar os arquivos mais antigos...');
  const filesRes = await fetch(`https://api.imagekit.io/v1/files?limit=1000`, { headers });
  const files = await filesRes.json();
  
  files.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  let bytesAtuais = usadoBytes;
  let deletados = 0;

  for (const file of files) {
    if (bytesAtuais < LIMITE_SEGURO) break;
    if (file.type !== 'file') continue; 
    
    console.log(`  🗑️ Apagando antigo: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
    await fetch(`https://api.imagekit.io/v1/files/${file.fileId}`, { method: 'DELETE', headers });
    bytesAtuais -= file.size;
    deletados++;
  }

  console.log(`\n✅ Limpeza concluída! ${deletados} arquivos antigos apagados para libertar espaço.`);
}
main().catch(console.error);
