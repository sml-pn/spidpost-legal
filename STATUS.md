# 📋 STATUS DO PROJETO SPIDPOST

**Data:** 03/10/2026
**Versão:** v1.1 (sistema em produção local + GitHub Actions)
**Local:** C:\Users\smlpn\spidpost
**Objetivo:** Sistema self-hosted e gratuito de postagem automática no Instagram com links de afiliado

---

## 🎯 OBJETIVO

Sistema que roda 24/7 e:
1. Lê produtos favoritos do Mercado Livre (Googlebot + Playwright)
2. Gera **links de afiliado automaticamente** (AfiliMax + cookies)
3. Gera roteiros de vídeo com IA (Gemini, 4 modelos em fallback)
4. Renderiza 3 formatos por produto: **Reel + Story + Feed**
5. Publica automaticamente no Instagram (no PC + GitHub Actions 24/7)
6. **Comenta automaticamente** com o link de afiliado no post
7. **Responde a comentários "QUERO"** com DM (webhook configurado)
8. Rotaciona produtos por variação (A/B/C) com cooldown
9. **Limpa renders antigos automaticamente** (24h POSTED + 7 dias)

**Custo:** **R$ 0,00** (100% free tier)

---

## 🆕 NOVIDADES DA v1.1 (03/10/2026)

### 🔧 Correções críticas
- ✅ **Bug `2207082` resolvido** — áudio mono → estéreo (`-ac 2` no ffmpeg.ts). Reels e Stories voltaram a publicar.
- ✅ **Retry automático** para `2207082` no `instagram.ts` (espera 5 min, tenta outra vez)
- ✅ **`publisher.ts`** apaga ficheiro local após upload ImageKit (nunca mais acumula)
- ✅ **`cleanup.ts`** reescrito: POSTED >24h + tudo >7 dias (era 45 dias)
- ✅ **`hosts` file limpo** — estava a forçar `graph.facebook.com` para IP bloqueado
- ✅ **Tailscale desligado** — repunha as entradas no `hosts`
- ✅ **`START.bat` modo daily** — substituiu o antigo (modo servidor + Tailscale)

### 🚀 Automação GitHub Actions
- **Publish 100% na nuvem** — funciona mesmo com o PC desligado
- **Frequência:** a cada 10 min (era 30 min)
- **Publicação nº 26+** — confirmada a funcionar
- **Duração:** ~2min 10s por run
- **`data.db` sincronizado automaticamente** após cada publish

### 🧹 Limpeza de renders
- **`renders/` reduzido de 90 MB → 10.88 MB**
- **`publisher.ts`** apaga ficheiro local após upload
- **`cleanup.ts`** corre automaticamente no `daily` (5 passos)

### 📦 `daily.ts` — 5 passos
```
refresh → harvest → render → cleanup → sync
```

---

## ✅ O QUE FUNCIONA (produção)

### 🛒 Mercado Livre — Integração completa
- App DevCenter: `3023167588914941`
- OAuth funcionando (authorization_code + refresh)
- Refresh token com rotação automática (6 meses)
- **Renovação automática a cada 5h** (`refresh-ml.ts`)
- API de Bookmarks: OK
- Scraping via Googlebot: OK (contorna bloqueio)
- Fallback via Playwright: instalado
- **Categorização automática** via breadcrumb (10 categorias)

### 🔗 Afiliados Mercado Livre
- **Links de afiliado gerados automaticamente** via `@afilimax/mercado-livre-provider`
- Cookies de sessão exportados (37 cookies via extensão AcheiVIP)
- Tag afiliado: `pesa9076122` (matt_tool: 25916945)
- **29/31 produtos** no banco com link de afiliado (`meli.la/...`)
- Script `login-ml.ts`: setup único de login (sessão persiste)

### 📸 Meta / Instagram — Integração completa
- App Meta: `1395796159309442`
- Página: **Idealegenial** (`PAGE_ID=1319245031271256`)
- Instagram: **@idealegenial** (`IG_USER_ID=17841430364312497`)
- Permissões ativas: `instagram_content_publish`, `instagram_manage_comments`, `instagram_manage_messages`
- **Reels + Stories + Feed publicados com sucesso**
- **Comentário automático com link** funcionando
- **Webhook configurado** (aguarda App Review para Live)

### 🎨 Google Cloud
- **Gemini API key**: OK (4 modelos em fallback)
- **Service Account**: OK
- **Drive pasta**: OK
- **Sheets**: OK
- **TTS**: Edge TTS (Microsoft, grátis)

### 🖥️ Node.js / Ambiente
- Node 22.17.1, npm 10.9.2, git 2.53.0
- TypeScript + tsx
- **ffmpeg 9.0.2** em `C:\ffmpeg\bin`
- **Playwright** (Chromium) instalado

### 💾 Banco de dados (SQLite)
Tabelas: `products`, `renders`, `posts_log`, `category_rotation`, `schedule_slots`

### 🔧 Serviços (src/services/)
- `mercadolivre.ts` — Googlebot + Playwright + categorização
- `gemini.ts` — 4 modelos em fallback + retry exponencial
- `tts.ts` — Edge TTS com 3 tentativas
- `ffmpeg.ts` — 3 formatos + tarja + benefícios + sombras + **áudio estéreo**
- `instagram.ts` — publica Reel + Story + Feed + comentário + **retry 2207082**

### 🤖 Jobs (src/jobs/)
- `harvester.ts` — lê favoritos + gera link de afiliado
- `renderer.ts` — gera 3 formatos por produto
- `publisher.ts` — publica + comenta + backoff + **apaga local após upload**
- `refresh-ml.ts` — renova token ML
- `cleanup.ts` — **POSTED >24h + tudo >7 dias**
- `rotate.ts` — repõe COOLDOWN
- `sync-github.ts` — commit + push do data.db
- `daily.ts` — **5 passos: refresh → harvest → render → cleanup → sync**

### 🌐 Servidor HTTP (src/api/)
- `server.ts` — Fastify + webhook + API REST
- `scheduler.ts` — 5 jobs com locks por categoria
- `panel.html` / `panel.css` / `panel.js` — painel completo

### 🚀 GitHub Actions (`.github/workflows/publish.yml`)
- **Publish 24/7 na nuvem** (funciona sem PC)
- **Frequência:** a cada 10 min
- **Publica Reel + Story + Feed**
- **Comenta com link de afiliado**
- **Commita data.db automaticamente**

### 🔄 Git
- Repositório local ativo: `https://github.com/sml-pn/spidpost-legal`
- `data.db` versionado (sincroniza com GitHub Actions)
- `.gitignore` configurado

---

## 📊 PIPELINE COMPLETO VALIDADO

### Fluxo diário (PC — 1x/dia, 3-5 min)
```
START.bat → npm run daily
  ├─ refresh    (tokens ML)
  ├─ harvest    (favoritos + links afiliado)
  ├─ render     (gera vídeos se houver novos)
  ├─ cleanup    (apaga renders >24h POSTED + >7 dias)
  └─ sync       (push data.db para GitHub)
```

### Fluxo nuvem (GitHub Actions — 24/7)
```
publish.yml (a cada 10 min)
  ├─ Lê data.db
  ├─ Publica Reel + Story + Feed no IG
  ├─ Comenta com link afiliado
  └─ Commit data.db de volta
```

**Resultado:** PC faz harvest/render 1x/dia. Nuvem publica 24/7 mesmo com PC desligado.

---

## 🚧 O QUE ESTÁ PENDENTE

### 🔴 Curto prazo

#### 1. App Review Meta (webhook em produção)
- **Status:** falta gravar screencast
- **O que falta:**
  - Gravar vídeo (comentar → DM → resposta pública)
  - Submeter 3 permissões: `instagram_business_basic`, `instagram_business_manage_comments`, `instagram_business_manage_messages`
- **Alternativa atual:** comentário público com link

#### 2. Configurar cross-post Facebook
- **Status:** Instagram tem opção nativa
- **O que falta:** ativar no app (2 min)
- **Resultado:** tudo publicado no IG replica na Página FB

#### 3. Rate limit do Instagram
- **Detetado:** após ~12 posts/dia, IG retorna `2207077`
- **Backoff implementado:** produtos em rate limit ficam 3h
- **Intervalo:** 30 min entre posts

### 🟡 Médio prazo

#### 4. Shopee — Aguardando aprovação
- Cadastro afiliado: OK
- Formulário Open API: enviado
- **Status:** aguardando 5-15 dias
- **Alternativa:** cookies + Playwright (mesma lógica do ML)

#### 5. Backup do .env e cookies
- Backup manual a fazer
- Cookies ML expiram em semanas/meses

#### 6. GitHub repo do SpidPost principal
- Só `spidpost-legal` está no GitHub

### 🟢 Longo prazo

#### 7. Rotação de tokens Meta
- `USER_TOKEN_LONGO` expira em 60 dias

#### 8. Métricas (views, likes)
- Buscar via Graph API Insights
- Guardar em `posts_log`

#### 9. Migração para Electron (produto vendável)
- Wizard de setup (7 passos)
- Split-screen com browser integrado
- Instalador `.exe`

---

## ⚠️ PONTOS DE ATENÇÃO

### Tokens e suas validades
| Token | Validade | Renovação | Estado |
|---|---|---|---|
| `ML_ACCESS_TOKEN` | 6h | Automática (`refresh-ml.ts`) | ✅ |
| `ML_REFRESH_TOKEN` | 6 meses | Rotaciona a cada uso | ✅ |
| `USER_TOKEN_LONGO` | 60 dias | Manual via App Secret | ⚠️ |
| `PAGE_TOKEN` | ∞ | Enquanto user token renovar | ✅ |
| `COOKIES_ML` | Semanas/meses | Re-exportar extensão | ⚠️ |

### Rate limits conhecidos
- **Gemini free tier:** ~560 req/dia (4 modelos fallback)
- **ML API:** OK para uso normal
- **IG Graph API:** ~25 posts/dia prático (backoff implementado)
- **IG total uploads/dia:** ~50

### Gargalos resolvidos
- ✅ **`2207082` (áudio mono)** — corrigido com estéreo
- ✅ **`hosts` bloqueava Meta** — limpo
- ✅ **Tailscale repunha `hosts`** — desligado
- ✅ **Renders acumulavam 90 MB** — limpeza automática

### Gargalos pendentes
- Shopee sem API de favoritos
- Googlebot pode bloquear se abusar
- IG exige `video_url` público (ImageKit resolve)

### Segurança
- ✅ `META_APP_SECRET`: rotacionado
- ✅ `.env` no `.gitignore`
- ✅ Painel protegido com basic auth
- ⚠️ `cookies-ml.json` e `browser-profile/` **NÃO committar**

---

## 📁 ESTRUTURA DE FICHEIROS

```
C:\Users\smlpn\spidpost\
├── .env                        ← credenciais (NÃO committar)
├── .gitignore
├── STATUS.md                   ← este arquivo
├── START.bat                   ← arranque modo daily (sem Tailscale)
├── data.db                     ← SQLite
├── cookies-ml.json             ← cookies afiliado ML
├── package.json                ← com scripts: daily, sync, cleanup, etc.
├── tsconfig.json
├── login-ml.ts                 ← setup login persistente
├── gerar-link-afiliado.ts
├── importar-lista.ts
├── browser-profile/            ← sessão persistente ML
├── backup/                     ← backups + START.bat antigo
├── renders/
│   ├── temp/                   ← limpo automaticamente
│   ├── reels/                  ← vídeos 1080x1920
│   ├── stories/                ← vídeos 1080x1920
│   └── feed/                   ← imagens 1080x1350
├── .github/
│   └── workflows/
│       └── publish.yml         ← publica a cada 10 min
└── src/
    ├── lib/
    │   ├── env.ts
    │   ├── db.ts
    │   ├── schedule.ts
    │   └── browser-persistente.ts
    ├── services/
    │   ├── mercadolivre.ts
    │   ├── gemini.ts
    │   ├── tts.ts
    │   ├── ffmpeg.ts           ← com -ac 2 (estéreo)
    │   ├── instagram.ts        ← com retry 2207082
    │   └── imagekit.ts
    ├── jobs/
    │   ├── harvester.ts
    │   ├── renderer.ts
    │   ├── publisher.ts        ← apaga local após upload
    │   ├── refresh-ml.ts
    │   ├── cleanup.ts          ← POSTED >24h + tudo >7 dias
    │   ├── rotate.ts
    │   ├── sync-github.ts
    │   └── daily.ts            ← 5 passos
    └── api/
        ├── server.ts
        ├── scheduler.ts
        ├── panel.html
        ├── panel.css
        └── panel.js
```

---

## 🎯 COMO USAR O SISTEMA

### Arranque diário (PC)
1. **Duplo clique** em `START.bat`
2. Janela abre e corre `npm run daily`
3. 5 passos: refresh → harvest → render → cleanup → sync
4. Fecha sozinha após 15s
5. **Podes desligar o PC**

### Publicação (nuvem, 24/7)
- GitHub Actions publica automaticamente a cada 10 min
- Não precisa do PC ligado
- Ver em: `https://github.com/sml-pn/spidpost-legal/actions`

### Instagram
- **@idealegenial** mostra os posts a serem publicados

### Comandos úteis
```bash
npm run daily       # ciclo completo (5 passos)
npm run harvest     # só favoritos
npm run render      # só gera vídeos
npm run publish     # publica 1 produto (manual)
npm run cleanup     # só limpeza
npm run sync        # só push data.db
```

### Manutenção
- **1x/dia:** clicar START.bat
- **A cada 5h:** refresh ML (automático no daily)
- **A cada 2 meses:** re-exportar `cookies-ml.json`
- **A cada 2 meses:** renovar `USER_TOKEN_LONGO`

---

## 💰 CUSTO

### Setup atual (local + nuvem)
| Serviço | Custo |
|---|---|
| Node.js + SQLite | R$ 0 |
| ffmpeg | R$ 0 |
| Google Gemini | R$ 0 |
| Edge TTS | R$ 0 |
| GitHub Actions | R$ 0 |
| ImageKit | R$ 0 (20 GB grátis) |
| Render (static site legal) | R$ 0 |
| **Total** | **R$ 0,00** |

---

## 🚀 PRÓXIMOS PASSOS

### Esta semana
1. **Backup**: `.env` + `cookies-ml.json` + `data.db`
2. **Facebook cross-post**: ativar (2 min)
3. **Monitorizar**: ver logs das próximas 24h

### Próximas 2 semanas
4. **App Review**: gravar screencast + submeter
5. **GitHub**: push do projeto principal
6. **Shopee**: verificar aprovação da API

### Próximo mês
7. **Métricas**: views via Insights API
8. **Dashboard**: gráficos no painel
9. **Migração Electron** (produto vendável)

---

## 📝 PRÓXIMA AÇÃO IMEDIATA

**1.** Backup dos ficheiros críticos:
```powershell
cd C:\Users\smlpn\spidpost
New-Item -ItemType Directory -Path "backup" -Force
Copy-Item .env "backup\.env-$(Get-Date -Format 'yyyyMMdd')"
Copy-Item cookies-ml.json "backup\cookies-ml-$(Get-Date -Format 'yyyyMMdd').json"
Copy-Item data.db "backup\data-$(Get-Date -Format 'yyyyMMdd').db"
```

**2.** Deixar o sistema rodar 24h e verificar resultados

**3.** Facebook cross-post no Instagram (manual, 2 min)

---

**Status geral:** ✅ Sistema em produção. Pipeline completo funcionando com links de afiliado reais. Publica automaticamente 24/7 no GitHub Actions. Bug do áudio mono resolvido. Aguarda App Review para webhook de DMs.