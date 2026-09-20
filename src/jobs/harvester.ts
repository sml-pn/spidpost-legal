import { getBookmarks, getItem } from '../services/mercadolivre.js';
import { db } from '../lib/db.js';

async function main() {
  console.log('Harvester iniciado...\n');

  const bookmarks = await getBookmarks();
  console.log(`${bookmarks.length} favoritos encontrados\n`);

  let novos = 0;
  let ignorados = 0;
  let falhas = 0;

  for (const bm of bookmarks) {
    try {
      const item = await getItem(bm.item_id);

      const stmt = db.prepare(`
        INSERT INTO products
          (external_id, source, name, price, original_price, thumbnail, affiliate_url)
        VALUES (?, 'mercadolivre', ?, ?, ?, ?, ?)
        ON CONFLICT(external_id) DO NOTHING
      `);

      const info = stmt.run(
        item.id,
        item.title,
        item.price,
        item.original_price ?? null,
        item.thumbnail,
        item.permalink
      );

      if (info.changes > 0) {
        novos++;
        console.log(`  OK  ${item.title} - R$ ${item.price}`);
      } else {
        ignorados++;
        console.log(`  --  ${item.title} (ja existe)`);
      }

      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      falhas++;
      console.error(`  ERRO ${bm.item_id}: ${(err as Error).message}`);
    }
  }

  console.log(`\n${novos} novos | ${ignorados} ja existiam | ${falhas} falhas`);

  const total = db.prepare('SELECT COUNT(*) as c FROM products').get() as { c: number };
  console.log(`Total no banco: ${total.c} produtos`);
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
