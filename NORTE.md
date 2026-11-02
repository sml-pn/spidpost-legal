═══════════════════════════════════════════════════════════════════════════════
  SPIDPOST — Documento Norte (Bússola do Projecto)
  Última actualização: 2026-11-02
═══════════════════════════════════════════════════════════════════════════════

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  1. O QUE É O PROJECTO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

O SpidPost é um sistema de afiliação automática multi-plataforma. Ele:
  1. Lê os favoritos do Mercado Livre (via Chrome real)
  2. Gera roteiros e legendas com IA (Gemini "Super Cérebro")
  3. Gera áudio narrado (Edge TTS com 3 vozes alternadas)
  4. Monta vídeos verticais 1080×1920 (Reel + Story) e imagens (Feed)
  5. Faz upload para o ImageKit (CDN)
  6. Gera uma Landing Page (GitHub Pages / Vercel)
  7. Publica no Instagram (Reel + Story + Comentário) e envia rascunhos para o TikTok
  8. Sincroniza o estado (data.db) com o GitHub (--autostash)

O PC do utilizador só é necessário 15–30 min/dia. O GitHub Actions publica sozinho.
Conta alvo: @idealegenial (Instagram) e @samuelpena22 (TikTok).
Caminho local: C:\Users\smlpn\spidpost

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  2. ARQUITECTURA — VISÃO GERAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ┌─────────────────────────────────────────────────────────────────────┐
  │  PC DO UTILIZADOR (Windows)                                          │
  │   npm run daily                                                      │
  │     ├── refresh, harvest, rotate (fila ≥ 30)                         │
  │     ├── render ×30 → gera vídeos (Vozes A/B/C) + upload ImageKit     │
  │     ├── cleanup → apaga ficheiros locais + lixo na DB                │
  │     └── sync → git add data.db + commit + push (--autostash)         │
  └───────────────────────────────┬──────────────────────────────────────┘
                                  │ git push
                                  ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │  GITHUB (nuvem) — 24/7, sem precisar do PC                           │
  │   GitHub Actions: publish.yml (schedule */30 OU cron-job.org)        │
  │        ↓ npm run publish                                             │
  │   publisher.ts lê data.db do repo                                    │
  │        • Verifica limite diário ALEATÓRIO (10-17 posts/dia)          │
  │        • Escolhe READY (cooldown min 7d/max 30d)                     │
  │        • Variedade: evita 2x mesma categoria seguida                 │
  │        • Publica no Instagram (Reel + Story) com legenda sem links   │
  │        • Comenta com link meli.la no Reel                            │
  │        • Envia o mesmo vídeo para a Caixa de Entrada do TikTok       │
  │        • Marca como COOLDOWN                                         │
  │        • Commit do data.db actualizado de volta                      │
  └─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │  VERCEL / GITHUB PAGES                                               │
  │   Landing Page (Ideal & Genial - Afiliado Oficial)                   │
  │        • Lê docs/products.json (gerado pelo daily)                   │
  │        • Design responsivo (busca mobile expansível, drawer categorias)│
  │        • Links de afiliado meli.la                                   │
  └─────────────────────────────────────────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  3. TECNOLOGIAS E LINGUAGENS — COM JUSTIFICAÇÃO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ▸ LINGUAGEM: TypeScript + Node.js 22
  ▸ BASE DE DADOS: SQLite (better-sqlite3) — zero config, versionável no git.
  ▸ BROWSER: Playwright com Chrome REAL (channel: 'chrome', headless: false). O ML bloqueia o Chromium headless. Abre janela para resolver captcha.
  ▸ DNS FIX: dns.setServers(['8.8.8.8']) no env.ts — resolve Intelbras.
  ▸ VÍDEO: FFmpeg (timeout 10min, preset veryfast, tune stillimage).
  ▸ IA DE TEXTO: Gemini (3.1-flash-lite → 3.5-flash-lite → 3.5-flash → 3.8-flash). Super Cérebro proíbe histórias falsas, exige preço por extenso, medidas naturalizadas e hashtags.
  ▸ VOZ: Edge TTS via Python. 3 vozes: A=Antonio (M), B=Francisca (F), C=Thalita (F). Rate -10%.
  ▸ CDN: ImageKit (https.request nativo para uploads >1MB).
  ▸ INSTAGRAM: Meta Graph API v21.0 (Reels + Stories + Comentário).
  ▸ TIKTOK: Content Posting API (Inbox Upload / Rascunhos) — Sandbox mode.
  ▸ LANDING PAGE: Vercel (HTML/CSS/JS vanilla gerado por TS).
  ▸ AGENDAMENTO: GitHub Actions + cron-job.org.
  ▸ SYNC: Git com --autostash.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  4. ESTRUTURA DE PASTAS (PRINCIPAIS)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  spidpost/
  ├── .env                           Chaves API (NUNCA vai para o git)
  ├── data.db                        Base de dados SQLite (vai para o git)
  ├── cookies-ml.json                Cookies de sessão ML (afiliados)
  ├── browser-profile/               Perfil Chrome persistente (NUNCA git)
  ├── docs/                          Landing page (index.html + products.json)
  ├── src/
  │   ├── jobs/
  │   │   ├── daily.ts               Orquestrador
  │   │   ├── harvester.ts           Lê favoritos do ML
  │   │   ├── renderer.ts            Gera vídeos (vozes A/B/C)
  │   │   ├── publisher.ts           Publica no IG + envia para TikTok
  │   │   ├── rotate.ts              Repõe fila (cooldown 7-30d)
  │   │   ├── gerar-landing.ts       Gera docs/index.html + products.json
  │   │   └── autorizar-tiktok.ts    Script de OAuth 2.0 do TikTok
  │   ├── lib/
  │   │   ├── env.ts                 Carrega .env + valida com Zod
  │   │   ├── dns-fix.ts             Força Google DNS no Node
  │   │   ├── browser-persistente.ts Chrome real
  │   │   └── schedule.ts            Slots, backoff, pending
  │   └── services/
  │       ├── gemini.ts              IA de texto (Super Cérebro)
  │       ├── tts.ts                 Voz (Edge TTS + VOZ_POR_VARIACAO)
  │       ├── ffmpeg.ts              Montagem (formatPrecoBR)
  │       ├── imagekit.ts            Upload CDN
  │       ├── instagram.ts           Publicação IG
  │       ├── tiktok.ts              API do TikTok (OAuth + Inbox Upload)
  │       └── mercadolivre.ts        API + Chrome scraping
  ├── .github/workflows/publish.yml  Workflow do GitHub Actions
  └── renders/                       Ficheiros temporários (limpos)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  5. BASE DE DADOS — TABELAS PRINCIPAIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  products
    id, external_id, name, price, original_price, thumbnail,
    affiliate_url, category, status, attempts, error,
    created_at, updated_at, last_posted_at, next_variation

    Estados: PENDING, READY, COOLDOWN, POSTED, ARCHIVED.

  renders
    id, product_id, variation, reel_url, story_url, feed_url,
    caption, hashtags, status, posted_at, ig_media_id

  posts_log
    id, product_id, turno, posted_at, ig_media_id

  schedule_used
    slot, data, used_at (PK: slot + data)

  harvest_failures
    external_id, attempts, last_error, last_attempt_at, blacklisted

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  6. FLUXO DIÁRIO — PASSO A PASSO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  UTILIZADOR (15-30 min):
    1. Duplo clique em "SpidPost" (atalho no desktop)
    2. O robô corre: refresh → harvest → rotate → render ×30 → cleanup → sync.
    3. Se o Chrome abrir para captcha, resolve em 2 min.
    4. PC pode ser desligado.

  GITHUB ACTIONS (24/7):
    1. Trigger: cron */30 OU cron-job.org.
    2. npm run publish:
       - Verifica limite diário ALEATÓRIO (10 a 17 posts/dia).
       - Escolhe produto READY (cooldown dinâmico 7-30d).
       - Evita 2x mesma categoria seguida.
       - Publica Reel + Story no IG (legenda sem links, com hashtags).
       - Comenta o link meli.la no Reel.
       - Envia o vídeo para a Caixa de Entrada do TikTok (se TIKTOK_SANDBOX=true).
       - Marca como COOLDOWN.
    3. git commit data.db && git push.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  7. DESIGN VISUAL (FIXO)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ▸ Landing Page: Header escuro, busca sticky, drawer lateral de categorias, botão "Ver no Mercado Livre" em 2 linhas, design responsivo.
  ▸ Fundo dos vídeos: Creme #f5f0e8 + tint subtil por categoria.
  ▸ Selo: Pill preta "ACHADINHO".
  ▸ Estrelas: ★★★★★ douradas (#d4af37).
  ▸ Título: #1a1a1a, Arial Bold.
  ▸ Preço: Preto bold, formato BR (ex: R$ 1.961,10).
  ▸ CTA: "→ Link na bio".

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  8. SCRIPTS npm DISPONÍVEIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  npm run daily              Orquestrador completo
  npm run harvest            Só lê favoritos do ML
  npm run render             Só gera 1 vídeo
  npm run publish            Publica (GitHub Actions)
  npm run landing            Gera a landing page (docs/)
  npm run refresh            Renova tokens ML
  npm run cleanup            Limpa lixo local + DB
  npm run sync               git add data.db + commit + push
  npx tsx src/jobs/autorizar-tiktok.ts   Gera token do TikTok

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  9. VARIÁVEIS DE AMBIENTE (.env)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  MERCADO LIVRE: ML_CLIENT_ID, ML_CLIENT_SECRET, ML_REDIRECT_URI, ML_USER_ID, ML_ACCESS_TOKEN, ML_REFRESH_TOKEN.

  META: META_APP_ID, META_APP_SECRET, IG_USER_ID, IG_USERNAME, PAGE_ID, PAGE_TOKEN, USER_TOKEN_LONGO.

  GEMINI: GEMINI_API_KEY.

  IMAGEKIT: IMAGEKIT_URL_ENDPOINT, IMAGEKIT_PUBLIC_KEY, IMAGEKIT_PRIVATE_KEY, PUBLIC_VIDEO_BASE_URL.

  TIKTOK: TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_REDIRECT_URI, TIKTOK_REFRESH_TOKEN, TIKTOK_SANDBOX=true.

  SISTEMA: LIMITE_DIARIO (15 padrão, mas usa aleatório 10-17), MINUTOS_APERTADO, RENDERS_POR_RUN=30.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  10. REGRAS DE NEGÓCIO CRÍTICAS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ▸ Limite diário: ALEATÓRIO entre 10 e 17 posts/dia (reset à meia-noite).
  ▸ Janela de publicação: 06:00 às 21:45 (slots de 45 min).
  ▸ Cooldown: dinâmico (mín 7d, máx 30d) baseado no total de produtos.
  ▸ Variedade: evita 2x mesma categoria seguida.
  ▸ Vozes: A=Antonio (M), B=Francisca (F), C=Thalita (F). Forçado Francisca para produtos de saúde/beleza.
  ▸ Legenda do Instagram: SEM LINKS. Apenas "Link na bio" + hashtags.
  ▸ Comentário do Instagram: Link meli.la (mantido).
  ▸ TikTok: Envia para Rascunhos (Inbox Upload). Sem legenda automática (limitação da API).
  ▸ Preço: SEMPRE por extenso na fala, formato BR na legenda e imagem.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  11. LIMITAÇÕES CONHECIDAS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ▸ ML bloqueia API /items/ (403) e Chromium headless. Solução: Chrome real visível + captcha manual.
  ▸ Instagram penaliza links em legendas. Solução: Removidos todos os links das legendas (só "Link na bio").
  ▸ TikTok não permite descrição no modo Rascunho. Solução: Publicação manual na app.
  ▸ ffmpeg pode timeout se houver processos órfãos. Solução: Matar ffmpeg e reiniciar.
  ▸ undici aborta uploads >1MB. Solução: https.request nativo.
  ▸ Gemini pode dar 503. Solução: Fallback entre 4 modelos.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  12. PRINCÍPIOS DE DESIGN DO SISTEMA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  1. O PC produz, a nuvem publica.
  2. Preço em texto puro no FFmpeg.
  3. Uma cara para a marca (Landing Page e Vídeos).
  4. Nunca 3 formatos no mesmo slot.
  5. Se falhar no render, o produto não é apagado (volta a PENDING).
  6. O data.db é a única fonte de verdade.
  7. Zero custos fixos (GitHub Actions, ImageKit, Gemini, Edge TTS, Vercel).
  8. DNS e HTTP robustos (Google DNS, https.request).
  9. Fallback em camadas (harvest).
  10. IA sem alucinações (proíbe histórias falsas, exige preço por extenso).

═══════════════════════════════════════════════════════════════════════════════
  FIM DO DOCUMENTO NORTE — 2026-11-02
═══════════════════════════════════════════════════════════════════════════════
