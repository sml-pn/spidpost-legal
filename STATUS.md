# 📋 STATUS DO PROJETO SPIDPOST

**Data:** 19/09/2026
**Versão:** v0.2 (fim da Etapa 1 + início da Etapa 2)
**Local:** C:\Users\smlpn\spidpost
**Objetivo:** Sistema self-hosted e gratuito de postagem automática no Instagram

---

## 🎯 OBJETIVO

Sistema que:
1. Lê produtos favoritos (Mercado Livre / Shopee)
2. Gera roteiros de vídeo automaticamente (Gemini)
3. Renderiza vídeos 1080x1920 com áudio TTS
4. Publica Reels automaticamente no Instagram
5. Roda 3 turnos/dia (manhã, tarde, noite)
6. Posta Mercado Livre primeiro, Shopee depois

**Custo:** R$ 0,00 (apenas free tiers)

---

## ✅ O QUE JÁ TEMOS

### Mercado Livre
- App criado: 3023167588914941
- OAuth funcionando (authorization_code)
- Refresh token com rotação (6 meses)
- API de Bookmarks: OK
- Scraping via Googlebot: OK (contorna bloqueio)
- Fallback via Playwright: instalado

### Meta / Instagram
- App Meta: 1395796159309442
- Página: Idealegenial
- Instagram: @idealegenial (ID: 17841430364312497)
- Page Token: gerado (não expira)
- Permissão instagram_content_publish: ATIVA
- User Token Longo: 60 dias

### Estrutura Node.js
- Node 22.17.1, npm 10.9.2, git 2.53.0
- TypeScript + tsx configurado
- Deps: better-sqlite3, zod, dotenv, playwright

### Banco de dados (SQLite)
- Tabela products criada
- 2 produtos de teste salvos

### Harvester
- Le favoritos do ML
- Extrai nome, preco, imagem
- Salva no SQLite (com dedup)

### Git
- git init feito
- Nada commitado ainda
- Sem repo no GitHub

---

## ⏳ ESPERANDO

### Shopee
- Cadastro afiliado: OK
- Formulario Open API: enviado
- Aprovacao: aguardando (5-15 dias)

---

## 🚧 FALTANDO

### Bloco B - Google Cloud
- B.1 Gemini API key: nao iniciado
- B.2 Service Account + APIs: nao iniciado
- B.3 Pasta no Drive: nao iniciado
- B.4 TTS pt-BR: nao iniciado

### Bloco C - Automacao
- GitHub repo + push
- GitHub Actions workflow
- Cron 3 turnos/dia
- Painel web

### Etapa 3 - Renderizacao
- Gerador de roteiro (Gemini)
- TTS (voz)
- ffmpeg (montar video)
- Upload para o Drive

### Etapa 4 - Publicacao
- Publicar Reel via API
- Poll de status do container
- Grade horaria (3 turnos)
- Prioridade ML -> Shopee

---

## 🧪 TESTES VALIDADOS

1. ML /users/me: OK
2. ML refresh token: OK (rotaciona)
3. ML bookmarks: OK
4. Meta page token: OK
5. IG info: OK
6. Googlebot scraping: OK
7. Parser de preco: OK
8. SQLite insert: OK
9. TypeScript + tsx: OK

---

## ⚠️ PONTOS DE ATENCAO

### Tokens que expiram
- ML_ACCESS_TOKEN: 6h (renova via refresh)
- ML_REFRESH_TOKEN: 6 meses (re-login manual)
- USER_TOKEN_LONGO: 60 dias (renova via App Secret)
- PAGE_TOKEN: infinito enquanto user token renovar

### Tokens que rotacionam
- ML_REFRESH_TOKEN rotaciona a cada uso
- PAGE_TOKEN pode rotacionar

### Gargalos
- Shopee nao tem API de favoritos
- Googlebot pode bloquear se abusar
- Playwright e o fallback

---

## 🎯 PROXIMOS PASSOS

### Curto prazo
1. B.1 - Gemini API key
2. B.2 - Service Account + APIs
3. B.3 - Pasta no Drive
4. B.4 - Testar TTS pt-BR

### Medio prazo
5. renderer.ts (Gemini + TTS + ffmpeg)
6. Testar 1 video ponta-a-ponta
7. publisher.ts (IG Graph API)
8. Postar 1 Reel manual

### Longo prazo
9. GitHub + GitHub Actions
10. Cron 3 turnos/dia
11. Painel web

---

## 🔐 SEGURANCA - PENDENCIAS

- ML_CLIENT_SECRET: rotacionar (ficou exposto)
- META_APP_SECRET: ja rotacionado
- .env no .gitignore: OK
- Backup do .env em local seguro: confirmar

---

## 📊 CUSTO ATUAL

Tudo R$ 0,00 (local + free tiers).

---

## 📝 PROXIMA ACAO IMEDIATA

B.1 - Gemini API key
Acessar: https://aistudio.google.com/apikey
