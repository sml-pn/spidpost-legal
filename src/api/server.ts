/**
 * server.ts
 * ──────────────────────────────────────────────────────────────────────
 * Servidor HTTP do SpidPost.
 *
 * Rotas:
 *   GET  /                        → painel HTML
 *   GET  /panel.css               → CSS
 *   GET  /panel.js                → JS
 *   GET  /reels/* /stories/* /feed/*  → ficheiros de render
 *   GET  /api/health              → healthcheck
 *   GET  /api/status              → estado do banco
 *   GET  /api/timeline            → turno atual, próximo, tempo, posts do dia
 *   GET  /api/tunnel              → URL pública atual
 *   GET  /api/tunnel/test         → testa URL pública
 *   GET  /api/urls                → lista de URLs de renders
 *   GET  /api/logs                → SSE de logs
 *   GET  /api/system/status       → estado do scheduler
 *   POST /api/run/:job            → executa um job
 *   POST /api/system/start        → arranca scheduler
 *   POST /api/system/stop         → pára scheduler
 *   POST /api/windows/show        → traz janelas para primeiro plano
 *   POST /api/windows/hide        → minimiza janelas
 *
 * WEBHOOK (Instagram):
 *   GET  /api/instagram/webhook   → verificação (Meta)
 *   POST /api/instagram/webhook   → recebe comentários e envia DM
 * ──────────────────────────────────────────────────────────────────────
 */

import 'dotenv/config';

import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import fs from 'node:fs';
import { spawn, execSync, ChildProcess } from 'node:child_process';
import { db } from '../lib/db.js';
import { getTunnelUrlAtual } from '../lib/envWriter.js';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = '0.0.0.0';
const ROOT = process.cwd();
const API_DIR = path.join(ROOT, 'src', 'api');
const RENDERS_DIR = path.join(ROOT, 'renders');

// Token de verificação do webhook (deve coincidir com o configurado no Meta)
const WEBHOOK_VERIFY_TOKEN = 'spidpost_webhook_2026';

// Palavras-chave que disparam o envio de DM (case-insensitive)
const PALAVRAS_CHAVE = ['link', 'quero', 'promo', 'desconto', 'comprei', 'onde', 'manda', 'preco', 'preço'];

// API do Instagram (a URL base, as credenciais são lidas em runtime)
const IG_GRAPH = 'https://graph.facebook.com/v21.0';

const JOBS_VALIDOS = ['harvest', 'render', 'publish', 'refresh', 'cleanup'] as const;
type JobName = typeof JOBS_VALIDOS[number];
const JOB_TIMEOUT_MS = 10 * 60 * 1000;

// Processo do scheduler (iniciado pelo painel)
let schedulerProc: ChildProcess | null = null;

// ──────────────────────────────────────────────────────────────────────
// Logger + SSE
// ──────────────────────────────────────────────────────────────────────

type LogLevel = 'info' | 'ok' | 'warn' | 'error' | 'system';
type LogEntry = { time: string; level: LogLevel; message: string };

const logBuffer: LogEntry[] = [];
const MAX_LOG_BUFFER = 500;
const sseClients = new Set<(entry: LogEntry) => void>();

function ts(): string {
  // Hora local (nao UTC)
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return hh + ':' + mm + ':' + ss;
}

function log(level: LogLevel, message: string): void {
  const entry: LogEntry = { time: ts(), level, message };
  logBuffer.push(entry);
  if (logBuffer.length > MAX_LOG_BUFFER) logBuffer.shift();

  const prefix: Record<LogLevel, string> = {
    info: '   ', ok: ' OK', warn: '  !', error: ' XX', system: ' ##',
  };
  console.log(`[${entry.time}]${prefix[level]} ${message}`);

  for (const send of sseClients) {
    try { send(entry); } catch { /* ignore */ }
  }
}

const app = Fastify({ logger: false });

process.on('uncaughtException', (err) => log('error', `Exceção: ${err.message}`));
process.on('unhandledRejection', (reason) => log('error', `Rejeição: ${String(reason)}`));

// ──────────────────────────────────────────────────────────────────────
// Ficheiros estáticos
// ──────────────────────────────────────────────────────────────────────

async function registarStatic() {
  await app.register(fastifyStatic, {
    root: path.join(RENDERS_DIR, 'reels'),
    prefix: '/reels/',
    decorateReply: false,
    setHeaders: (reply) => {
      reply.header('Content-Type', 'video/mp4');
      reply.header('Cache-Control', 'public, max-age=3600');
    },
  });
  await app.register(fastifyStatic, {
    root: path.join(RENDERS_DIR, 'stories'),
    prefix: '/stories/',
    decorateReply: false,
    setHeaders: (reply) => {
      reply.header('Content-Type', 'video/mp4');
      reply.header('Cache-Control', 'public, max-age=3600');
    },
  });
  await app.register(fastifyStatic, {
    root: path.join(RENDERS_DIR, 'feed'),
    prefix: '/feed/',
    decorateReply: false,
    setHeaders: (reply) => {
      reply.header('Content-Type', 'image/jpeg');
      reply.header('Cache-Control', 'public, max-age=3600');
    },
  });
}

// ──────────────────────────────────────────────────────────────────────
// Painel
// ──────────────────────────────────────────────────────────────────────

function servirFicheiro(reply: any, nome: string, contentType: string) {
  const filePath = path.join(API_DIR, nome);
  if (!fs.existsSync(filePath)) {
    reply.status(404).send(`Ficheiro não encontrado: ${nome}`);
    return;
  }
  reply.type(contentType);
  return fs.readFileSync(filePath);
}

function registarPainel() {
  app.get('/', (req, reply) => servirFicheiro(reply, 'panel.html', 'text/html; charset=utf-8'));
  app.get('/panel.css', (req, reply) => servirFicheiro(reply, 'panel.css', 'text/css; charset=utf-8'));
  app.get('/panel.js', (req, reply) => servirFicheiro(reply, 'panel.js', 'application/javascript; charset=utf-8'));
}

// ──────────────────────────────────────────────────────────────────────
// API: health + status
// ──────────────────────────────────────────────────────────────────────

function registarHealth() {
  app.get('/api/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));
}

function registarStatus() {
  app.get('/api/status', async () => {
    try {
      const produtos = db.prepare('SELECT status, COUNT(*) as c FROM products WHERE removed_from_ml = 0 GROUP BY status').all() as any[];
      const byStatus: Record<string, number> = {};
      for (const r of produtos) byStatus[r.status] = r.c;

      const renders = db.prepare('SELECT status, COUNT(*) as c FROM renders GROUP BY status').all() as any[];
      const byRender: Record<string, number> = {};
      for (const r of renders) byRender[r.status] = r.c;

      return {
        pending: byStatus.PENDING ?? 0,
        ready: byStatus.READY ?? 0,
        posted: byStatus.POSTED ?? 0,
        cooldown: byStatus.COOLDOWN ?? 0,
        archived: byStatus.ARCHIVED ?? 0,
        failed: byStatus.FAILED ?? 0,
        renders_ready: byRender.READY ?? 0,
        renders_posted: byRender.POSTED ?? 0,
      };
    } catch (err) {
      return { error: (err as Error).message };
    }
  });
}

// ──────────────────────────────────────────────────────────────────────
// API: timeline
// ──────────────────────────────────────────────────────────────────────

type Slot = {
  id: number;
  nome: string;
  janela_inicio: string;
  janela_fim: string;
  cota_reels: number;
  cota_feed: number;
  ativo: number;
};

function registarTimeline() {
  app.get('/api/timeline', async () => {
    try {
      const slots = db.prepare(`
        SELECT id, nome, janela_inicio, janela_fim, cota_reels, cota_feed, ativo
        FROM schedule_slots WHERE ativo = 1 ORDER BY janela_inicio
      `).all() as Slot[];

      const agora = new Date();
      const horaAtual = agora.getHours() * 60 + agora.getMinutes();

      function paraMinutos(hhmm: string): number {
        const [h, m] = hhmm.split(':').map(Number);
        return h * 60 + m;
      }

      let turnoAtual: Slot | null = null;
      let proximoTurno: Slot | null = null;
      let minutosAteProximo = 0;

      for (const s of slots) {
        const ini = paraMinutos(s.janela_inicio);
        const fim = paraMinutos(s.janela_fim);
        if (horaAtual >= ini && horaAtual < fim) {
          turnoAtual = s;
          break;
        }
      }

      if (turnoAtual) {
        const idx = slots.indexOf(turnoAtual);
        if (idx >= 0 && idx < slots.length - 1) {
          proximoTurno = slots[idx + 1];
          minutosAteProximo = paraMinutos(proximoTurno.janela_inicio) - horaAtual;
        } else {
          proximoTurno = slots[0];
          minutosAteProximo = (24 * 60 - horaAtual) + paraMinutos(proximoTurno.janela_inicio);
        }
      } else {
        let menorDelta = Infinity;
        for (const s of slots) {
          const ini = paraMinutos(s.janela_inicio);
          let delta = ini - horaAtual;
          if (delta < 0) delta += 24 * 60;
          if (delta < menorDelta) {
            menorDelta = delta;
            proximoTurno = s;
          }
        }
        minutosAteProximo = menorDelta === Infinity ? 0 : menorDelta;
      }

      const postsHoje = db.prepare(`
        SELECT COUNT(*) as c FROM renders
        WHERE status = 'POSTED' AND date(posted_at) = date('now')
      `).get() as any;

      let postsNoTurno = { total: 0, reels: 0, feed: 0 };
      if (turnoAtual) {
        const ini = turnoAtual.janela_inicio;
        const fim = turnoAtual.janela_fim;
        const noTurno = db.prepare(`
          SELECT
            COUNT(*) as total,
            SUM(CASE WHEN reel_path LIKE '%reel-%' THEN 1 ELSE 0 END) as reels,
            SUM(CASE WHEN reel_path LIKE '%feed-%' THEN 1 ELSE 0 END) as feed
          FROM renders
          WHERE status = 'POSTED'
            AND date(posted_at) = date('now')
            AND time(posted_at) >= ?
            AND time(posted_at) < ?
        `).get(ini, fim) as any;

        postsNoTurno = {
          total: noTurno.total ?? 0,
          reels: noTurno.reels ?? 0,
          feed: noTurno.feed ?? 0,
        };
      }

      const ultima = db.prepare(`
        SELECT posted_at FROM renders WHERE status = 'POSTED'
        ORDER BY posted_at DESC LIMIT 1
      `).get() as any;

      let proximaPublicacao: string;
      if (turnoAtual) {
        const proximos15 = Math.ceil((agora.getMinutes() + 1) / 15) * 15;
        const prox = new Date(agora);
        prox.setMinutes(proximos15, 0, 0);
        proximaPublicacao = prox.toISOString();
      } else if (proximoTurno) {
        const [h, m] = proximoTurno.janela_inicio.split(':').map(Number);
        const prox = new Date(agora);
        if (horaAtual > h * 60 + m) prox.setDate(prox.getDate() + 1);
        prox.setHours(h, m, 0, 0);
        proximaPublicacao = prox.toISOString();
      } else {
        proximaPublicacao = '—';
      }

      return {
        agora: agora.toISOString(),
        turnoAtual: turnoAtual ? {
          nome: turnoAtual.nome,
          inicio: turnoAtual.janela_inicio,
          fim: turnoAtual.janela_fim,
          cota_reels: turnoAtual.cota_reels,
          cota_feed: turnoAtual.cota_feed,
        } : null,
        proximoTurno: proximoTurno ? {
          nome: proximoTurno.nome,
          inicio: proximoTurno.janela_inicio,
          fim: proximoTurno.janela_fim,
          minutosAte: minutosAteProximo,
          tempoTexto: minutosAteProximo > 60
            ? `${Math.floor(minutosAteProximo / 60)}h ${minutosAteProximo % 60}min`
            : `${minutosAteProximo}min`,
        } : null,
        postsHoje: postsHoje.c ?? 0,
        postsNoTurno,
        ultimaPublicacao: ultima?.posted_at ?? null,
        proximaPublicacao,
      };
    } catch (err) {
      return { error: (err as Error).message };
    }
  });
}

// ──────────────────────────────────────────────────────────────────────
// API: tunnel + urls + logs
// ──────────────────────────────────────────────────────────────────────

function registarTunnel() {
  app.get('/api/tunnel', async () => {
    const url = getTunnelUrlAtual();
    return { url: url || null };
  });

  app.get('/api/tunnel/test', async () => {
    let url: string | null = null;
    try {
      const conteudo = fs.readFileSync(path.join(ROOT, '.env'), 'utf-8');
      const match = conteudo.match(/^PUBLIC_VIDEO_BASE_URL=(.+)$/m);
      if (match && match[1].trim()) url = match[1].trim();
    } catch { /* ignore */ }

    if (!url) return { ok: false, error: 'Sem URL configurada' };

    const start = Date.now();
    try {
      const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(8000) });
      const durationMs = Date.now() - start;
      return res.ok
        ? { ok: true, durationMs, status: res.status }
        : { ok: false, error: `HTTP ${res.status}`, durationMs };
    } catch (err) {
      return { ok: false, error: (err as Error).message, durationMs: Date.now() - start };
    }
  });
}

function registarUrls() {
  app.get('/api/urls', async () => {
    const base = process.env.PUBLIC_VIDEO_BASE_URL;
    if (!base) return { urls: [] };
    try {
      const renders = db.prepare(`
        SELECT r.id, r.reel_path, r.status, r.variation, p.name, p.category
        FROM renders r
        JOIN products p ON p.id = r.product_id
        WHERE r.status IN ('READY', 'POSTED')
        ORDER BY r.rendered_at DESC
        LIMIT 50
      `).all() as any[];

      const urls = renders.map((r: any) => {
        const fileName = path.basename(r.reel_path);
        const subDir = fileName.startsWith('story-') ? 'stories' : fileName.startsWith('feed-') ? 'feed' : 'reels';
        return { id: r.id, titulo: `[${r.category}] ${r.name} (var ${r.variation}) — ${r.status}`, url: `${base}/${subDir}/${fileName}` };
      });
      return { urls };
    } catch (err) {
      return { urls: [], error: (err as Error).message };
    }
  });
}

function registarLogs() {
  app.get('/api/logs', (req, reply) => {
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no');
    reply.raw.flushHeaders();

    const backlog = logBuffer.slice(-100);
    for (const entry of backlog) {
      reply.raw.write(`data: ${JSON.stringify(entry)}\n\n`);
    }

    const send = (entry: LogEntry) => {
      reply.raw.write(`data: ${JSON.stringify(entry)}\n\n`);
    };
    sseClients.add(send);

    const heartbeat = setInterval(() => {
      try { reply.raw.write(`: heartbeat\n\n`); } catch { /* ignore */ }
    }, 20_000);

    req.raw.on('close', () => {
      sseClients.delete(send);
      clearInterval(heartbeat);
    });

    log('system', `Painel conectado (${sseClients.size} clientes)`);
  });
}

// ──────────────────────────────────────────────────────────────────────
// API: system (start/stop scheduler)
// ──────────────────────────────────────────────────────────────────────

function registarSystem() {
  app.get('/api/system/status', async () => {
    const running = schedulerProc !== null && !schedulerProc.killed;
    return {
      scheduler: running ? 'running' : 'stopped',
      pid: running ? schedulerProc!.pid : null,
    };
  });

  app.post('/api/system/start', async () => {
    if (schedulerProc && !schedulerProc.killed) {
      log('warn', 'Scheduler ja esta a correr');
      return { ok: true, message: 'Scheduler ja estava ativo' };
    }

    log('system', 'A arrancar scheduler...');

    try {
      schedulerProc = spawn('npx', ['tsx', 'src/api/scheduler.ts'], {
        cwd: ROOT,
        shell: true,
        windowsHide: true,
      });

      schedulerProc.stdout?.on('data', (data: Buffer) => {
        for (const linha of data.toString().split(/\r?\n/)) {
          if (linha.trim()) log('info', `[scheduler] ${linha.trim()}`);
        }
      });

      schedulerProc.stderr?.on('data', (data: Buffer) => {
        for (const linha of data.toString().split(/\r?\n/)) {
          if (linha.trim()) log('warn', `[scheduler] ${linha.trim()}`);
        }
      });

      schedulerProc.on('close', (code) => {
        log('system', `Scheduler terminou (exit ${code})`);
        schedulerProc = null;
      });

      try {
        execSync('tailscale funnel --bg 3000', { cwd: ROOT, stdio: 'ignore', timeout: 5000 });
        log('ok', 'Tailscale Funnel ativo');
      } catch {
        log('warn', 'Tailscale Funnel pode nao estar ativo');
      }

      return { ok: true, message: 'Sistema arrancado' };
    } catch (err) {
      log('error', `Erro ao arrancar: ${(err as Error).message}`);
      return { ok: false, error: (err as Error).message };
    }
  });

  app.post('/api/system/stop', async () => {
    if (!schedulerProc || schedulerProc.killed) {
      return { ok: true, message: 'Scheduler ja estava parado' };
    }

    log('system', 'A parar scheduler...');
    try {
      schedulerProc.kill();
      schedulerProc = null;
      log('ok', 'Scheduler parado');
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });
}

// ──────────────────────────────────────────────────────────────────────
// API: janelas
// ──────────────────────────────────────────────────────────────────────

function registarWindows() {
  app.post('/api/windows/show', async () => {
    try {
      execSync('powershell -ExecutionPolicy Bypass -File scripts\\show-windows.ps1', { cwd: ROOT, stdio: 'ignore' });
      log('system', 'Janelas trazidas para primeiro plano');
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  app.post('/api/windows/hide', async () => {
    try {
      execSync('powershell -ExecutionPolicy Bypass -File scripts\\hide-windows.ps1', { cwd: ROOT, stdio: 'ignore' });
      log('system', 'Janelas minimizadas');
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });
}

// ──────────────────────────────────────────────────────────────────────
// API: run job
// ──────────────────────────────────────────────────────────────────────

type JobResult = { exitCode: number; durationMs: number; job: string };

function runJob(job: JobName): Promise<JobResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    const fileMap: Record<JobName, string> = {
      harvest: 'src/jobs/harvester.ts',
      render: 'src/jobs/renderer.ts',
      publish: 'src/jobs/publisher.ts',
      refresh: 'src/jobs/refresh-ml.ts',
      cleanup: 'src/jobs/cleanup.ts',
    };
    const filePath = path.join(ROOT, fileMap[job]);

    log('system', `A executar job: ${job}`);

    const proc = spawn('npx', ['tsx', filePath], { cwd: ROOT, shell: true, windowsHide: true });
    const timeout = setTimeout(() => {
      log('error', `Job ${job} excedeu timeout`);
      try { proc.kill(); } catch { /* ignore */ }
    }, JOB_TIMEOUT_MS);

    proc.stdout.on('data', (data: Buffer) => {
      for (const linha of data.toString().split(/\r?\n/)) {
        if (linha.trim()) log('info', `[${job}] ${linha.trim()}`);
      }
    });
    proc.stderr.on('data', (data: Buffer) => {
      for (const linha of data.toString().split(/\r?\n/)) {
        if (linha.trim()) log('warn', `[${job}] ${linha.trim()}`);
      }
    });
    proc.on('error', (err) => {
      clearTimeout(timeout);
      log('error', `Erro em ${job}: ${err.message}`);
      resolve({ exitCode: -1, durationMs: Date.now() - start, job });
    });
    proc.on('close', (code) => {
      clearTimeout(timeout);
      const durationMs = Date.now() - start;
      const exitCode = code ?? -1;
      if (exitCode === 0) log('ok', `Job ${job} concluído (${(durationMs / 1000).toFixed(1)}s)`);
      else log('error', `Job ${job} terminou com código ${exitCode}`);
      resolve({ exitCode, durationMs, job });
    });
  });
}

function registarRun() {
  app.post<{ Params: { job: string } }>('/api/run/:job', async (req, reply) => {
    const { job } = req.params;
    if (!JOBS_VALIDOS.includes(job as JobName)) {
      reply.status(400);
      return { error: `Job inválido: "${job}"` };
    }
    return runJob(job as JobName);
  });
}

// ──────────────────────────────────────────────────────────────────────
// WEBHOOK INSTAGRAM — Comentários + DM automática
// ──────────────────────────────────────────────────────────────────────

/**
 * Lê as credenciais do Instagram do processo (em runtime).
 * Necessário porque o dotenv carrega o .env depois do módulo ser importado.
 */
function lerCredenciaisIG(): { igUserId: string; pageToken: string } {
  const igUserId = process.env.IG_USER_ID ?? '';
  const pageToken = process.env.PAGE_TOKEN ?? '';
  return { igUserId, pageToken };
}

/**
 * Envia DM como resposta privada a um comentário.
 * Endpoint: POST /{ig-user-id}/messages
 * Parâmetro: recipient.comment_id (em vez de recipient.id)
 *
 * Regra da Meta: 1 DM por comentário, dentro de 7 dias.
 */
async function enviarDMComentario(commentId: string, mensagem: string): Promise<string> {
  const { igUserId, pageToken } = lerCredenciaisIG();

  if (!igUserId || !pageToken) {
    throw new Error('IG_USER_ID ou PAGE_TOKEN em falta no .env');
  }

  const res = await fetch(`${IG_GRAPH}/${igUserId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { comment_id: commentId },
      message: { text: mensagem },
      access_token: pageToken,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`IG DM falhou: HTTP ${res.status} - ${err.slice(0, 300)}`);
  }

  const data = (await res.json()) as { message_id?: string };
  return data.message_id ?? '';
}

/**
 * Procura o produto associado a um media_id do Instagram.
 * Primeiro tenta pelo ig_media_id do render. Se não encontrar,
 * faz fallback para o produto mais recente publicado.
 */
function encontrarProdutoPorMedia(mediaId: string): any | null {
  const render = db.prepare(`
    SELECT r.*, p.affiliate_url, p.name
    FROM renders r
    JOIN products p ON p.id = r.product_id
    WHERE r.ig_media_id = ?
    LIMIT 1
  `).get(mediaId) as any;

  if (render) {
    return {
      name: render.name,
      affiliate_url: render.affiliate_url,
    };
  }

  const ultimo = db.prepare(`
    SELECT p.name, p.affiliate_url
    FROM products p
    WHERE p.status IN ('POSTED', 'COOLDOWN')
      AND p.affiliate_url IS NOT NULL
    ORDER BY p.last_posted_at DESC
    LIMIT 1
  `).get() as any;

  return ultimo ?? null;
}

/**
 * Processa um comentário recebido.
 * Se contém palavra-chave, envia DM com link do produto.
 */
/**
 * Responde publicamente a um comentário (reply).
 * POST /{comment-id}/replies
 */
async function responderComentario(commentId: string, mensagem: string): Promise<string> {
  const { pageToken } = lerCredenciaisIG();
  if (!pageToken) throw new Error('PAGE_TOKEN em falta');

  const res = await fetch(`${IG_GRAPH}/${commentId}/replies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: mensagem,
      access_token: pageToken,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`IG reply falhou: HTTP ${res.status} - ${err.slice(0, 300)}`);
  }

  const data = (await res.json()) as { id?: string };
  return data.id ?? '';
}
async function processarComentario(comment: any): Promise<void> {
  const commentId = comment.id;
  const commentText = (comment.text ?? '').toLowerCase();
  const mediaId = comment.media?.id;
  const username = comment.from?.username ?? '?';

  log('system', `Comentario de @${username}: "${comment.text}"`);

  const temPalavraChave = PALAVRAS_CHAVE.some((p) => commentText.includes(p));
  if (!temPalavraChave) {
    log('info', `Sem palavra-chave — ignorado`);
    return;
  }

  log('ok', `Palavra-chave detectada! A procurar produto...`);

  const produto = mediaId ? encontrarProdutoPorMedia(mediaId) : null;
  if (!produto || !produto.affiliate_url) {
    log('warn', `Produto nao encontrado ou sem link de afiliado`);
    return;
  }

  log('ok', `Produto: ${produto.name}`);
  log('ok', `Link: ${produto.affiliate_url}`);

  const nomeCurto = produto.name.split(/\s+/).slice(0, 5).join(' ');
  const mensagem = [
    `Oi! Aqui esta o link do ${nomeCurto}:`,
    '',
    produto.affiliate_url,
    '',
    'Aproveita! Qualquer duvida e so chamar 😊',
  ].join('\n');

  try {
    const msgId = await enviarDMComentario(commentId, mensagem);
    log('ok', `DM enviada para @${username} (${msgId})`);

    // Responder publicamente ao comentário
    try {
      const replyId = await responderComentario(commentId, 'Prontinho! Enviei o link com desconto no teu privado 😉');
      log('ok', `Resposta publica em @${username} (${replyId})`);
    } catch (err) {
      log('warn', `Falha ao responder publicamente: ${(err as Error).message}`);
    }
  } catch (err) {
    log('error', `Falha ao enviar DM: ${(err as Error).message}`);
  }
}

function registarWebhook() {
  // Verificação (GET) — Meta chama isto uma vez ao configurar
  app.get('/api/instagram/webhook', async (req, reply) => {
    const query = req.query as any;
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
      log('ok', 'Webhook verificado pelo Meta');
      reply.type('text/plain');
      return challenge;
    }

    log('warn', 'Webhook: token de verificacao errado');
    reply.status(403).send('Forbidden');
  });

  // Notificações (POST) — Meta envia comentários novos
  app.post('/api/instagram/webhook', async (req, reply) => {
    reply.status(200).send('EVENT_RECEIVED');

    try {
      const body = req.body as any;

      if (body.object !== 'instagram') {
        return;
      }

      for (const entry of body.entry ?? []) {
        for (const change of entry.changes ?? []) {
          if (change.field === 'comments') {
            await processarComentario(change.value);
          }
        }
      }
    } catch (err) {
      log('error', `Webhook erro: ${(err as Error).message}`);
    }
  });
}

// ──────────────────────────────────────────────────────────────────────
// Arranque
// ──────────────────────────────────────────────────────────────────────

async function start() {
  console.log('══════════════════════════════════════════════');
  console.log('  SPIDPOST - SERVIDOR');
  console.log('══════════════════════════════════════════════');
  console.log('');

  await registarStatic();

  registarPainel();
  registarHealth();
  registarStatus();
  registarTimeline();
  registarTunnel();
  registarUrls();
  registarLogs();
  registarSystem();
  registarWindows();
  registarRun();
  registarWebhook();

  try {
    const address = await app.listen({ port: PORT, host: HOST });
    log('system', `Servidor rodando em ${address}`);
    log('system', `Painel:  http://localhost:${PORT}`);
    log('system', `Webhook: /api/instagram/webhook`);
    log('system', 'Pronto.');
  } catch (err) {
    console.error('Erro ao arrancar servidor:', err);
    process.exit(1);
  }
}

start();