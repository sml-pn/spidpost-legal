═══════════════════════════════════════════════════════════════════════════════
  SPIDPOST — Documento Norte (Bússola do Projecto)
  Última actualização: 2026-10-25
═══════════════════════════════════════════════════════════════════════════════

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  1. O QUE É O PROJECTO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

O SpidPost é um sistema de afiliação automática para Instagram. Ele:

  1. Lê os favoritos do utilizador no Mercado Livre (via Chrome real)
  2. Gera roteiros de vídeo com IA (Gemini "Super Cérebro")
  3. Gera áudio narrado (Edge TTS com naturalização de medidas)
  4. Monta vídeos verticais 1080×1920 (Reel + Story) e imagens (Feed)
  5. Faz upload para o ImageKit (CDN)
  6. Guarda tudo numa base de dados SQLite local
  7. Sincroniza com o GitHub (com --autostash)
  8. Publica automaticamente no Instagram nos slots 06:00–21:45

O PC do utilizador só é necessário 15–30 min/dia (para harvest + render).
Depois disso, o GitHub Actions publica sozinho, mesmo com o PC desligado.

Conta alvo: @idealegenial (Instagram)
Caminho local: C:\Users\smlpn\spidpost
Repositório: https://github.com/sml-pn/spidpost-legal
SaaS (fork separado): C:\Users\smlpn\spidpost-saas

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  2. ARQUITECTURA — VISÃO GERAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ┌─────────────────────────────────────────────────────────────────────┐
  │  PC DO UTILIZADOR (Windows) — 15 a 30 min por dia                    │
  │                                                                      │
  │   [Atalho: SpidPost.bat no desktop]                                  │
  │        ↓                                                             │
  │   npm run daily                                                      │
  │        ├── refresh    → renova tokens do Mercado Livre               │
  │        ├── harvest    → lê favoritos do ML via Chrome real           │
  │        │               (aborta após 3 captchas consecutivos)         │
  │        ├── rotate     → COOLDOWN vira PENDING (mantém fila ≥ 15)     │
  │        ├── render ×30 → gera vídeos + upload ImageKit                │
  │        │               (RENDERS_POR_RUN configurável)                │
  │        ├── cleanup    → apaga ficheiros locais + lixo na DB          │
  │        └── sync       → git add data.db + commit + push (--autostash)│
  │                                                                      │
  └───────────────────────────────┬──────────────────────────────────────┘
                                  │ git push (data.db)
                                  ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │  GITHUB (nuvem) — 24/7, sem precisar do PC                           │
  │                                                                      │
  │   GitHub Actions: publish.yml                                        │
  │        • schedule: */30 * * * * (cada 30 min)                        │
  │        • workflow_dispatch (trigger manual via cron-job.org)         │
  │        • concurrency (evita runs paralelos)                          │
  │                                                                      │
  │        ↓ npm run publish                                             │
  │                                                                      │
  │   publisher.ts lê data.db do repo → publica no Instagram             │
  │        • 1 produto por slot                                          │
  │        • Reel + Story (Feed desactivado)                             │
  │        • Comentário com link de afiliado (meli.la)                   │
  │        • Bloqueia produtos sem link meli.la válido                   │
  │        • Marca como COOLDOWN após publicar                           │
  │        • Commit do data.db actualizado de volta                      │
  │                                                                      │
  └─────────────────────────────────────────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  3. TECNOLOGIAS E LINGUAGENS — COM JUSTIFICAÇÃO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ▸ LINGUAGEM PRINCIPAL: TypeScript
    Porquê: tipagem estática evita bugs em runtime (nomes de campos em
    DB, APIs com JSON complexo). Compila para JavaScript e corre em
    Node.js. É a linguagem natural para o ecossistema Node.

  ▸ RUNTIME: Node.js 22
    Porquê: permite correr TypeScript/JavaScript no PC e no GitHub
    Actions. Tem o melhor suporte para Playwright, FFmpeg (child_process),
    SQLite (better-sqlite3) e fetch nativo (desde v18).

  ▸ BASE DE DADOS: SQLite (via better-sqlite3)
    Porquê: zero configuração, um ficheiro só (data.db), síncrono e
    rapidíssimo para leituras. Perfeito para versionar no git (ficheiro
    binário pequeno). Não precisa de servidor de BD.

  ▸ AUTOMAÇÃO DE BROWSER: Playwright com Chrome real
    Porquê: o Mercado Livre bloqueia IPs de datacenter e o Chromium
    headless do Playwright. A solução é usar o Chrome REAL do sistema
    (channel: 'chrome') com perfil persistente (browser-profile/), em
    modo visível (headless: false). Isso imita um utilizador real e
    resolve o captcha com intervenção humana (janela abre, utilizador
    resolve, browser continua).
    Ficheiro: src/lib/browser-persistente.ts
    Perfil: browser-profile/ (NUNCA vai para o git)

  ▸ DNS FIX: dns.setServers(['8.8.8.8', '8.8.4.4'])
    Porquê: alguns routers (ex: Intelbras) não resolvem
    api.mercadolibre.com. O DNS fix força o Node.js a usar Google DNS
    apenas no processo dele — sem mexer no Windows.
    Ficheiro: src/lib/dns-fix.ts (importado no topo do env.ts)

  ▸ PROCESSAMENTO DE VÍDEO: FFmpeg (via child_process)
    Porquê: é o standard de facto para manipulação de vídeo. Junta
    imagem + áudio, desenha texto com precisão pixel-perfect, aplica
    gradientes, sombras e animações. Sem ele seria impossível garantir
    que o preço (R$ 26,90) é renderizado exactamente como texto legível
    — as IAs de imagem erram preços.
    Config: timeout 10 min + preset veryfast + tune stillimage

  ▸ IA DE TEXTO: Google Gemini ("Super Cérebro" — 3.1-flash-lite primeiro)
    Porquê: gera roteiros de venda em português brasileiro natural.
    Fallback entre modelos quando um devolve HTTP 503.
    Modelos (ordem): gemini-3.1-flash-lite (500 req/dia) →
    3.5-flash-lite (500/dia) → 3.5-flash (20/dia) → 3.8-flash (20/dia)
    Usado APENAS para texto — nunca para desenhar imagens.
    "Super Cérebro": proíbe frases repetitivas, preço por extenso,
    medidas naturalizadas, anti-alucinação, tom profissional.

  ▸ SÍNTESE DE VOZ: Edge TTS (Microsoft Edge Text-to-Speech)
    Porquê: vozes neurais gratuitas, sem API key, qualidade próxima
    de narração humana. Alternativa gratuita ao ElevenLabs.
    Config: rate 0%, voz pt-BR-AntonioNeural
    Extra: naturalizarMedidas() converte "400w" → "400 watts"

  ▸ HOSPEDAGEM DE MÍDIA: ImageKit.io
    Porquê: serve os vídeos com URL pública que o Instagram consegue
    descarregar. O parâmetro ?tr=orig-true entrega o ficheiro original
    SEM transformação, evitando consumir video units do plano gratuito.
    Upload via https.request nativo (undici abortava uploads >1MB)

  ▸ AUTOMAÇÃO DE PUBLICAÇÃO: GitHub Actions
    Porquê: corre na nuvem, de graça (2000 min/mês), sem precisar do PC
    ligado. Lê o data.db do repo e publica no Instagram. O cron interno
    (*/30) faz os slots automaticamente.

  ▸ TRIGGER EXTERNO: cron-job.org
    Porquê: o schedule nativo do GitHub fica inactivo após 60 dias sem
    commits. O cron-job.org dispara um POST para a API do GitHub a cada
    30 min, garantindo que o workflow corre sempre. Backup do schedule.

  ▸ HTTP CLIENT: fetch nativo (Node 18+) para APIs leves; https.request
    nativo para uploads grandes (evita bug do undici >1MB)

  ▸ API DO INSTAGRAM: Meta Graph API v21.0
    Porquê: única forma oficial de publicar Reels/Stories numa conta
    profissional. Fluxo: criar container → esperar FINISHED → publicar.

  ▸ AFILIADOS ML: API de Afiliados + Chrome real (Playwright)
    Porquê: a API oficial dá os links de afiliado. O Chrome real lê os
    favoritos do utilizador (a API não expõe favoritos privados).
    Combinação das duas é o único caminho viável.

  ▸ CONTROLO DE VERSÃO: Git + GitHub
    Porquê: histórico de alterações, sincronização PC ↔ nuvem, e é o
    "transporte" do data.db entre os dois mundos.

  ▸ GESTÃO DE DEPENDÊNCIAS: npm
    Porquê: standard do Node.js. Lockfile (package-lock.json) garante
    versões idênticas no PC e no Actions.

  ▸ COMPILAÇÃO: tsx (runtime TypeScript)
    Porquê: corre .ts directamente sem passo de build. Acelera o ciclo
    de desenvolvimento e evita ter uma pasta dist/.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  4. ESTRUTURA DE PASTAS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  spidpost/
  │
  ├── START.bat                      Atalho "SpidPost" (duplo clique)
  ├── package.json                   Dependências e scripts npm
  ├── .env                           Chaves API (NUNCA vai para o git)
  ├── data.db                        Base de dados SQLite (vai para o git)
  ├── cookies-ml.json                Cookies de sessão do ML (afiliados)
  ├── browser-profile/               Perfil Chrome persistente (NUNCA git)
  │
  ├── src/
  │   ├── config/
  │   │   └── brand.ts               Cores, selo "ACHADINHO", CTA fixo
  │   │
  │   ├── jobs/                      Tarefas executáveis
  │   │   ├── harvester.ts           Lê favoritos do ML (aborta 3 captchas)
  │   │   ├── renderer.ts            Gera vídeos (salta sem imagem)
  │   │   ├── publisher.ts           Publica no Instagram (bloqueia sem meli.la)
  │   │   ├── refresh-ml.ts          Renova tokens do ML
  │   │   ├── rotate.ts              COOLDOWN → PENDING
  │   │   ├── cleanup.ts             Apaga lixo local + DB
  │   │   ├── cleanup-imagekit.ts    Apaga ficheiros antigos no ImageKit
  │   │   ├── sync-github.ts         git add + push (--autostash)
  │   │   ├── check-cookies.ts       Valida sessão ML (abre browser se expirar)
  │   │   └── daily.ts               Orquestrador (corre tudo)
  │   │
  │   ├── lib/
  │   │   ├── db.ts                  Conexão SQLite + queries
  │   │   ├── env.ts                 Carrega .env + importa dns-fix
  │   │   ├── dns-fix.ts             Força Google DNS no Node
  │   │   ├── browser-persistente.ts Chrome real + perfil persistente
  │   │   └── schedule.ts            Slots, backoff, pending
  │   │
  │   └── services/                  Integrações externas
  │       ├── gemini.ts              IA de texto (Super Cérebro)
  │       ├── tts.ts                 Voz (Edge TTS + naturalizarMedidas)
  │       ├── ffmpeg.ts              Montagem (timeout 10min + tune)
  │       ├── imagekit.ts            Upload CDN (https.request nativo)
  │       ├── instagram.ts           Publicação IG
  │       └── mercadolivre.ts        API + Chrome scraping
  │
  ├── .github/
  │   └── workflows/
  │       └── publish.yml            Workflow do GitHub Actions
  │
  ├── renders/                       Ficheiros temporários (limpos)
  │   ├── reels/
  │   ├── stories/
  │   ├── feed/
  │   └── temp/
  │
  └── backup/                        Backups do data.db

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  5. BASE DE DADOS — TABELAS PRINCIPAIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  products
    id, external_id, name, price, original_price, thumbnail,
    affiliate_url, category, status, attempts, error,
    created_at, updated_at, last_posted_at, next_variation

    Estados possíveis:
      PENDING    → à espera de ser renderizado
      READY      → render pronto, à espera de slot
      COOLDOWN   → já publicado, em descanso
      POSTED     → esgotou todas as variações
      ARCHIVED   → arquivado após 30 dias

  renders
    id, product_id, variation, reel_path, reel_url, story_url,
    feed_url, caption, hashtags, status, posted_at, ig_media_id

  posts_log
    id, product_id, turno, posted_at, ig_media_id

  schedule_used
    slot, data, used_at  (PK: slot + data)

  harvest_failures (NOVA)
    external_id, attempts, last_error, last_attempt_at, blacklisted
    (blacklist após 3 falhas 404 — harvest pula em runs futuros)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  6. FLUXO DIÁRIO — PASSO A PASSO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  UTILIZADOR (15-30 min):
  ─────────────────────────────────────────────────────────────────────
  1. Duplo clique em "SpidPost" (atalho no desktop)
  2. Corre automaticamente:
       refresh   → renova tokens ML (se necessário)
       harvest   → lê favoritos ML via Chrome real
                   (aborta se 3 captchas seguidos)
                   (abre janela Chrome para resolver captcha — 2 min)
       rotate    → mantém fila ≥ 15 (COOLDOWN → PENDING)
       render ×30 → gera 30 vídeos novos + upload ImageKit
                   (RENDERS_POR_RUN configurável no .env)
       cleanup   → apaga lixo local (>24h POSTED) e na DB
       sync      → git add data.db && commit && push --autostash
  3. Janela fecha sozinha
  4. PC pode ser desligado

  GITHUB ACTIONS (24/7, sem PC):
  ─────────────────────────────────────────────────────────────────────
  1. Trigger: cron */30 OU cron-job.org
  2. checkout do código + data.db
  3. npm ci (instala dependências)
  4. npm run publish:
       - Lê slot atual (ex: 13:30)
       - Se já usou este slot hoje → salta
       - Se última publicação < 25 min → bloqueia
       - Verifica limite diário (15/24h — reset à meia-noite)
       - Escolhe produto READY (não em backoff)
       - Verifica variedade (evita 2x mesma categoria seguida)
       - Bloqueia se produto não tem link meli.la válido
       - Publica Reel (com comentário de link)
       - Publica Story
       - Marca como COOLDOWN (próxima variação: B → C → A)
  5. git commit data.db && git push
  6. Repete a cada 30 min

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  7. DESIGN VISUAL (FIXO)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ▸ Fundo:        Creme #f5f0e8 + tint subtil por categoria (10% alpha)
  ▸ Selo:         Pill preta com "ACHADINHO" (fixo, sempre o mesmo)
  ▸ Estrelas:     ★★★★★ douradas (#d4af37) abaixo do selo
  ▸ Título:       Texto escuro #1a1a1a, fonte Arial Bold
  ▸ Bullets:      Cinza médio #4a4a4a (2-3 benefícios)
  ▸ Preço:        Preto bold, tamanho grande
  ▸ CTA:          "→ Link na descrição" (fixo no fundo)
  ▸ Sem logo, sem barra de marca (decisão do utilizador)

  Cores por categoria (tint subtil — só o fundo muda ligeiramente):
    esporte      → azul-céu pálido #d4e4ed
    casa         → âmbar suave #f0e4d0
    beleza       → rosa-pó #eddae0
    ferramentas  → cinza-quente #e0ddd8
    brinquedos   → lilás-pó #e6dfec
    moda         → bege-acinzentado #e5dfd5
    outros       → verde-menta #dde8e0

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  8. SCRIPTS npm DISPONÍVEIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  npm run daily              Orquestrador completo (uso diário)
  npm run harvest            Só lê favoritos do ML
  npm run render             Só gera 1 vídeo
  npm run publish            Publica (usado pelo GitHub Actions)
  npm run refresh            Renova tokens ML
  npm run cleanup            Limpa lixo local + DB
  npm run cleanup-imagekit   Limpa ImageKit (dry-run por defeito)
  npm run sync               git add data.db + commit + push
  npm run rotate             Repõe fila a 15
  npx tsx login-ml.ts        Abre Chrome para fazer login (1x/sessão)
  npx tsx src/jobs/check-cookies.ts  Valida sessão ML

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  9. VARIÁVEIS DE AMBIENTE (.env)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  MERCADO LIVRE
    ML_CLIENT_ID              App ID da aplicação ML
    ML_CLIENT_SECRET          App Secret
    ML_REDIRECT_URI           URL de callback OAuth
    ML_USER_ID                ID do utilizador ML
    ML_ACCESS_TOKEN           Token actual (expira a cada 6h)
    ML_REFRESH_TOKEN          Token de renovação

  META / INSTAGRAM
    META_APP_ID               App ID da app Meta
    META_APP_SECRET           App Secret
    IG_USER_ID                ID da conta Instagram Business
    IG_USERNAME               @idealegenial
    PAGE_ID                   ID da página Facebook associada
    PAGE_TOKEN                Page Access Token (longa duração)
    USER_TOKEN_LONGO          Token de utilizador (longa duração)

  GEMINI
    GEMINI_API_KEY            Chave da API Google Gemini

  IMAGEKIT
    IMAGEKIT_URL_ENDPOINT     URL do endpoint
    IMAGEKIT_PUBLIC_KEY       Chave pública
    IMAGEKIT_PRIVATE_KEY      Chave privada (usada no cleanup-imagekit)

  OUTROS
    PUBLIC_VIDEO_BASE_URL     URL base pública do ImageKit
    LIMITE_DIARIO             15 (produtos max/dia — reset à meia-noite)
    MINUTOS_APERTADO          60
    RENDERS_POR_RUN           30 (quantos renders o daily gera por run)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  10. REGRAS DE NEGÓCIO CRÍTICAS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ▸ 1 publicação por slot, 1 slot a cada 45 min
  ▸ Janela de publicação: 06:00 às 21:45 (15 slots de 45 min)
  ▸ Intervalo mínimo de 25 min entre publicações (anti-spam IG)
  ▸ Limite: 15 posts por dia (reset à meia-noite — calendário, não 24h)
  ▸ Fila mínima: 15 produtos (rotate repõe automaticamente)
  ▸ Cada produto publica 3 variações (A → B → C) ao longo do tempo
  ▸ Apenas 2 formatos: Reel + Story (Feed desactivado por rate limit)
  ▸ Comentário com link de afiliado sempre no Reel
  ▸ Bloqueia produtos sem link meli.la válido (não publica link errado)
  ▸ Variedade: não publica 2x mesma categoria seguida
  ▸ Backoff automático em caso de erro 2207077 (rate limit IG)
  ▸ Preço SEMPRE por extenso na fala ("quarenta e três reais e setenta
    e sete centavos"), formato numérico na legenda
  ▸ Medidas naturalizadas na fala ("400w" → "quatrocentos watts")

  Slots (06:00-21:45):
    06:00, 06:45, 07:30, 08:15, 09:00, 09:45, 10:30, 11:15, 12:00,
    12:45, 13:30, 14:15, 15:00, 15:45, 16:30, 17:15, 18:00, 18:45,
    19:30, 20:15, 21:00, 21:45

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  11. LIMITAÇÕES CONHECIDAS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ▸ ML bloqueia API /items/ (403 PolicyAgent):
    Solução: scraping via Chrome real (channel: 'chrome').

  ▸ ML bloqueia Chromium headless do Playwright:
    Solução: usar Chrome real visível (headless: false) + captcha manual.
    A janela abre e o utilizador resolve o captcha em 2 min.

  ▸ ML pede captcha frequente em IPs residenciais:
    Solução: harvest aborta após 3 captchas consecutivos (evita loop).

  ▸ Router Intelbras não resolve api.mercadolibre.com:
    Solução: dns.setServers(['8.8.8.8']) no dns-fix.ts.

  ▸ Imagens lazy-load retornam GIF base64:
    Solução: extrair imagem com seletores robustos (data-zoom, data-src,
    currentSrc, srcset), filtrar data:image.

  ▸ ffmpeg pode timeout em imagens grandes:
    Solução: timeout 10 min + preset veryfast + tune stillimage.

  ▸ IMAGEKIT tem limite de video units no plano gratuito:
    Solução: usar ?tr=orig-true (entrega original = 0 units).

  ▸ GitHub Actions schedule fica inactivo após 60 dias sem commits:
    Solução: cron-job.org a disparar via API (fallback).

  ▸ CONFLITOS NO data.db:
    Solução: durante o rebase, git checkout --theirs data.db.

  ▸ FEED desactivado:
    3 formatos no mesmo slot disparava rate limit (erro 2207051).
    Reduzido para Reel + Story.

  ▸ undici aborta uploads >1MB:
    Solução: https.request nativo no imagekit.ts.

  ▸ Modelo Gemini pode dar HTTP 503:
    Solução: fallback entre 4 modelos. Ordem prioriza cota (500/dia).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  12. ROADMAP FUTURO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ◻ SaaS multi-nicho (fork em C:\Users\smlpn\spidpost-saas)
     → UI de configuração (Settings + testes de API)
     → Templates de prompt por nicho (advogado, clínica, coach)
     → Upload de imagens (Meta AI → ImageKit → DB)
     → Rotação circular automática
     → Gemini Vision (analisa imagem → gera legenda)

  ◻ Animação nos vídeos (zoompan lento + fade no preço)
  ◻ Remoção de fundo do produto (@imgly local, sem API)
  ◻ Fundos contextuais por categoria (FFmpeg gradients)
  ◻ Empacotamento como app Electron para distribuição

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  13. CHECKLIST DE MANUTENÇÃO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  DIARIAMENTE (automático):
    ☑ GitHub Actions publica nos slots
    ☑ Commit automático do data.db

  A CADA 2-3 DIAS (manual, 15-30 min):
    ☐ Duplo clique no atalho "SpidPost" no desktop
    ☐ Esperar que termine (janela fecha sozinha)
    ☐ Se Chrome abrir para captcha, resolver em 2 min
    ☐ Confirmar que não houve erro no output

  1x POR MÊS (manual, 2 min):
    ☐ npm run cleanup-imagekit           (ver o que apagaria)
    ☐ npm run cleanup-imagekit -- --confirm  (apagar mesmo)

  1x A CADA 30 DIAS (manual, 5 min):
    ☐ Renovar token cron-job.org (expira em 30 dias)
    ☐ Verificar devcenter.mercadolivre.com.br (scopes, KYC)

  VERIFICAÇÃO DE SAÚDE (quando algo falhar):
    ☐ https://github.com/sml-pn/spidpost-legal/actions
    ☐ Ver se runs recentes estão verdes
    ☐ Se houver erro, abrir o log detalhado
    ☐ npx tsx src/jobs/check-cookies.ts (sessão ML válida?)
    ☐ Testar DNS: nslookup api.mercadolibre.com 8.8.8.8

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  14. PRINCÍPIOS DE DESIGN DO SISTEMA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  1. O PC do utilizador produz, a nuvem publica.
     Isto é o que permite "desligar o PC" após o daily.

  2. Preço SEMPRE em texto puro, nunca gerado por IA de imagem.
     As IAs erram números; o FFmpeg não.

  3. Uma cara só para a marca (fundo creme, selo ACHADINHO,
     ★★★★★, CTA fixo). A variação vem só do produto e do
     tint por categoria — nunca da estrutura visual.

  4. Nunca publicar 3 formatos no mesmo slot (rate limit).
     Reel + Story é o equilíbrio ideal.

  5. Se algo falhar no publish, o produto NÃO é apagado —
     volta a READY e é tentado de novo no próximo slot.
     Se falhar no render, o produto é marcado sem_imagem
     e o daily CONTINUA (não aborta).

  6. O data.db é a única fonte de verdade. O PC e a nuvem
     sincronizam-no; em conflito, o GitHub ganha. Sync usa
     --autostash para nunca falhar com unstaged changes.

  7. Zero custos fixos. Tudo em planos gratuitos:
     GitHub Actions (2000 min/mês), ImageKit (25 GB),
     Gemini (quota free), Edge TTS (ilimitado).

  8. DNS e HTTP testados antes do commit:
     - dns.setServers(['8.8.8.8']) no env.ts
     - https.request nativo para uploads >1MB
     - fetch nativo só para APIs leves

  9. Fallback em camadas (harvest):
     API → Playwright (Chrome real) → Googlebot → Catálogo
     Se API dá 403 (PolicyAgent) → tenta Playwright
     Se captcha → abre janela visível → utilizador resolve
     Se 3 captchas consecutivos → ABORTA harvest (24-48h)

  10. Sem alucinações do Gemini:
      - Proíbe "Quer economizar", "Você sabia", "Cansado de"
      - Preço por extenso obrigatório
      - Medidas naturalizadas
      - Conceito por categoria (organização, cozinha, etc.)
      - Tom profissional sem gírias forçadas

═══════════════════════════════════════════════════════════════════════════════
  FIM DO DOCUMENTO NORTE — 2026-10-25
═══════════════════════════════════════════════════════════════════════════════
