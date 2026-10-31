import fs from 'node:fs';
import path from 'node:path';
import { db } from '../lib/db.js';

const DOCS_DIR = path.join(process.cwd(), 'docs');

/** Formata numero como preco BRL: 1961.10 -> "1.961,10" */
function formatPrecoBR(v: number): string {
  const n = Number(v);
  const str = n.toFixed(2);
  const [intPart, decPart] = str.split('.');
  let result = '';
  let count = 0;
  for (let i = intPart.length - 1; i >= 0; i--) {
    result = intPart[i] + result;
    count++;
    if (count === 3 && i > 0) {
      result = '.' + result;
      count = 0;
    }
  }
  return result + ',' + decPart;
}
const PRODUCTS_JSON = path.join(DOCS_DIR, 'products.json');
const INDEX_HTML = path.join(DOCS_DIR, 'index.html');

async function main() {
  if (!fs.existsSync(DOCS_DIR)) fs.mkdirSync(DOCS_DIR, { recursive: true });

  const produtos = db.prepare(`
    SELECT id, name, price, original_price, thumbnail, affiliate_url, category, last_posted_at
    FROM products
    WHERE status IN ('READY', 'COOLDOWN', 'PENDING')
      AND removed_from_ml = 0
      AND (error IS NULL OR error NOT LIKE '%sem_imagem%')
      AND affiliate_url LIKE '%meli.la%'
      AND thumbnail LIKE 'http%'
    ORDER BY COALESCE(last_posted_at, created_at) DESC
    LIMIT 200
  `).all() as any[];

  const enriched = produtos.map((p) => {
    const temDesconto = p.original_price && p.original_price > p.price;
    const desconto = temDesconto ? Math.round((1 - p.price / p.original_price) * 100) : 0;
    return {
      id: p.id,
      name: p.name,
      category: p.category || 'outros',
      price: p.price,
      original_price: temDesconto ? p.original_price : null,
      desconto: desconto,
      preco_fmt: 'R$ ' + formatPrecoBR(p.price),
      original_fmt: temDesconto ? 'R$ ' + formatPrecoBR(p.original_price) : null,
      thumbnail: p.thumbnail,
      affiliate_url: p.affiliate_url,
    };
  });

  fs.writeFileSync(PRODUCTS_JSON, JSON.stringify({
    updated_at: new Date().toISOString(),
    total: enriched.length,
    produtos: enriched,
  }, null, 2));

  const html = gerarHTML(enriched);
  fs.writeFileSync(INDEX_HTML, html, 'utf-8');
  console.log('OK: ' + enriched.length + ' produtos -> docs/products.json + docs/index.html');
}

function gerarHTML(produtos: any[]): string {
  const produtosJSON = JSON.stringify(produtos);
  return HTML_TEMPLATE.replace('__PRODUTOS_JSON__', produtosJSON);
}

const HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Afiliado Oficial | Melhores ofertas do Mercado Livre</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #ebebeb;
    --bg-card: #fff;
    --text: #333;
    --text-soft: #666;
    --text-muted: #999;
    --primary: #3483fa;
    --primary-hover: #2968c8;
    --success: #00a650;
    --dark: #1a1a1a;
    --border: #e0e0e0;
    --shadow-sm: 0 1px 2px rgba(0,0,0,0.06);
    --shadow-md: 0 2px 8px rgba(0,0,0,0.08);
    --shadow-lg: 0 4px 16px rgba(0,0,0,0.12);
    --radius: 8px;
  }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--text); line-height: 1.4; min-height: 100vh; -webkit-font-smoothing: antialiased; }

  .header-main { background: var(--dark); color: #fff; box-shadow: var(--shadow-md);  }
  .header-top { display: flex; align-items: center; justify-content: center; padding: 8px 16px; background: linear-gradient(90deg, #1a1a1a 0%, #2a2a2a 100%); font-size: 12px; color: #d4af37; font-weight: 600; letter-spacing: 0.3px; }
  .header-top::before { content: '★ '; margin-right: 4px; }
  .header-top::after { content: ' ★'; margin-left: 4px; }

  .header-inner { padding: 12px 16px 14px; display: flex; flex-direction: column; gap: 10px; max-width: 1200px; margin: 0 auto; }
  .header-row-1 { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; }
  

  .logo { display: flex; align-items: center; gap: 10px; text-decoration: none; color: #fff; }
  .logo-icon { width: 38px; height: 38px; background: linear-gradient(135deg, #d4af37 0%, #f4d35e 100%); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 900; color: var(--dark); flex-shrink: 0; letter-spacing: -0.5px; box-shadow: 0 2px 6px rgba(212,175,55,0.3); }
  .logo-text { display: flex; flex-direction: column; line-height: 1.1; }
  .logo-name { font-size: 16px; font-weight: 800; letter-spacing: -0.3px; }
  .logo-name span { color: #d4af37; }
  .logo-tag { font-size: 10px; opacity: 0.75; letter-spacing: 0.5px; text-transform: uppercase; }

  .header-links { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .header-links a { color: #fff; text-decoration: none; font-size: 13px; opacity: 0.85; }
  .header-links .ig-btn { background: transparent; padding: 0; display: flex; align-items: center; justify-content: center; color: #fff; opacity: 0.9; transition: opacity 0.2s; }
  .header-links .ig-btn:hover { opacity: 1; }

  .busca { width: 100%; position: relative; }
    .busca { width: 100%; position: relative; }
  .busca input {
    width: 100%;
    height: 48px;
    padding: 12px 16px 12px 44px; /* Espaço à esquerda para o ícone */
    border: 2px solid #d1d5db; /* Borda cinza clara para destacar o campo */
    border-radius: 8px;
    font-size: 16px;
    outline: none;
    background-color: #f9fafb; /* Fundo levemente acinzentado */
    color: var(--text);
    /* Ícone de Lupa em SVG no fundo */
    background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="%239ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>');
    background-repeat: no-repeat;
    background-position: 14px center;
    transition: border-color 0.2s, box-shadow 0.2s, background-color 0.2s;
    cursor: text;
  }
  .busca input:hover {
    border-color: #9ca3af;
  }
  .busca input:focus {
    border-color: var(--primary);
    background-color: #fff;
    box-shadow: 0 0 0 3px rgba(52,131,250,0.2);
  }
  .busca input::placeholder {
    color: #9ca3af;
    font-weight: 400;
  }
  .busca input:focus { box-shadow: 0 0 0 3px rgba(52,131,250,0.25); }
  .busca button { position: absolute; right: 4px; top: 4px; bottom: 4px; width: 36px; background: var(--primary); border: none; border-radius: 4px; color: #fff; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; }

  .hero { background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%); color: #fff; padding: 28px 16px 32px; text-align: center; }
  .hero h1 { font-size: 22px; font-weight: 800; margin-bottom: 8px; letter-spacing: -0.5px; }
  .hero h1 span { color: #d4af37; }
  .hero p { font-size: 14px; opacity: 0.85; max-width: 500px; margin: 0 auto; }

  .controlo-bar {
    background: #fff;
    border-bottom: 1px solid var(--border);
    position: sticky;
    top: 0;
    z-index: 100;
    box-shadow: var(--shadow-sm);
  }
  .controlo-inner { max-width: 1200px; margin: 0 auto; padding: 10px 16px; display: flex; gap: 10px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
  
  /* Layout Mobile: Ações na mesma linha, busca em baixo */
  .sticky-actions { display: flex; gap: 8px; width: 100%; align-items: center; justify-content: space-between; }
  .busca-container { flex: 1 1 100%; display: none; margin-top: 10px; }
  .busca-container.aberto { display: block; animation: slideDown 0.3s ease; }
  
  .mobile-search-btn {
    display: flex;
    background: var(--dark);
    color: #fff;
    border: none;
    border-radius: 6px;
    padding: 9px 12px;
    font-size: 16px;
    cursor: pointer;
    align-items: center;
    justify-content: center;
  }

  /* Desktop: Tudo na mesma linha, busca à esquerda */
  @media (min-width: 768px) {
    .controlo-inner { flex-wrap: nowrap; }
    .sticky-actions { width: auto; flex-shrink: 0; }
    .busca-container { display: block !important; flex: 1; order: -1; margin-right: 10px; margin-top: 0; }
    .mobile-search-btn { display: none !important; }
  }
  
  @keyframes slideDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
  .btn-categorias { display: inline-flex; align-items: center; gap: 8px; padding: 9px 16px; background: var(--dark); color: #fff; border: none; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; }
  .btn-categorias:hover { background: #333; }
  .btn-categorias-ativo { background: var(--primary); }
  .btn-cat-icon { font-size: 16px; }
  .btn-cat-badge { display: inline-block; padding: 1px 7px; background: rgba(255,255,255,0.25); border-radius: 10px; font-size: 11px; font-weight: 700; margin-left: 4px; }
  .btn-cat-clear {
    display: none;
    margin-left: 4px;
    padding: 2px 6px;
    background: rgba(255,255,255,0.2);
    border: none;
    border-radius: 50%;
    color: #fff;
    font-size: 12px;
    line-height: 1;
    cursor: pointer;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
  }
  .btn-categorias-ativo .btn-cat-clear { display: inline-flex; }
  .btn-cat-clear:hover { background: rgba(255,255,255,0.4); }
  .ordenar { padding: 9px 12px; border: 1px solid var(--border); border-radius: 6px; font-size: 13px; background: #fff; color: var(--text); cursor: pointer; outline: none; }

  .drawer-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); opacity: 0; pointer-events: none; transition: opacity 0.25s; z-index: 200; }
  .drawer-overlay.aberto { opacity: 1; pointer-events: auto; }
  .drawer { position: fixed; top: 0; left: 0; bottom: 0; width: 320px; max-width: 85vw; background: #fff; box-shadow: 4px 0 20px rgba(0,0,0,0.2); transform: translateX(-100%); transition: transform 0.3s; z-index: 201; display: flex; flex-direction: column; overflow: hidden; }
  .drawer.aberto { transform: translateX(0); }
  .drawer-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border); background: var(--dark); color: #fff; flex-shrink: 0; }
  .drawer-header h2 { font-size: 16px; font-weight: 700; }
  .drawer-close { width: 32px; height: 32px; border: none; background: rgba(255,255,255,0.15); color: #fff; border-radius: 50%; font-size: 16px; cursor: pointer; }
  .drawer-close:hover { background: rgba(255,255,255,0.3); }
  .drawer-list { list-style: none; overflow-y: auto; flex: 1; padding: 8px 0; }
  .drawer-item { display: flex; align-items: center; gap: 12px; padding: 14px 20px; border: none; background: transparent; width: 100%; text-align: left; font-size: 14px; color: var(--text); cursor: pointer; border-left: 3px solid transparent; }
  .drawer-item:hover { background: #f5f7fa; }
  .drawer-item.ativo { background: #e8f0fe; border-left-color: var(--primary); color: var(--primary); font-weight: 600; }
  .drawer-item-icon { font-size: 18px; width: 24px; text-align: center; flex-shrink: 0; }
  .drawer-item-nome { flex: 1; }
  .drawer-item-count { font-size: 11px; color: var(--text-muted); background: #f0f0f0; padding: 2px 8px; border-radius: 10px; font-weight: 600; }
  .drawer-item.ativo .drawer-item-count { background: rgba(52,131,250,0.15); color: var(--primary); }
  .drawer-footer { padding: 12px 20px; border-top: 1px solid var(--border); background: #fafafa; flex-shrink: 0; }
  .drawer-limpar { width: 100%; padding: 10px; background: #fff; border: 1px solid var(--border); border-radius: 6px; font-size: 13px; font-weight: 600; color: var(--text-soft); cursor: pointer; }
  .drawer-limpar:hover { background: var(--dark); color: #fff; border-color: var(--dark); }

  main { max-width: 1200px; margin: 0 auto; padding: 16px;
    padding-top: 8px; }
  .resultado-info { font-size: 13px; color: var(--text-soft); margin-bottom: 12px; }
  .resultado-info strong { color: var(--text); }

  .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
  @media (min-width: 640px) { .grid { grid-template-columns: repeat(3, 1fr); gap: 14px; } }
  @media (min-width: 900px) { .grid { grid-template-columns: repeat(4, 1fr); gap: 16px; } }
  @media (min-width: 1200px) { .grid { grid-template-columns: repeat(5, 1fr); } }
  
  /* Ajustes do card no mobile */
  @media (max-width: 480px) {
    .card-body { padding: 8px; }
    .card-title { font-size: 12px; min-height: 32px; }
    .card-preco-atual { font-size: 16px; }
    .card-btn { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 8px; background: var(--primary); color: #fff; border-radius: 6px; font-size: 12px; font-weight: 600; text-decoration: none; margin-top: 8px; text-align: center; line-height: 1.2; gap: 2px; }
  .btn-row-1 { display: flex; align-items: center; justify-content: center; gap: 4px; font-weight: 500; }
  .btn-row-1 svg { width: 14px; height: 14px; }
  .btn-row-2 { font-weight: 800; font-size: 13px; }
  .btn-row-1 { display: flex; align-items: center; justify-content: center; gap: 4px; font-weight: 500; }
  .btn-row-1 svg { width: 14px; height: 14px; }
  .btn-row-2 { font-weight: 800; font-size: 13px; }
  }

  .card { background: var(--bg-card); border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow-sm); display: flex; flex-direction: column; transition: transform 0.2s, box-shadow 0.2s; text-decoration: none; color: inherit; border: 1px solid transparent; }
  .card:hover { transform: translateY(-3px); box-shadow: var(--shadow-lg); border-color: var(--primary); }
  .card-img { position: relative; aspect-ratio: 1; background: #fff; overflow: hidden; border-bottom: 1px solid var(--border); }
  .card-img img { width: 100%; height: 100%; object-fit: contain; padding: 8px; transition: transform 0.3s; }
  .card:hover .card-img img { transform: scale(1.05); }
  .card-desconto { position: absolute; top: 8px; left: 8px; background: var(--success); color: #fff; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; z-index: 2; }
  .card-ml-badge { position: absolute; top: 8px; right: 8px; background: rgba(52,131,250,0.95); color: #fff; padding: 3px 7px; border-radius: 4px; font-size: 9px; font-weight: 700; display: flex; align-items: center; gap: 3px; z-index: 2; white-space: nowrap; }
  .card-ml-badge svg { width: 10px; height: 10px; }
  .card-body { padding: 10px; display: flex; flex-direction: column; gap: 6px; flex: 1; }
  .card-title { font-size: 13px; line-height: 1.35; color: var(--text); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 35px; }
  .card:hover .card-title { color: var(--primary); }
  .card-preco { display: flex; flex-direction: column; gap: 1px; margin-top: auto; }
  .card-preco-original { font-size: 11px; color: var(--text-muted); text-decoration: line-through; }
  .card-preco-atual { font-size: 18px; font-weight: 700; color: var(--text); }
  .card-preco-atual .cents { font-size: 13px; }
  .card-frete { font-size: 11px; color: var(--success); font-weight: 600; margin-top: 2px; }
  .card-btn { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; padding: 9px; background: var(--primary); color: #fff; border-radius: 6px; font-size: 12px; font-weight: 600; text-decoration: none; margin-top: 8px; text-align: center; line-height: 1.2; }
  .card-btn svg { width: 16px; height: 16px; margin-bottom: 2px; }
  .card-btn svg { width: 14px; height: 14px; flex-shrink: 0; }
  .card:hover .card-btn { background: var(--primary-hover); }

  .estado { text-align: center; padding: 80px 20px; grid-column: 1 / -1; background: #fff; border-radius: var(--radius); color: var(--text-soft); }
  .estado-icon { font-size: 48px; margin-bottom: 16px; opacity: 0.4; }
  .estado strong { display: block; font-size: 18px; margin-bottom: 8px; color: var(--text); }

  footer { background: var(--dark); color: #999; padding: 32px 16px 24px; text-align: center; font-size: 12px; margin-top: 40px; }
  footer p { margin: 6px 0; }
  footer a { color: #d4af37; text-decoration: none; }
  footer .footer-brand { font-size: 15px; font-weight: 700; color: #fff; margin-bottom: 12px; }
  footer .footer-brand span { color: #d4af37; }
</style>
</head>
<body>

<header class="header-main">
  <div class="header-top">AFILIADO OFICIAL · OFERTAS VERIFICADAS DIARIAMENTE</div>
  <div class="header-inner">
    <div class="header-row-1">
      <a class="logo" href="./">
        <div class="logo-icon">AO</div>
        <div class="logo-text">
          <span class="logo-name">Afiliado <span>Oficial</span></span>
          <span class="logo-tag">Ofertas reais</span>
        </div>
      </a>
      <div class="header-links">
        <a href="https://www.instagram.com/idealegenial/" target="_blank" rel="noopener" class="ig-btn" aria-label="Instagram">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:24px; height:24px;"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
        </a>
      </div>
    </div>

  </div>
</header>

<section class="hero">
  <h1>As melhores <span>ofertas</span> do Mercado Livre</h1>
  <p>Só produtos que valem a pena. Descontos verificados, sem enrolação.</p>
</section>

<div class="controlo-bar">
  <div class="controlo-inner">
    <div class="busca">
      <input type="text" id="busca" placeholder="O que você procura hoje?">
      
    </div>
    <button class="btn-categorias" id="btn-categorias" type="button">
      <span class="btn-cat-icon">☰</span>
      <span id="btn-cat-label">Categorias</span>
      <span class="btn-cat-clear" id="btn-cat-clear" role="button" tabindex="-1" aria-label="Limpar">✕</span>
    </button>
    <select class="ordenar" id="ordenar">
      <option value="recente">Mais recentes</option>
      <option value="menor-preco">Menor preço</option>
      <option value="maior-desconto">Maior desconto</option>
      <option value="a-z">Nome (A-Z)</option>
    </select>
  </div>
</div>

<div class="drawer-overlay" id="drawer-overlay"></div>
<aside class="drawer" id="drawer">
  <div class="drawer-header">
    <h2>Categorias</h2>
    <button class="drawer-close" id="drawer-close" type="button" aria-label="Fechar">✕</button>
  </div>
  <ul class="drawer-list" id="drawer-list"></ul>
  <div class="drawer-footer">
    <button class="drawer-limpar" id="drawer-limpar" type="button">Ver todas as categorias</button>
  </div>
</aside>

<main>
  <div class="resultado-info"><span id="info-resultado">Carregando...</span></div>
  <div class="grid" id="grid">
    <div class="estado"><div class="estado-icon">⏳</div><strong>Carregando produtos...</strong></div>
  </div>
</main>

<footer>
  <div class="footer-brand">Afiliado <span>Oficial</span></div>
  <p>Afiliado oficial do Mercado Livre · Ofertas verificadas</p>
  <p><a href="https://www.instagram.com/idealegenial/" target="_blank" rel="noopener">Siga no Instagram @idealegenial</a></p>
</footer>

<script>
var PRODUTOS = __PRODUTOS_JSON__;

var CAT_NOMES = { casa: 'Casa', eletronicos: 'Eletrônicos', moda: 'Moda', beleza: 'Beleza', esporte: 'Esporte', ferramentas: 'Ferramentas', brinquedos: 'Brinquedos', automotivo: 'Automotivo', pet: 'Pet', outros: 'Outros' };
var CAT_ICONS = { casa: '🏠', eletronicos: '📱', moda: '👕', beleza: '💄', esporte: '⚽', ferramentas: '🔧', brinquedos: '🎮', automotivo: '🚗', pet: '🐾', outros: '🎁' };

var catAtiva = 'todas';
var termoBusca = '';
var ordenacao = 'recente';

function init() {
  gerarDrawerCategorias();
  atualizarBtnCategorias();
  configurarEventos();
  renderizar();
}

function gerarDrawerCategorias() {
  var cats = {};
  PRODUTOS.forEach(function(p) {
    cats[p.category] = (cats[p.category] || 0) + 1;
  });
  var list = document.getElementById('drawer-list');
  list.innerHTML = '';

  var liTodas = document.createElement('li');
  liTodas.innerHTML = '<button class="drawer-item ativo" data-cat="todas" type="button"><span class="drawer-item-icon">🎁</span><span class="drawer-item-nome">Todas as categorias</span><span class="drawer-item-count">' + PRODUTOS.length + '</span></button>';
  list.appendChild(liTodas);

  var ordem = Object.keys(cats).sort(function(a, b) { return cats[b] - cats[a]; });
  ordem.forEach(function(cat) {
    var li = document.createElement('li');
    li.innerHTML = '<button class="drawer-item" data-cat="' + cat + '" type="button"><span class="drawer-item-icon">' + (CAT_ICONS[cat] || '📦') + '</span><span class="drawer-item-nome">' + (CAT_NOMES[cat] || cat) + '</span><span class="drawer-item-count">' + cats[cat] + '</span></button>';
    list.appendChild(li);
  });

  list.querySelectorAll('.drawer-item').forEach(function(btn) {
    btn.addEventListener('click', function() {
      list.querySelectorAll('.drawer-item').forEach(function(b) { b.classList.remove('ativo'); });
      btn.classList.add('ativo');
      catAtiva = btn.dataset.cat;
      atualizarBtnCategorias();
      renderizar();
      fecharDrawer();
    });
  });
}

function atualizarBtnCategorias() {
  var btn = document.getElementById('btn-categorias');
  var label = document.getElementById('btn-cat-label');
  if (catAtiva === 'todas') {
    btn.classList.remove('btn-categorias-ativo');
    label.textContent = 'Categorias';
  } else {
    btn.classList.add('btn-categorias-ativo');
    var nome = CAT_NOMES[catAtiva] || catAtiva;
    var count = PRODUTOS.filter(function(p) { return p.category === catAtiva; }).length;
    label.innerHTML = nome + ' <span class="btn-cat-badge">' + count + '</span>';
  }
}

function abrirDrawer() {
  document.getElementById('drawer').classList.add('aberto');
  document.getElementById('drawer-overlay').classList.add('aberto');
  document.body.style.overflow = 'hidden';
}

function fecharDrawer() {
  document.getElementById('drawer').classList.remove('aberto');
  document.getElementById('drawer-overlay').classList.remove('aberto');
  document.body.style.overflow = '';
}

function configurarEventos() {
  // Lógica da Lupa Mobile (dentro da barra sticky)
  var btnLupa = document.getElementById('mobile-search-btn');
  var buscaContainer = document.getElementById('busca-container');
  var inputBusca = document.getElementById('busca');
  
  if (btnLupa && buscaContainer) {
    btnLupa.addEventListener('click', function() {
      var estaAberto = buscaContainer.classList.contains('aberto');
      if (estaAberto) {
        buscaContainer.classList.remove('aberto');
        btnLupa.textContent = '🔍';
      } else {
        buscaContainer.classList.add('aberto');
        btnLupa.textContent = '✕';
        setTimeout(function() { inputBusca.focus(); }, 100);
      }
    });
  }
  document.getElementById('btn-categorias').addEventListener('click', function(e) {
    if (e.target.id === 'btn-cat-clear') return;
    abrirDrawer();
  });
  document.getElementById('drawer-close').addEventListener('click', fecharDrawer);
  document.getElementById('drawer-overlay').addEventListener('click', fecharDrawer);
  document.addEventListener('keydown', function(e) { if (e.key === 'Escape') fecharDrawer(); });

  document.getElementById('drawer-limpar').addEventListener('click', function() {
    catAtiva = 'todas';
    document.querySelectorAll('.drawer-item').forEach(function(b) { b.classList.toggle('ativo', b.dataset.cat === 'todas'); });
    atualizarBtnCategorias();
    renderizar();
    fecharDrawer();
  });

  document.getElementById('btn-cat-clear').addEventListener('click', function(e) {
    e.stopPropagation();
    catAtiva = 'todas';
    document.querySelectorAll('.drawer-item').forEach(function(b) { b.classList.toggle('ativo', b.dataset.cat === 'todas'); });
    atualizarBtnCategorias();
    renderizar();
  });

  document.getElementById('ordenar').addEventListener('change', function(e) {
    ordenacao = e.target.value;
    renderizar();
  });

  var timer;
  document.getElementById('busca').addEventListener('input', function(e) {
    clearTimeout(timer);
    timer = setTimeout(function() {
      termoBusca = e.target.value.toLowerCase().trim();
      renderizar();
    }, 250);
  });
}

function filtrar() {
  var lista = PRODUTOS.slice();
  if (catAtiva !== 'todas') lista = lista.filter(function(p) { return p.category === catAtiva; });
  if (termoBusca) lista = lista.filter(function(p) { return p.name.toLowerCase().indexOf(termoBusca) !== -1; });
  if (ordenacao === 'menor-preco') lista.sort(function(a, b) { return a.price - b.price; });
  else if (ordenacao === 'maior-desconto') lista.sort(function(a, b) { return b.desconto - a.desconto; });
  else if (ordenacao === 'a-z') lista.sort(function(a, b) { return a.name.localeCompare(b.name); });
  return lista;
}

function escapar(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatarPreco(p) {
    var str = Number(p).toFixed(2);
    var partes = str.split('.');
    var intPart = partes[0];
    var result = '';
    var count = 0;
    for (var i = intPart.length - 1; i >= 0; i--) {
      result = intPart[i] + result;
      count++;
      if (count === 3 && i > 0) {
        result = '.' + result;
        count = 0;
      }
    }
    return { int: result, cents: partes[1] };
  }

function renderizar() {
  var lista = filtrar();
  var grid = document.getElementById('grid');
  var info = document.getElementById('info-resultado');

  if (lista.length === 0) {
    grid.innerHTML = '<div class="estado"><div class="estado-icon">🔍</div><strong>Nenhum produto encontrado</strong><p>Tente outra categoria ou termo.</p></div>';
    info.textContent = 'Nenhum resultado';
    return;
  }

  info.innerHTML = '<span><strong>' + lista.length + '</strong> produto' + (lista.length !== 1 ? 's' : '') + ' encontrado' + (lista.length !== 1 ? 's' : '') + '</span>';

  var cartIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>';
  var checkIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

  grid.innerHTML = lista.map(function(p) {
    var pp = formatarPreco(p.price);
    var descBadge = p.desconto > 0 ? '<span class="card-desconto">-' + p.desconto + '% OFF</span>' : '';
    var mlBadge = '<span class="card-ml-badge">' + checkIcon + 'Mercado Livre</span>';
    var orig = p.original_fmt ? '<span class="card-preco-original">' + p.original_fmt + '</span>' : '';
    var frete = p.desconto >= 20 ? '<span class="card-frete">🚚 Oferta quente</span>' : '';

    return '<a class="card" href="' + escapar(p.affiliate_url) + '" target="_blank" rel="noopener sponsored">' +
      '<div class="card-img">' +
        '<img src="' + escapar(p.thumbnail) + '" alt="' + escapar(p.name) + '" loading="lazy">' +
        descBadge + mlBadge +
      '</div>' +
      '<div class="card-body">' +
        '<div class="card-title">' + escapar(p.name) + '</div>' +
        '<div class="card-preco">' + orig +
          '<span class="card-preco-atual">R$ ' + pp.int + '<span class="cents">,' + pp.cents + '</span></span>' +
          frete +
        '</div>' +
        '<span class="card-btn">' +
        '<span class="btn-row-1">' + cartIcon + '<span>Ver no</span></span>' +
        '<span class="btn-row-2">Mercado Livre</span>' +
      '</span>' +
      '</div>' +
    '</a>';
  }).join('');
}

init();
</script>
</body>
</html>`;

main().catch(function(err) {
  console.error('ERRO FATAL:', err.message);
  process.exit(1);
});
