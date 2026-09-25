
cd C:\Users\smlpn\spidpost

$content = @'
# 📋 STATUS DO PROJETO SPIDPOST

**Data:** 25/09/2026
**Versão:** v1.0 (sistema em produção local)
**Local:** C:\Users\smlpn\spidpost
**Objetivo:** Sistema self-hosted e gratuito de postagem automática no Instagram com links de afiliado

---

## 🎯 OBJETIVO

Sistema que roda 24/7 e:
1. Lê produtos favoritos do Mercado Livre (via API oficial)
2. Gera **links de afiliado automaticamente** (AfiliMax)
3. Gera roteiros de vídeo com IA (Gemini, 4 modelos em fallback)
4. Renderiza 3 formatos por produto: **Reel + Story + Feed**
5. Publica automaticamente no Instagram (a cada 30 min)
6. **Comenta automaticamente** com o link de afiliado no post
7. **Responde a comentários "QUERO"** com DM (webhook configurado)
8. Rotaciona produtos por variação (A/B/C) com cooldown
9. Publica 3 turnos/dia (manhã, tarde, noite)

**Custo:** **R$ 0,00** (100% free tier)

---

## ✅ O QUE FUNCIONA (produção)

### 🛒 Mercado Livre — Integração completa
- App DevCenter: `3023167588914941`
- OAuth funcionando (authorization_code + refresh)
- Refresh token com rotação automática (6 meses)
- **Renovação automática a cada 5h** (`refresh-ml.ts` no scheduler)
- API de Bookmarks: OK
- Scraping via Googlebot: OK (contorna bloqueio)
- Fallback via Playwright: instalado
- **Categorização automática** via breadcrumb (10 categorias)

### 🔗 Afiliados Mercado Livre — **NOVO**
- **Links de afiliado gerados automaticamente** via `@afilimax/mercado-livre-provider`
- Cookies de sessão exportados (37 cookies via extensão AcheiVIP)
- Modo alternativo: browser persistente (Playwright)
- Tag afiliado: `pesa9076122` (matt_tool: 25916945)
- **19/19 produtos** no banco com link de afiliado (`meli.la/...`)
- Script `login-ml.ts`: setup único de login (sessão persiste)
- Script `gerar-link-afiliado.ts`: manual + `--todos`
- **Integrado no harvester**: novos favoritos geram link automaticamente

### 📸 Meta / Instagram — Integração completa
- App Meta: `1395796159309442`
- Página: **Idealegenial** (`PAGE_ID=1319245031271256`)
- Instagram: **@idealegenial** (`IG_USER_ID=17841430364312497`)
- Page Token: gerado (não expira)
- Permissões ativas: `instagram_content_publish`, `instagram_manage_comments`, `instagram_manage_messages`
- User Token Longo: 60 dias
- **Reels + Stories + Feed publicados com sucesso**
- **Comentário automático com link** funcionando
- **Webhook configurado** (Meta verificado, aguarda App Review para Live)

### 🎨 Google Cloud — Parcial
- **Gemini API key**: OK (4 modelos em fallback)
- **Service Account**: OK (`spidpost-worker@spidpost-prod.iam.gserviceaccount.com`)
- **Drive pasta**: OK
- **Sheets**: OK
- **TTS**: Substituído por **Edge TTS** (Microsoft, grátis, sem cartão)

### 🖥️ Node.js / Ambiente
- Node 22.17.1, npm 10.9.2, git 2.53.0
- TypeScript + tsx
- **ffmpeg 9.0.2** em `C:\ffmpeg\bin`
- **Playwright** (Chromium) instalado
- **Tailscale 1.102.4** (URL fixa `samuel.tailebbd35.ts.net`)

### 💾 Banco de dados (SQLite) — Schema completo
Tabelas:
- `products` (com `category`, `variation_used`, `next_variation`, `last_variation`, `variations_done`, `last_posted_at`, `removed_from_ml`, `affiliate_url`)
- `renders` (histórico de vídeos gerados por variação)
- `posts_log` (histórico de posts publicados)
- `category_rotation` (rastreamento de uso por categoria)
- `schedule_slots` (3 turnos: manhã/tarde/noite)

### 🔧 Serviços (src/services/)
- `mercadolivre.ts` — Googlebot + Playwright + categorização
- `gemini.ts` — 4 modelos em fallback + retry exponencial + template fallback
- `tts.ts` — Edge TTS com 3 tentativas
- `ffmpeg.ts` — 3 formatos (reel/story/feed) + tarja + benefícios + sombras
- `instagram.ts` — publica Reel + Story + Feed + comentário + resposta

### 🤖 Jobs (src/jobs/)
- `harvester.ts` — lê favoritos + gera link de afiliado + salva
- `renderer.ts` — gera 3 formatos por produto
- `publisher.ts` — publica + comenta + backoff inteligente
- `refresh-ml.ts` — renova token ML
- `cleanup.ts` — limpa temporários e renders antigos
- `rotate.ts` — repõe produtos COOLDOWN quando fila está vazia

### 🌐 Servidor HTTP (src/api/)
- `server.ts` — Fastify com auth básica + webhook + API REST
- `scheduler.ts` — 5 jobs com locks por categoria
- `panel.html` / `panel.css` / `panel.js` — painel completo

### 📊 Painel Web — Completo
- **Autenticação básica** (`samuel` / `spidpost2026`)
- Cards de estado: PENDING, READY, POSTED, COOLDOWN
- **Timeline visual de 24h** com turno atual
- 6 botões de ação manual
- **Túnel Tailscale** (URL fixa)
- **Logs em tempo real via SSE**
- Botões: Mostrar/Esconder janelas, Copiar URL, Testar túnel
- Modal com lista de URLs dos renders

### 🔒 Política e Termos (App Review)
- Política de Privacidade: `https://spidpost-legal.onrender.com/privacidade.html`
- Termos de Serviço: `https://spidpost-legal.onrender.com/termos.html`
- Repositório: `https://github.com/sml-pn/spidpost-legal`
- Deploy: Render (static site)

### 🚇 Tailscale — URL fixa e gratuita
- Domínio: **`samuel.tailebbd35.ts.net`**
- Funnel: ON (`--bg 3000`)
- **URL permanente** (nunca muda)
- Substituiu Cloudflare Quick Tunnel

### 🔄 Git
- `git init` feito
- Repositório local ativo
- Nada commitado no GitHub (só `spidpost-legal`)

---

## 📊 PIPELINE COMPLETO VALIDADO

### Fluxo automático (24/7)
```
[1] Harvester (1x/dia, 03:00)
    ↓
    - Lê favoritos do ML
    - Gera link de afiliado (AfiliMax)
    - Salva no banco com categoria

[2] Renderer (a cada 5 min)
    ↓
    - Pega produto PENDING
    - Gemini gera roteiro + estilo
    - Edge TTS gera áudio
    - ffmpeg monta Reel + Story + Feed
    - Marca como READY

[3] Publisher (a cada 30 min)
    ↓
    - Verifica intervalo mínimo (30 min)
    - Publica Reel + Story + Feed
    - Comenta com link de afiliado
    - Marca como COOLDOWN
    - Próxima variação: B ou C

[4] Rotate (a cada 5 min)
    ↓
    - Se fila vazia, repõe COOLDOWN
    - Avança variação (A → B → C)

[5] Refresh ML (a cada 5h)
    ↓
    - Renova token do Mercado Livre

[6] Cleanup (1x/dia)
    ↓
    - Remove temp + renders antigos
```

### Testes end-to-end validados
- ✅ Pipeline: harvest → render → publish
- ✅ 12+ posts publicados no @idealegenial
- ✅ Comentário com link de afiliado funcionando
- ✅ Reel + Story + Feed gerados com estilo dinâmico
- ✅ Webhook verificado pela Meta
- ✅ Simulação de comentário "Quero" processada
- ✅ 19 links de afiliado gerados automaticamente
- ✅ Sessão persistente do ML (`browser-profile`)

---

## 🚧 O QUE ESTÁ PENDENTE

### 🔴 Curto prazo

#### 1. App Review Meta (webhook em produção)
- **Status:** submetido? não — falta gravar screencast
- **O que falta:**
  - Gravar vídeo (comentar → DM → resposta pública)
  - Submeter 3 permissões: `instagram_business_basic`, `instagram_business_manage_comments`, `instagram_business_manage_messages`
  - Business Verification pode ser exigida
- **Impacto:** sem Live, webhook só funciona em testes manuais
- **Alternativa:** funcionalidade atual usa comentário público com link

#### 2. Configurar cross-post Facebook
- **Status:** Instagram tem opção nativa (Compartilhamento entre perfis)
- **O que falta:** ativar no app do Instagram (2 min)
- **Resultado:** tudo publicado no IG replica automaticamente na Página FB

#### 3. Rate limit do Instagram
- **Detetado:** após ~12 posts/dia, IG retorna `2207077`
- **Backoff implementado:** produtos em rate limit ficam em backoff 3h
- **Intervalo:** 30 min entre posts (em vez de 5 min)
- **Verificar:** se os 16 produtos READY vão publicar nas próximas horas

### 🟡 Médio prazo

#### 4. Shopee — Aguardando aprovação
- Cadastro afiliado: OK
- Formulário Open API: enviado
- **Status:** aguardando 5-15 dias
- Quando aprovado: criar `services/shopee.ts`

#### 5. Backup do .env e cookies
- Backup manual ainda não feito
- Cookies ML expiram em semanas/meses
- Se perder cookies → regenerar via extensão

#### 6. GitHub repo do SpidPost
- Só o `spidpost-legal` está no GitHub
- Falta fazer push do projeto principal
- Falta `.gitignore` para excluir dados sensíveis

### 🟢 Longo prazo

#### 7. Rotação de tokens Meta
- `USER_TOKEN_LONGO` expira em 60 dias
- Precisa de cron para renovar antes
- Fórmula: `fb_exchange_token` com App Secret

#### 8. Puppeteer para Puppeteer/Facebook Ads
- Se quiseres anunciar no futuro
- Precisa de App Review e conta de anúncios

#### 9. Métricas (views, likes)
- Buscar via Graph API Insights
- Guardar em `posts_log` e mostrar no painel
- A/B test de roteiros

#### 10. Página Open Graph (Fase 3)
- Para partilha no WhatsApp
- Preview rico (imagem + título + descrição)

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
- **Gemini free tier:** ~560 req/dia (4 modelos em fallback)
- **ML API:** OK para uso normal
- **IG Graph API:** ~25 posts/dia prático — implementado backoff
- **IG total uploads/dia:** ~50 (após isso bloqueia)

### Gargalos
- Shopee sem API de favoritos (usar API de ofertas)
- Googlebot pode bloquear se abusar (Playwright fallback)
- IG exige `video_url` público (Tailscale resolveu)
- Tailscale pode cair após reinício (Task Scheduler recomendado)

### Segurança
- ⚠️ `ML_CLIENT_SECRET` exposto no chat → rotacionar no DevCenter
- ⚠️ `GEMINI_API_KEY` exposta no chat → gerar nova
- ✅ `META_APP_SECRET`: já rotacionado
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
├── START.bat                   ← arranque com 1 clique
├── data.db                     ← SQLite
├── google-key.json             ← Service Account
├── cookies-ml.json             ← cookies afiliado ML
├── package.json
├── tsconfig.json
├── clean-files.ts              ← limpeza de renders
├── gerar-link-afiliado.ts      ← geração manual de links
├── importar-lista.ts           ← scraping de listas
├── login-ml.ts                 ← setup login persistente
├── browser-profile/            ← sessão persistente ML
├── scripts/
│   ├── show-windows.ps1
│   └── hide-windows.ps1
├── renders/
│   ├── temp/                   ← limpo automaticamente
│   ├── reels/                  ← vídeos 1080x1920
│   ├── stories/                ← vídeos 1080x1920
│   └── feed/                   ← imagens 1080x1350
└── src/
    ├── lib/
    │   ├── env.ts              ← Zod validation + Gemini chain
    │   ├── db.ts               ← SQLite schema v2
    │   ├── envWriter.ts        ← atualização atómica do .env
    │   └── browser-persistente.ts ← Playwright shared profile
    ├── services/
    │   ├── mercadolivre.ts     ← Googlebot + Playwright + categorização
    │   ├── gemini.ts           ← 4 modelos + retry + fallback
    │   ├── tts.ts              ← Edge TTS
    │   ├── ffmpeg.ts           ← 3 formatos + tarja
    │   └── instagram.ts        ← publica Reel/Story/Feed/Comentário
    ├── jobs/
    │   ├── harvester.ts        ← favoritos + afiliado
    │   ├── renderer.ts         ← gera 3 formatos
    │   ├── publisher.ts        ← publica + comenta + backoff
    │   ├── refresh-ml.ts       ← renova token ML
    │   ├── cleanup.ts          ← limpa ficheiros
    │   └── rotate.ts           ← repõe COOLDOWN
    └── api/
        ├── server.ts           ← Fastify + webhook + API
        ├── scheduler.ts        ← 5 jobs com locks
        ├── panel.html          ← interface
        ├── panel.css           ← estilos
        └── panel.js            ← lógica do painel
```

---

## 🎯 COMO USAR O SISTEMA

### Arranque diário
1. **Duplo clique** em `START.bat`
2. Espera ~10s (servidor + Tailscale)
3. Browser abre em `https://samuel.tailebbd35.ts.net`
4. Login: `samuel` / `spidpost2026`
5. Clica em **▶ INICIAR SISTEMA**

### Verificação
- **Cards** mostram fila em tempo real
- **Timeline** mostra turno atual
- **Logs** mostram cada operação
- **Instagram** `@idealegenial` mostra posts

### Comandos úteis
```bash
npm run server      # arranca servidor
npm run scheduler   # arranca scheduler (via painel normalmente)
npm run harvest     # busca favoritos
npm run render      # gera 1 vídeo
npm run publish     # publica 1 produto
npm run refresh     # renova token ML
npm run cleanup     # limpa ficheiros
npm run rotate      # repõe COOLDOWN
```

### Manutenção
- **A cada 5h:** refresh ML (automático)
- **A cada semana:** verificar logs de erro
- **A cada 2 meses:** re-exportar `cookies-ml.json`
- **A cada 2 meses:** renovar `USER_TOKEN_LONGO`

---

## 💰 CUSTO

### Setup atual (local)
| Serviço | Custo |
|---|---|
| Node.js + SQLite | R$ 0 |
| ffmpeg | R$ 0 |
| Tailscale | R$ 0 |
| Google Gemini | R$ 0 |
| Edge TTS | R$ 0 |
| GitHub | R$ 0 |
| Render (static site legal) | R$ 0 |
| **Total** | **R$ 0,00** |

### Se migrar para nuvem (opcional)
| Serviço | Custo |
|---|---|
| VPS (Hetzner/Fly) | ~$5/mês |
| OU Render Starter | ~$14/mês |
| **Total** | **~$5-14/mês** |

**Recomendação:** manter local enquanto possível.

---

## 🚀 PRÓXIMOS PASSOS (ordem sugerida)

### Esta semana
1. **Backup**: `.env` + `cookies-ml.json` + `data.db`
2. **Facebook cross-post**: ativar no Instagram (2 min)
3. **Monitorizar**: ver logs das próximas 24h
4. **Confirmar**: rate limit passou? 16 produtos vão publicar?

### Próximas 2 semanas
5. **App Review**: gravar screencast + submeter
6. **GitHub**: push do projeto principal
7. **GitHub Actions**: cron paralelo (backup dos jobs locais)
8. **Shopee**: verificar aprovação da API

### Próximo mês
9. **Métricas**: buscar views via Insights API
10. **Dashboard**: gráficos no painel
11. **A/B testing**: 2 roteiros por produto
12. **Página OG**: para partilha no WhatsApp

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

**2.** Proteger o backup no `.gitignore`:
```powershell
Add-Content .gitignore "`nbackup/`ncookies-ml.json`nbrowser-profile/"
```

**3.** Facebook cross-post no Instagram (manual, 2 min):
Perfil → Central de Contas → Compartilhamento entre perfis

**4.** Deixar o sistema rodar 24h e verificar resultados

---

## 🔐 SEGURANÇA — PENDÊNCIAS

- ⚠️ Rotacionar `ML_CLIENT_SECRET` (exposto no chat)
- ⚠️ Gerar nova `GEMINI_API_KEY` (exposta no chat)
- ✅ `META_APP_SECRET`: já rotacionado
- ⚠️ Backup do `.env` em gestor de senhas (Bitwarden)
- ⚠️ Adicionar 2º admin no Business Portfolio (recomendado pela Meta)

---

**Status geral:** ✅ Sistema em produção local. Pipeline completo funcionando com links de afiliado reais. Publica automaticamente a cada 30 min. Aguarda App Review para ativar webhook de DMs em produção.
'@

[System.IO.File]::WriteAllText("C:\Users\smlpn\spidpost\STATUS.md", $content, (New-Object System.Text.UTF8Encoding $false))

Write-Host "STATUS.md atualizado (v1.0)" -ForegroundColor Green
Write-Host ""
Write-Host "Tamanho: $((Get-Item STATUS.md).Length) bytes" -ForegroundColor Cyan
Write-Host "Linhas: $((Get-Content STATUS.md).Count)" -ForegroundColor Cyan
```

---

## ✅ O que ficou documentado

O `STATUS.md` foi reescrito com:

| Secção | Conteúdo |
|---|---|
| **Objetivo** | Atualizado (links afiliado + 24/7) |
| **O que funciona** | Tudo o que foi construído até agora |
| **Pipeline validado** | Fluxo automático 24/7 + testes |
| **O que está pendente** | Curto/médio/longo prazo |
| **Pontos de atenção** | Tokens, rate limits, gargalos |
| **Estrutura de ficheiros** | Árvore completa |
| **Como usar** | Arranque + comandos + manutenção |
| **Custo** | R$ 0,00 local |
| **Próximos passos** | Ordem sugerida |
| **Segurança** | Pendências claras |

---

## 🎯 Próxima ação

**Confirma-me:**

1. **O `STATUS.md` foi criado?**
2. **Queres fazer o backup agora?** (recomendado, 2 min)
3. **Ou preferes ativar o Facebook cross-post?** (2 min)

**Diz-me a letra** e eu guio-te.