═══════════════════════════════════════════════════════════════════════════════
  SPIDPOST — Documento Norte (Bússola do Projecto)
  Última actualização: 2026-10-12
═══════════════════════════════════════════════════════════════════════════════

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  1. O QUE É O PROJECTO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

O SpidPost é um sistema de afiliação automática para Instagram. Ele:

  1. Lê os favoritos do utilizador no Mercado Livre (via browser real)
  2. Gera roteiros de vídeo com IA (Gemini)
  3. Gera áudio narrado (Edge TTS)
  4. Monta vídeos verticais 1080×1920 (Reel + Story) e imagens (Feed)
  5. Faz upload para o ImageKit (CDN)
  6. Guarda tudo numa base de dados SQLite local
  7. Sincroniza com o GitHub
  8. Publica automaticamente no Instagram nos slots 08:00–22:00

O PC do utilizador só é necessário 15–30 min por dia (para harvest + render).
Depois disso, o GitHub Actions publica sozinho, mesmo com o PC desligado.

Conta alvo: @idealegenial (Instagram)
Caminho local: C:\Users\smlpn\spidpost
Repositório: https://github.com/sml-pn/spidpost-legal

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
  │        ├── harvest    → lê favoritos do ML via Playwright            │
  │        ├── rotate     → COOLDOWN vira PENDING (mantém fila ≥ 15)     │
  │        ├── render ×10 → gera vídeos + upload ImageKit                │
  │        ├── cleanup    → apaga ficheiros locais + lixo na DB          │
  │        └── sync       → git add data.db + commit + push              │
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
  │        • 1 produto por slot                                           │
  │        • Reel + Story (Feed desactivado)                             │
  │        • Comentário com link de afiliado                             │
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

  ▸ AUTOMAÇÃO DE BROWSER: Playwright
    Porquê: o Mercado Livre bloqueia IPs de datacenter. Só um browser
    real com cookies de sessão consegue ler os favoritos. Playwright
    corre Chromium com perfil persistente (browser-profile/), imitando
    um utilizador real. Substitui Selenium com melhor detecção anti-bot.

  ▸ PROCESSAMENTO DE VÍDEO: FFmpeg (via child_process)
    Porquê: é o standard de facto para manipulação de vídeo. Junta
    imagem + áudio, desenha texto com precisão pixel-perfect, aplica
    gradientes, sombras e animações. Sem ele seria impossível garantir
    que o preço (R$ 26,90) é renderizado exactamente como texto legível
    — as IAs de imagem erram preços.

  ▸ IA DE TEXTO: Google Gemini (gemini-3.8-flash / gemini-3.5-flash)
    Porquê: gera roteiros de venda em português brasileiro natural.
    Fallback automático entre modelos quando um devolve HTTP 503.
    Usado APENAS para texto (roteiro, benefícios, hashtags) — nunca
    para desenhar imagens, porque erraria o preço.

  ▸ SÍNTESE DE VOZ: Edge TTS (Microsoft Edge Text-to-Speech)
    Porquê: vozes neurais gratuitas, sem API key, qualidade próxima
    de narração humana. Alternativa gratuita ao ElevenLabs.

  ▸ HOSPEDAGEM DE MÍDIA: ImageKit.io
    Porquê: serve os vídeos com URL pública que o Instagram consegue
    descarregar. O parâmetro ?tr=orig-true entrega o ficheiro original
    SEM transformação, evitando consumir video units do plano gratuito.
    Alternativas (Cloudinary, S3) cobram por download ou têm limites
    mais apertados.

  ▸ AUTOMAÇÃO DE PUBLICAÇÃO: GitHub Actions
    Porquê: corre na nuvem, de graça (2000 min/mês), sem precisar do PC
    ligado. Lê o data.db do repo e publica no Instagram. O cron interno
    (*/30) faz os slots automaticamente.

  ▸ TRIGGER EXTERNO: cron-job.org
    Porquê: o schedule nativo do GitHub fica inactivo após 60 dias sem
    commits. O cron-job.org dispara um POST para a API do GitHub a cada
    30 min, garantindo que o workflow corre sempre. Backup do schedule.

  ▸ HTTP CLIENT: fetch nativo (Node 18+)
    Porquê: zero dependências, suporta AbortController (timeouts),
    streams e redirect. Substitui axios e node-fetch.

  ▸ API DO INSTAGRAM: Meta Graph API v21.0
    Porquê: única forma oficial de publicar Reels/Stories numa conta
    profissional. Requer: IG_USER_ID, PAGE_TOKEN, PAGE_ID.
    Fluxo: criar container → esperar FINISHED → publicar.

  ▸ AFILIADOS ML: API de Afiliados do Mercado Livre + Playwright
    Porquê: a API oficial dá os links de afiliado. O Playwright lê os
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
  ├── cookies-ml.json                Cookies de sessão do Mercado Livre
  ├── browser-profile/               Perfil Chromium do Playwright
  │
  ├── src/
  │   ├── api/                       (legado — painel web local)
  │   │   ├── server.ts
  │   │   ├── scheduler.ts
  │   │   └── panel.html
  │   │
  │   ├── config/
  │   │   └── brand.ts               Cores, selo "ACHADINHO", CTA fixo
  │   │
  │   ├── jobs/                      Tarefas executáveis
  │   │   ├── harvester.ts           Lê favoritos do ML
  │   │   ├── renderer.ts            Gera vídeos + upload ImageKit
  │   │   ├── publisher.ts           Publica no Instagram
  │   │   ├── refresh-ml.ts          Renova tokens do ML
  │   │   ├── rotate.ts              COOLDOWN → PENDING
  │   │   ├── cleanup.ts             Apaga lixo local + DB
  │   │   ├── cleanup-imagekit.ts    Apaga ficheiros antigos no ImageKit
  │   │   ├── sync-github.ts         git add data.db + push
  │   │   └── daily.ts               Orquestrador (corre tudo)
  │   │
  │   ├── lib/
  │   │   ├── db.ts                  Conexão SQLite + queries
  │   │   ├── env.ts                 Carrega .env
  │   │   └── schedule.ts            Slots, backoff, pending
  │   │
  │   └── services/                  Integrações externas
  │       ├── gemini.ts              IA de texto
  │       ├── tts.ts                 Voz (Edge TTS)
  │       ├── ffmpeg.ts              Montagem de vídeo
  │       ├── imagekit.ts            Upload CDN
  │       ├── instagram.ts           Publicação IG
  │       └── mercadolivre.ts        API + scraping ML
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
    id, product_id, variation, reel_path, reel_url,
    caption, hashtags, status, posted_at, ig_media_id

    Estados: READY, POSTED, DELETED

  posts_log
    id, product_id, turno, posted_at, ig_media_id

  schedule_used
    slot, data, used_at  (PK: slot + data)

  category_rotation
    (controla a rotação por categoria)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  6. FLUXO DIÁRIO — PASSO A PASSO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  UTILIZADOR (15-30 min):
  ─────────────────────────────────────────────────────────────────────
  1. Duplo clique em "SpidPost" (atalho no desktop)
  2. Corre automaticamente:
       refresh   → renova tokens ML (se necessário)
       harvest   → lê favoritos do ML (Playwright com cookies)
       rotate    → mantém fila ≥ 15 (COOLDOWN → PENDING)
       render ×10 → gera 10 vídeos novos + upload ImageKit
       cleanup   → apaga lixo local (>24h POSTED) e na DB
       sync      → git add data.db && commit && push
  3. Janela fecha sozinha após 15s
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
       - Escolhe produto READY (não em backoff)
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
    IMAGEKIT_URL_ENDPOINT     URL do endpoint (ex: https://ik.imagekit.io/spidpost)
    IMAGEKIT_PUBLIC_KEY       Chave pública
    IMAGEKIT_PRIVATE_KEY      Chave privada (usada no cleanup-imagekit)

  OUTROS
    PUBLIC_VIDEO_BASE_URL     URL base pública do ImageKit
    LIMITE_DIARIO             15 (produtos max/dia)
    MINUTOS_APERTADO          60

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  10. REGRAS DE NEGÓCIO CRÍTICAS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ▸ 1 publicação por slot, 1 slot a cada 30 min
  ▸ Intervalo mínimo de 25 min entre publicações (anti-spam IG)
  ▸ Fila mínima: 15 produtos (rotate repõe automaticamente)
  ▸ Cada produto publica 3 variações (A → B → C) ao longo do tempo
  ▸ Apenas 2 formatos: Reel + Story (Feed desactivado por rate limit)
  ▸ Comentário com link de afiliado sempre no Reel
  ▸ Slots válidos: 08:00, 09:00, 10:00, 11:00, 12:30, 13:00, 13:30,
                   14:00, 14:30, 15:30, 16:00, 16:30, 17:00, 19:00,
                   19:30, 20:00, 20:30, 21:00, 21:30, 22:00
  ▸ Sem publicar fora desta janela (evita spam nocturno)
  ▸ Backoff automático em caso de erro 2207077 (rate limit IG)
  ▸ Variação de preço: SEMPRE com centavos ("e noventa centavos")

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  11. LIMITAÇÕES CONHECIDAS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ▸ HARVEST não funciona em datacenter: o ML bloqueia IPs de AWS/Azure.
    Por isso o harvest é LOCAL (precisa do PC do utilizador).

  ▸ IMAGEKIT tem limite de video units no plano gratuito. Solução:
    usar ?tr=orig-true (entrega original, sem transformação = 0 units).

  ▸ GITHUB ACTIONS schedule pode ficar inactivo após 60 dias sem commits.
    Solução: cron-job.org a disparar via API (fallback).

  ▸ CONFLITOS NO data.db: como é binário, o rebase não resolve.
    Solução: durante o rebase, usar git checkout --theirs data.db
    (fica com a versão do GitHub, que é a mais actualizada).

  ▸ FEED desactivado: usar 3 formatos no mesmo slot disparava rate limit
    (erro 2207051) do Instagram. Reduzido para Reel + Story.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  12. ROADMAP FUTURO (não implementado)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ◻ Animação nos vídeos (zoompan lento + fade no preço)
  ◻ Remoção de fundo do produto (@imgly local, sem API)
  ◻ Fundos contextuais por categoria (usando FFmpeg gradients)
  ◻ Painel web para controlo manual (localhost:3000)
  ◻ Empacotamento como app Electron para distribuição
  ◻ SaaS multi-utilizador (cada cliente com o seu data.db)
  ◻ Aplicação móvel (só visualização, sem harvest)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  13. CHECKLIST DE MANUTENÇÃO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  DIARIAMENTE (automático):
    ☑ GitHub Actions publica nos slots
    ☑ Commit automático do data.db

  A CADA 2-3 DIAS (manual, 15-30 min):
    ☐ Duplo clique no atalho "SpidPost" no desktop
    ☐ Esperar que termine (janela fecha sozinha)
    ☐ Confirmar que não houve erro no output

  1x POR MÊS (manual, 2 min):
    ☐ npm run cleanup-imagekit           (ver o que apagaria)
    ☐ npm run cleanup-imagekit -- --confirm  (apagar mesmo)

  VERIFICAÇÃO DE SAÚDE (quando algo falhar):
    ☐ https://github.com/sml-pn/spidpost-legal/actions
    ☐ Ver se runs recentes estão verdes
    ☐ Se houver erro, abrir o log detalhado

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

  6. O data.db é a única fonte de verdade. O PC e a nuvem
     sincronizam-no; em conflito, o GitHub ganha (é quem
     tem os dados mais recentes do bot).

  7. Zero custos fixos. Tudo em planos gratuitos:
     GitHub Actions (2000 min/mês), ImageKit (25 GB),
     Gemini (quota free), Edge TTS (ilimitado).

═══════════════════════════════════════════════════════════════════════════════
  FIM DO DOCUMENTO NORTE
═══════════════════════════════════════════════════════════════════════════════
