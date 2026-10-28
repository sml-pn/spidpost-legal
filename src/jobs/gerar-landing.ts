import fs from 'node:fs';
import path from 'node:path';
import { db } from '../lib/db.js';

const DOCS_DIR = path.join(process.cwd(), 'docs');
const PRODUCTS_JSON = path.join(DOCS_DIR, 'products.json');

async function main() {
  if (!fs.existsSync(DOCS_DIR)) fs.mkdirSync(DOCS_DIR, { recursive: true });

  const produtos = db.prepare(`
    SELECT id, name, price, original_price, thumbnail, affiliate_url, category, last_posted_at
    FROM products
    WHERE status IN ('READY', 'COOLDOWN', 'PENDING')
      AND removed_from_ml = 0
      AND affiliate_url LIKE '%meli.la%'
      AND thumbnail LIKE 'http%'
    ORDER BY COALESCE(last_posted_at, created_at) DESC
    LIMIT 60
  `).all() as any[];

  const enriched = produtos.map((p) => {
    const desconto = p.original_price && p.original_price > p.price
      ? Math.round((1 - p.price / p.original_price) * 100)
      : null;
    return {
      id: p.id,
      name: p.name,
      category: p.category,
      price: p.price,
      original_price: p.original_price,
      desconto,
      preco_fmt: 'R$ ' + p.price.toFixed(2).replace('.', ','),
      original_fmt: p.original_price
        ? 'R$ ' + p.original_price.toFixed(2).replace('.', ',')
        : null,
      thumbnail: p.thumbnail,
      affiliate_url: p.affiliate_url,
    };
  });

  fs.writeFileSync(PRODUCTS_JSON, JSON.stringify({
    updated_at: new Date().toISOString(),
    total: enriched.length,
    produtos: enriched,
  }, null, 2));

  console.log('OK: ' + enriched.length + ' produtos exportados para docs/products.json');
}

main().catch((err) => {
  console.error('ERRO FATAL:', err.message);
  process.exit(1);
});
