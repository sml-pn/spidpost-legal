import fs from 'node:fs';
import path from 'node:path';
import { db } from '../lib/db.js';

const DOCS_DIR = path.join(process.cwd(), 'docs');
const PRODUCTS_JSON = path.join(DOCS_DIR, 'products.json');
const INDEX_HTML = path.join(DOCS_DIR, 'index.html');

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
    LIMIT 200
  `).all() as any[];

  const enriched = produtos.map((p) => {
    const desconto = p.original_price && p.original_price > p.price
      ? Math.round((1 - p.price / p.original_price) * 100)
      : 0;
    return {
      id: p.id,
      name: p.name,
      category: p.category || 'outros',
      price: p.price,
      original_price: p.original_price || null,
      desconto,
      preco_fmt: 'R$ ' + p.price.toFixed(2).replace('.', ','),
      original_fmt: p.original_price
        ? 'R$ ' + p.original_price.toFixed(2).replace('.', ',')
        : null,
      thumbnail: p.thumbnail,
      affiliate_url: p.affiliate_url,
    };
  });

  // 1. Guardar JSON (para uso futuro / API)
  const payload = {
    updated_at: new Date().toISOString(),
    total: enriched.length,
    produtos: enriched,
  };
  fs.writeFileSync(PRODUCTS_JSON, JSON.stringify(payload, null, 2));

  // 2. Gerar HTML com produtos embutidos (funciona em file:// e GitHub Pages)
  const html = gerarHTML(enriched);
  fs.writeFileSync(INDEX_HTML, html, 'utf-8');

  console.log('OK: ' + enriched.length + ' produtos -> docs/products.json + docs/index.html');
}

function gerarHTML(produtos: any[]): string {
  const produtosJSON = JSON.stringify(produtos);
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Ideal & Genial — Afiliado Oficial | Melhores ofertas do Mercado Livre</title>
<meta name="description" content="Curadoria diária de produtos com desconto real no Mercado Livre. Ofertas verificadas.">
<meta property="og:title" content="Ideal & Genial — Afiliado Oficial">
<meta property="og:description" content="Curadoria diária das melhores ofertas do Mercado Livre">
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
    --accent: #ffe600;
    --success: #00a650;
    --danger: #e74c3c;
    --dark: #1a1a1a;
    --border: #e0e0e0;
    --shadow-sm: 0 1px 2px rgba(0,0,0,0.06);
    --shadow-md: 0 2px 8px rgba(0,0,0,0.08);
    --shadow-lg: 0 4px 16px rgba(0,0,0,0.12);
    --radius: 8px;
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.4;
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
  }

  /* HEADER */
  .header-main {
    background: var(--dark);
    color: #fff;
    padding: 0;
    box-shadow: var(--shadow-md);
    position: sticky;
    top: 0;
    z-index: 100;
  }
  .header-top {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px 16px;
    background: linear-gradient(90deg, #1a1a1a 0%, #2a2a2a 100%);
    font-size: 12px;
    color: #d4af37;
    font-weight: 600;
    letter-spacing: 0.3px;
  }
  .header-top::before { content: '★ '; margin-right: 4px; }
  .header-top::after { content: ' ★'; margin-left: 4px; }

  .header-inner {
    padding: 12px 16px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-width: 1200px;
    margin: 0 auto;
  }
  /* Linha 1: logo (esquerda) + Instagram (direita) */
  .header-row-1 {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
  }
  /* Linha 2: busca ocupa largura toda */
  .header-row-2 {
    width: 100%;
  }
  @media (min-width: 768px) {
    .header-inner { padding: 14px 24px 16px; }
  }

  .logo { display: flex; align-items: center; gap: 10px; text-decoration: none; color: #fff; }
  .logo-icon {
    width: 38px;
    height: 38px;
    background: linear-gradient(135deg, #d4af37 0%, #f4d35e 100%);
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    font-weight: 900;
    letter-spacing: -0.5px;
    color: var(--dark);
    flex-shrink: 0;
    box-shadow: 0 2px 6px rgba(212,175,55,0.3);
  }
  .logo-text { display: flex; flex-direction: column; line-height: 1.1; }
  .logo-name { font-size: 17px; font-weight: 800; letter-spacing: -0.3px; }
  .logo-name span { color: #d4af37; }
  .logo-tag { font-size: 10px; opacity: 0.7; letter-spacing: 0.5px; text-transform: uppercase; }

  .busca {
    width: 100%;
    position: relative;
  }
  .busca input {
    width: 100%;
    padding: 11px 44px 11px 16px;
    border: none;
    border-radius: 6px;
    font-size: 15px;
    outline: none;
    background: #fff;
    color: var(--text);
    transition: box-shadow 0.2s;
  }
  .busca input:focus { box-shadow: 0 0 0 3px rgba(52,131,250,0.25); }
  .busca button {
    position: absolute;
    right: 4px;
    top: 4px;
    bottom: 4px;
    width: 36px;
    background: var(--primary);
    border: none;
    border-radius: 4px;
    color: #fff;
    font-size: 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
  }
  .busca button:hover { background: var(--primary-hover); }

  .header-links { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .header-links a {
    color: #fff;
    text-decoration: none;
    font-size: 13px;
    opacity: 0.85;
    display: flex;
    align-items: center;
    gap: 4px;
    transition: opacity 0.2s;
  }
  .header-links a:hover { opacity: 1; }
  .header-links .ig-btn {
    padding: 8px 14px;
    background: linear-gradient(135deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%);
    border-radius: 6px;
    opacity: 1;
    font-weight: 600;
    white-space: nowrap;
  }

  /* HERO */
  .hero {
    background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%);
    color: #fff;
    padding: 24px 16px 32px;
    text-align: center;
  }
  .hero h1 {
    font-size: 22px;
    font-weight: 800;
    margin-bottom: 8px;
    letter-spacing: -0.5px;
  }
  .hero h1 span { color: #d4af37; }
  .hero p { font-size: 14px; opacity: 0.85; max-width: 500px; margin: 0 auto; }
  .hero-stats {
    display: flex;
    justify-content: center;
    gap: 24px;
    margin-top: 18px;
    flex-wrap: wrap;
  }
  .stat { display: flex; flex-direction: column; align-items: center; }
  .stat-num { font-size: 22px; font-weight: 800; color: #d4af37; }
  .stat-label { font-size: 11px; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; }

  /* BARRA DE CONTROLO (botão categorias + ordenar) */
  .controlo-bar {
    background: #fff;
    border-bottom: 1px solid var(--border);
    position: sticky;
    top: 118px;
    z-index: 50;
    box-shadow: var(--shadow-sm);
  }
  @media (min-width: 768px) { .controlo-bar { top: 124px; } }
  .controlo-inner {
    max-width: 1200px;
    margin: 0 auto;
    padding: 10px 16px;
    display: flex;
    gap: 10px;
    align-items: center;
    justify-content: space-between;
  }

  .btn-categorias {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 9px 16px;
    background: var(--dark);
    color: #fff;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, transform 0.15s;
    white-space: nowrap;
  }
  .btn-categorias:hover { background: #333; transform: translateY(-1px); }
  .btn-categorias-ativo {
    background: var(--primary);
  }
  .btn-categorias-ativo:hover { background: var(--primary-hover); }
  .btn-cat-icon { font-size: 16px; line-height: 1; }
  .btn-cat-badge {
    display: inline-block;
    padding: 1px 7px;
    background: rgba(255,255,255,0.25);
    border-radius: 10px;
    font-size: 11px;
    font-weight: 700;
    margin-left: 4px;
  }
  .btn-cat-clear {
    display: none;
    margin-left: 4px;
    padding: 0 4px;
    background: transparent;
    border: none;
    color: #fff;
    font-size: 14px;
    cursor: pointer;
    line-height: 1;
  }
  .btn-categorias-ativo .btn-cat-clear { display: inline; }

  .ordenar {
    flex-shrink: 0;
    padding: 9px 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 13px;
    background: #fff;
    color: var(--text);
    cursor: pointer;
    outline: none;
    transition: border-color 0.15s;
  }
  .ordenar:hover { border-color: var(--primary); }
  .ordenar:focus { border-color: var(--primary); box-shadow: 0 0 0 2px rgba(52,131,250,0.15); }

  /* DRAWER LATERAL DE CATEGORIAS */
  .drawer-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.25s ease;
    z-index: 200;
    backdrop-filter: blur(2px);
  }
  .drawer-overlay.aberto {
    opacity: 1;
    pointer-events: auto;
  }

  .drawer {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: 320px;
    max-width: 85vw;
    background: #fff;
    box-shadow: 4px 0 20px rgba(0,0,0,0.2);
    transform: translateX(-100%);
    transition: transform 0.3s cubic-bezier(0.4,0,0.2,1);
    z-index: 201;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .drawer.aberto { transform: translateX(0); }

  .drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
    background: var(--dark);
    color: #fff;
    flex-shrink: 0;
  }
  .drawer-header h2 {
    font-size: 16px;
    font-weight: 700;
    letter-spacing: -0.3px;
  }
  .drawer-close {
    width: 32px;
    height: 32px;
    border: none;
    background: rgba(255,255,255,0.15);
    color: #fff;
    border-radius: 50%;
    font-size: 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s, transform 0.15s;
  }
  .drawer-close:hover { background: rgba(255,255,255,0.3); transform: rotate(90deg); }

  .drawer-list {
    list-style: none;
    overflow-y: auto;
    flex: 1;
    padding: 8px 0;
  }
  .drawer-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 20px;
    border: none;
    background: transparent;
    width: 100%;
    text-align: left;
    font-size: 14px;
    color: var(--text);
    cursor: pointer;
    transition: background 0.15s, padding-left 0.15s;
    border-left: 3px solid transparent;
    opacity: 0;
    transform: translateX(-20px);
  }
  .drawer.aberto .drawer-item {
    animation: slideIn 0.3s ease forwards;
  }
  @keyframes slideIn {
    to { opacity: 1; transform: translateX(0); }
  }
  .drawer-item:hover {
    background: #f5f7fa;
    padding-left: 24px;
  }
  .drawer-item.ativo {
    background: #e8f0fe;
    border-left-color: var(--primary);
    color: var(--primary);
    font-weight: 600;
    padding-left: 24px;
  }
  .drawer-item-icon {
    font-size: 18px;
    width: 24px;
    text-align: center;
    flex-shrink: 0;
  }
  .drawer-item-nome { flex: 1; }
  .drawer-item-count {
    font-size: 11px;
    color: var(--text-muted);
    background: #f0f0f0;
    padding: 2px 8px;
    border-radius: 10px;
    font-weight: 600;
  }
  .drawer-item.ativo .drawer-item-count {
    background: rgba(52,131,250,0.15);
    color: var(--primary);
  }
  .drawer-footer {
    padding: 12px 20px;
    border-top: 1px solid var(--border);
    background: #fafafa;
    flex-shrink: 0;
  }
  .drawer-limpar {
    width: 100%;
    padding: 10px;
    background: #fff;
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-soft);
    cursor: pointer;
    transition: all 0.15s;
  }
  .drawer-limpar:hover { background: var(--dark); color: #fff; border-color: var(--dark); }

  /* MAIN */
  main {
    max-width: 1200px;
    margin: 0 auto;
    padding: 16px;
  }
  @media (min-width: 768px) { main { padding: 24px; } }

  .resultado-info {
    font-size: 13px;
    color: var(--text-soft);
    margin-bottom: 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }
  .resultado-info strong { color: var(--text); }

  /* GRID */
  .grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }
  @media (min-width: 640px) { .grid { grid-template-columns: repeat(3, 1fr); gap: 14px; } }
  @media (min-width: 900px) { .grid { grid-template-columns: repeat(4, 1fr); } }
  @media (min-width: 1200px) { .grid { grid-template-columns: repeat(5, 1fr); } }

  /* CARD */
  .card {
    background: var(--bg-card);
    border-radius: var(--radius);
    overflow: hidden;
    box-shadow: var(--shadow-sm);
    display: flex;
    flex-direction: column;
    transition: transform 0.2s, box-shadow 0.2s;
    text-decoration: none;
    color: inherit;
    border: 1px solid transparent;
  }
  .card:hover {
    transform: translateY(-3px);
    box-shadow: var(--shadow-lg);
    border-color: var(--primary);
  }
  .card-img {
    position: relative;
    aspect-ratio: 1;
    background: #fff;
    overflow: hidden;
    border-bottom: 1px solid var(--border);
  }
  .card-img img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    padding: 8px;
    transition: transform 0.3s;
  }
  .card:hover .card-img img { transform: scale(1.05); }
  .card-desconto {
    position: absolute;
    top: 8px;
    left: 8px;
    background: var(--success);
    color: #fff;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.2px;
  }
  .card-body {
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1;
  }
  .card-title {
    font-size: 13px;
    font-weight: 400;
    line-height: 1.35;
    color: var(--text);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    min-height: 35px;
    transition: color 0.15s;
  }
  .card:hover .card-title { color: var(--primary); }
  .card-preco {
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin-top: auto;
  }
  .card-preco-original {
    font-size: 11px;
    color: var(--text-muted);
    text-decoration: line-through;
  }
  .card-preco-atual {
    font-size: 18px;
    font-weight: 700;
    color: var(--text);
    letter-spacing: -0.3px;
  }
  .card-preco-atual .cents { font-size: 13px; vertical-align: baseline; }
  .card-frete {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 11px;
    color: var(--success);
    font-weight: 600;
    margin-top: 2px;
  }
  .card-btn {
    display: block;
    text-align: center;
    padding: 9px;
    background: var(--primary);
    color: #fff;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    text-decoration: none;
    margin-top: 8px;
    transition: background 0.15s;
  }
  .card:hover .card-btn { background: var(--primary-hover); }

  /* ESTADO VAZIO */
  .estado {
    text-align: center;
    padding: 80px 20px;
    grid-column: 1 / -1;
    background: #fff;
    border-radius: var(--radius);
    color: var(--text-soft);
  }
  .estado-icon { font-size: 48px; margin-bottom: 16px; opacity: 0.4; }
  .estado strong { display: block; font-size: 18px; margin-bottom: 8px; color: var(--text); }
  .estado p { font-size: 14px; }

  /* FOOTER */
  footer {
    background: var(--dark);
    color: #999;
    padding: 32px 16px 24px;
    text-align: center;
    font-size: 12px;
    margin-top: 40px;
  }
  footer p { margin: 6px 0; line-height: 1.5; }
  footer a { color: #d4af37; text-decoration: none; }
  footer a:hover { text-decoration: underline; }
  footer .footer-brand {
    font-size: 15px;
    font-weight: 700;
    color: #fff;
    margin-bottom: 12px;
  }
  footer .footer-brand span { color: #d4af37; }
  footer .footer-disclaimer {
    max-width: 500px;
    margin: 12px auto 0;
    opacity: 0.7;
    font-size: 11px;
  }
</style>
</head>
<body>

<header class="header-main">
  <div class="header-top">AFILIADO OFICIAL · OFERTAS VERIFICADAS DIARIAMENTE</div>
  <div class="header-inner">
    <div class="header-row-1">
      <a class="logo" href="./">
        <div class="logo-icon">IG</div>
        <div class="logo-text">
          <span class="logo-name">Ideal <span>&</span> Genial</span>
          <span class="logo-tag">Afiliado Oficial</span>
        </div>
      </a>
      <div class="header-links">
        <a href="https://www.instagram.com/idealegenial/" target="_blank" rel="noopener" class="ig-btn">📸 Instagram</a>
      </div>
    </div>
    <div class="header-row-2">
      <div class="busca">
        <input type="text" id="busca" placeholder="O que você procura hoje?">
        <button type="button" aria-label="Buscar">🔍</button>
      </div>
    </div>
  </div>
</header>

<section class="hero">
  <h1>As melhores <span>ofertas</span> do Mercado Livre</h1>
  <p>Só produtos que valem a pena. Descontos verificados, sem enrolação.</p>
  <div class="hero-stats">
    <div class="stat"><span class="stat-num" id="stat-total">0</span><span class="stat-label">Produtos</span></div>
    <div class="stat"><span class="stat-num" id="stat-cats">0</span><span class="stat-label">Categorias</span></div>
    <div class="stat"><span class="stat-num" id="stat-desc">0</span><span class="stat-label">Com desconto</span></div>
  </div>
</section>

<div class="controlo-bar">
  <div class="controlo-inner">
    <button class="btn-categorias" id="btn-categorias" type="button">
      <span class="btn-cat-icon">☰</span>
      <span id="btn-cat-label">Categorias</span>
      <button class="btn-cat-clear" id="btn-cat-clear" type="button" aria-label="Limpar">✕</button>
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
  <ul class="drawer-list" id="drawer-list">
    <!-- Preenchido via JS -->
  </ul>
  <div class="drawer-footer">
    <button class="drawer-limpar" id="drawer-limpar" type="button">Ver todas as categorias</button>
  </div>
</aside>

<main>
  <div class="resultado-info">
    <span id="info-resultado">Carregando...</span>
  </div>
  <div class="grid" id="grid">
    <div class="estado">
      <div class="estado-icon">⏳</div>
      <strong>Carregando produtos...</strong>
    </div>
  </div>
</main>

<footer>
  <div class="footer-brand">Ideal <span>&</span> Genial</div>
  <p>Afiliado oficial do Mercado Livre · Ofertas verificadas</p>
  <p><a href="https://www.instagram.com/idealegenial/" target="_blank" rel="noopener">Siga no Instagram @idealegenial</a></p>
</footer>

<script>
const PRODUTOS = ${produtosJSON};

const CAT_NOMES = {
  casa: 'Casa',
  eletronicos: 'Eletrônicos',
  moda: 'Moda',
  beleza: 'Beleza',
  esporte: 'Esporte',
  ferramentas: 'Ferramentas',
  brinquedos: 'Brinquedos',
  automotivo: 'Automotivo',
  pet: 'Pet',
  outros: 'Outros'
};

const CAT_ICONS = {
  casa: '🏠',
  eletronicos: '📱',
  moda: '👕',
  beleza: '💄',
  esporte: '⚽',
  ferramentas: '🔧',
  brinquedos: '🎮',
  automotivo: '🚗',
  pet: '🐾',
  outros: '🎁'
};

let catAtiva = 'todas';
let termoBusca = '';
let ordenacao = 'recente';

function init() {
  document.getElementById('stat-total').textContent = PRODUTOS.length;
  const cats = new Set(PRODUTOS.map(function(p) { return p.category; }));
  document.getElementById('stat-cats').textContent = cats.size;
  document.getElementById('stat-desc').textContent = PRODUTOS.filter(function(p) { return p.desconto > 0; }).length;

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

  var drawerList = document.getElementById('drawer-list');
  drawerList.innerHTML = '';

  // Item "Todas" no topo
  var itemTodas = document.createElement('li');
  itemTodas.innerHTML =
    '<button class="drawer-item ativo" data-cat="todas" type="button" style="animation-delay:0ms">' +
      '<span class="drawer-item-icon">🎁</span>' +
      '<span class="drawer-item-nome">Todas as categorias</span>' +
      '<span class="drawer-item-count">' + PRODUTOS.length + '</span>' +
    '</button>';
  drawerList.appendChild(itemTodas);

  var ordem = Object.keys(cats).sort(function(a, b) {
    return cats[b] - cats[a];
  });

  ordem.forEach(function(cat, i) {
    var li = document.createElement('li');
    li.innerHTML =
      '<button class="drawer-item" data-cat="' + cat + '" type="button" style="animation-delay:' + ((i + 1) * 40) + 'ms">' +
        '<span class="drawer-item-icon">' + (CAT_ICONS[cat] || '📦') + '</span>' +
        '<span class="drawer-item-nome">' + (CAT_NOMES[cat] || cat) + '</span>' +
        '<span class="drawer-item-count">' + cats[cat] + '</span>' +
      '</button>';
    drawerList.appendChild(li);
  });

  // Bind clicks
  drawerList.querySelectorAll('.drawer-item').forEach(function(btn) {
    btn.addEventListener('click', function() {
      drawerList.querySelectorAll('.drawer-item').forEach(function(b) { b.classList.remove('ativo'); });
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
  // Botão que abre o drawer
  document.getElementById('btn-categorias').addEventListener('click', function(e) {
    if (e.target.id === 'btn-cat-clear') return;
    abrirDrawer();
  });

  // X dentro do drawer
  document.getElementById('drawer-close').addEventListener('click', fecharDrawer);

  // Overlay
  document.getElementById('drawer-overlay').addEventListener('click', fecharDrawer);

  // ESC para fechar
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') fecharDrawer();
  });

  // Botão "Ver todas"
  document.getElementById('drawer-limpar').addEventListener('click', function() {
    catAtiva = 'todas';
    document.querySelectorAll('.drawer-item').forEach(function(b) {
      b.classList.toggle('ativo', b.dataset.cat === 'todas');
    });
    atualizarBtnCategorias();
    renderizar();
    fecharDrawer();
  });

  // Botão X ao lado do nome da categoria (limpa filtro)
  document.getElementById('btn-cat-clear').addEventListener('click', function(e) {
    e.stopPropagation();
    catAtiva = 'todas';
    document.querySelectorAll('.drawer-item').forEach(function(b) {
      b.classList.toggle('ativo', b.dataset.cat === 'todas');
    });
    atualizarBtnCategorias();
    renderizar();
  });

  // Ordenar
  document.getElementById('ordenar').addEventListener('change', function(e) {
    ordenacao = e.target.value;
    renderizar();
  });

  // Busca
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
  let lista = PRODUTOS.slice();

  if (catAtiva !== 'todas') {
    lista = lista.filter(function(p) { return p.category === catAtiva; });
  }

  if (termoBusca) {
    lista = lista.filter(function(p) {
      return p.name.toLowerCase().indexOf(termoBusca) !== -1;
    });
  }

  if (ordenacao === 'menor-preco') {
    lista.sort(function(a, b) { return a.price - b.price; });
  } else if (ordenacao === 'maior-desconto') {
    lista.sort(function(a, b) { return b.desconto - a.desconto; });
  } else if (ordenacao === 'a-z') {
    lista.sort(function(a, b) { return a.name.localeCompare(b.name); });
  }

  return lista;
}

function formatarPreco(preco) {
  const partes = preco.toFixed(2).split('.');
  return { int: partes[0], cents: partes[1] };
}

function escapar(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderizar() {
  const lista = filtrar();
  const grid = document.getElementById('grid');
  const info = document.getElementById('info-resultado');

  if (lista.length === 0) {
    grid.innerHTML = '<div class="estado"><div class="estado-icon">🔍</div><strong>Nenhum produto encontrado</strong><p>Tente outra categoria ou termo de busca.</p></div>';
    info.textContent = 'Nenhum resultado';
    return;
  }

  info.innerHTML = '<span><strong>' + lista.length + '</strong> produto' + (lista.length !== 1 ? 's' : '') + ' encontrado' + (lista.length !== 1 ? 's' : '') + '</span>';

  grid.innerHTML = lista.map(function(p) {
    const priceParts = formatarPreco(p.price);
    const descontoBadge = p.desconto > 0 ? '<span class="card-desconto">-' + p.desconto + '% OFF</span>' : '';
    const precoOriginal = p.original_fmt ? '<span class="card-preco-original">' + p.original_fmt + '</span>' : '';
    const frete = p.desconto >= 20 ? '<span class="card-frete">🚚 Oferta quente</span>' : '';

    return '<a class="card" href="' + escapar(p.affiliate_url) + '" target="_blank" rel="noopener sponsored">' +
      '<div class="card-img">' +
        '<img src="' + escapar(p.thumbnail) + '" alt="' + escapar(p.name) + '" loading="lazy">' +
        descontoBadge +
      '</div>' +
      '<div class="card-body">' +
        '<div class="card-title">' + escapar(p.name) + '</div>' +
        '<div class="card-preco">' +
          precoOriginal +
          '<span class="card-preco-atual">R$ ' + priceParts.int + '<span class="cents">,' + priceParts.cents + '</span></span>' +
          frete +
        '</div>' +
        '<span class="card-btn">Ver oferta →</span>' +
      '</div>' +
    '</a>';
  }).join('');
}

init();
</script>
</body>
</html>`;
}

main().catch(function(err) {
  console.error('ERRO FATAL:', err.message);
  process.exit(1);
});
