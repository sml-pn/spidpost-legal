/**
 * gemini.ts
 * ──────────────────────────────────────────────────────────────────────
 * Geração de roteiros com CTA "Comenta QUERO" (substitui "link na bio").
 * ──────────────────────────────────────────────────────────────────────
 */

import { env, GEMINI_MODELOS } from '../lib/env.js';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const TIMEOUT_MS = 45_000;
const TENTATIVAS_POR_MODELO = 4;
const BACKOFF = [5_000, 15_000, 30_000, 60_000];

export type Variacao = 'A' | 'B' | 'C';
export type Estilo = 'moderno' | 'elegante' | 'vibrante' | 'tecnico' | 'aconchegante';

export type Roteiro = {
  fala: string;
  legenda: string;
  hashtags: string[];
  estilo: Estilo;
  cor: string;
  selo: string;
  beneficios: string[];
  cta: string;
  fallback?: boolean;
};

type GerarParams = {
  nome: string;
  preco: number;
  precoOriginal?: number | null;
  categoria: string;
  variacao: Variacao;
};

const ANGULOS: Record<Variacao, string> = {
  A: 'Educacional - explique 2 ou 3 beneficios concretos do produto',
  B: 'Economico - foque no desconto e na economia gerada',
  C: 'Storytelling - conte uma mini historia de 18 segundos',
};

const ESTILOS_VALIDOS: Estilo[] = ['moderno', 'elegante', 'vibrante', 'tecnico', 'aconchegante'];

const CORES_POR_ESTILO: Record<Estilo, string> = {
  moderno: '#00ff88',
  elegante: '#d4af37',
  vibrante: '#ff2d55',
  tecnico: '#00d9ff',
  aconchegante: '#e67e22',
};

// ──────────────────────────────────────────────────────────────────────
// Fallback — template estático
// ──────────────────────────────────────────────────────────────────────

function roteiroFallback(params: GerarParams): Roteiro {
  const { nome, preco, categoria } = params;
  const nomeCurto = nome.split(/\s+/).slice(0, 5).join(' ');
  const precoFmt = `R$ ${preco.toFixed(2).replace('.', ',')}`;

  const estiloPorCategoria: Record<string, Estilo> = {
    eletronicos: 'moderno', casa: 'aconchegante', moda: 'elegante', beleza: 'elegante',
    ferramentas: 'tecnico', automotivo: 'tecnico', esporte: 'vibrante',
    pet: 'aconchegante', brinquedos: 'vibrante', games: 'vibrante', solar: 'tecnico',
  };

  const estilo = estiloPorCategoria[categoria] ?? 'moderno';

  return {
    fala: `${nomeCurto} por apenas ${precoFmt}! Comenta QUERO que eu envio o link no teu privado.`,
    legenda: `${nomeCurto} por ${precoFmt}!`,
    hashtags: ['#promocao', '#ofertas', '#achadinhos', `#${categoria}`, '#desconto'],
    estilo,
    cor: CORES_POR_ESTILO[estilo],
    selo: 'OFERTA',
    beneficios: ['Otimo custo-beneficio', 'Entrega rapida', 'Qualidade garantida'],
    cta: 'Comenta QUERO',
    fallback: true,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Prompt
// ──────────────────────────────────────────────────────────────────────

function montarPrompt(params: GerarParams): string {
  const { nome, preco, precoOriginal, categoria, variacao } = params;
  const angulo = ANGULOS[variacao];

  return `Voce e um copywriter de afiliados brasileiro. Gere um roteiro de video de 18 segundos para Instagram Reels.

Produto: ${nome}
Preco: R$ ${preco.toFixed(2).replace('.', ',')}
${precoOriginal ? `Preco original: R$ ${precoOriginal.toFixed(2).replace('.', ',')}` : ''}
Categoria: ${categoria}

Angulo: ${angulo}

REGRA CRITICA: NUNCA menciones "link na bio" ou "link abaixo". O unico CTA permitido e "Comenta QUERO".

REGRA DE PRECO (OBRIGATORIA): Quando falares o preco na "fala", dize-lo COMPLETO, incluindo os centavos.
Exemplos corretos:
  R$ 26,90 -> "vinte e seis reais e noventa centavos"
  R$ 149,99 -> "cento e quarenta e nove reais e noventa e nove centavos"
  R$ 95,00 -> "noventa e cinco reais" (sem centavos quando sao zeros)
Exemplos ERRADOS (nunca facas):
  R$ 26,90 -> "vinte e seis reais" (falta os centavos)
  R$ 26,90 -> "vinte e sete reais" (arredondado)
  R$ 149,99 -> "cento e cinquenta reais" (arredondado)

Regras:
- "fala"         : maximo 45 palavras. DEVE terminar com "Comenta QUERO que eu envio o link no teu privado."
- "legenda"      : descricao do produto (max 120 caracteres). NAO incluir CTA (sera adicionado automaticamente)
- "hashtags"     : 5 hashtags relevantes (com #)
- "selo"         : SELO curto em MAIUSCULAS (max 12 chars). Ex: "OFERTA", "SUPER DESCONTO"
- "beneficios"   : array com 2-3 bullets CURTOS (max 32 chars cada)
- "cta"          : sempre exatamente "Comenta QUERO"

Estilo visual: moderno | elegante | vibrante | tecnico | aconchegante

Responda APENAS com JSON valido, sem markdown:
{"fala":"...","legenda":"...","hashtags":["#a","#b","#c","#d","#e"],"estilo":"tecnico","cor":"#00d9ff","selo":"OFERTA","beneficios":["B1","B2","B3"],"cta":"Comenta QUERO"}`;
}

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

async function fetchComTimeout(url: string, options: RequestInit, timeout: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function extrairTexto(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const obj = data as { steps?: unknown[] };
  if (!Array.isArray(obj.steps)) return '';
  for (const step of obj.steps) {
    if (!step || typeof step !== 'object') continue;
    const s = step as { type?: string; content?: unknown };
    if (s.type !== 'model_output') continue;
    const content = s.content;
    if (!content) continue;
    if (Array.isArray(content)) {
      const texto = content.map((c: any) => (c && typeof c === 'object' && 'text' in c ? String(c.text ?? '') : '')).join('');
      if (texto.trim()) return texto;
    }
    if (typeof content === 'string' && content.trim()) return content;
  }
  return '';
}

function validarCor(cor: unknown): string {
  const s = String(cor ?? '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  return '#00ff88';
}

function validarEstilo(estilo: unknown): Estilo {
  const s = String(estilo ?? '').trim().toLowerCase();
  if (ESTILOS_VALIDOS.includes(s as Estilo)) return s as Estilo;
  return 'moderno';
}

function validarRoteiro(obj: unknown): Roteiro | null {
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  const fala = String(o.fala ?? '').trim();
  const legenda = String(o.legenda ?? '').trim();
  const hashtags: string[] = Array.isArray(o.hashtags)
    ? (o.hashtags as unknown[]).map((h) => String(h).trim()).filter((h) => h.startsWith('#'))
    : [];
  if (fala.length < 20 || legenda.length < 10) return null;

  const beneficios: string[] = Array.isArray(o.beneficios)
    ? (o.beneficios as unknown[]).map((b) => String(b).trim()).filter((b) => b.length > 0 && b.length <= 40).slice(0, 3)
    : [];

  return {
    fala, legenda, hashtags,
    estilo: validarEstilo(o.estilo),
    cor: validarCor(o.cor),
    selo: String(o.selo ?? 'OFERTA').toUpperCase().slice(0, 14).trim() || 'OFERTA',
    beneficios,
    cta: 'Comenta QUERO', // força sempre
  };
}

function parseRoteiro(texto: string): Roteiro | null {
  const limpo = texto.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  try { return validarRoteiro(JSON.parse(limpo)); }
  catch {
    const m = limpo.match(/\{[\s\S]*\}/);
    if (m) { try { return validarRoteiro(JSON.parse(m[0])); } catch { return null; } }
    return null;
  }
}

type Resultado =
  | { ok: true; roteiro: Roteiro }
  | { ok: false; motivo: 'rate_limit' | 'erro'; detalhe: string };

async function chamarModelo(modelo: string, prompt: string): Promise<Resultado> {
  for (let t = 1; t <= TENTATIVAS_POR_MODELO; t++) {
    try {
      const res = await fetchComTimeout(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body: JSON.stringify({ model: modelo, input: prompt }),
      }, TIMEOUT_MS);

      if (res.status === 429) return { ok: false, motivo: 'rate_limit', detalhe: 'HTTP 429' };

      if (res.status >= 500) {
        if (t < TENTATIVAS_POR_MODELO) {
          const espera = BACKOFF[t - 1] ?? 60_000;
          console.log(`  [gemini] ${modelo}: HTTP ${res.status}, retry ${t}/${TENTATIVAS_POR_MODELO} em ${espera / 1000}s...`);
          await new Promise((r) => setTimeout(r, espera));
          continue;
        }
        return { ok: false, motivo: 'erro', detalhe: `HTTP ${res.status}` };
      }

      if (!res.ok) return { ok: false, motivo: 'erro', detalhe: `HTTP ${res.status}` };

      const data = await res.json();
      const texto = extrairTexto(data);
      if (!texto) return { ok: false, motivo: 'erro', detalhe: 'vazio' };

      const roteiro = parseRoteiro(texto);
      if (!roteiro) return { ok: false, motivo: 'erro', detalhe: 'JSON invalido' };
      return { ok: true, roteiro };
    } catch (err) {
      const msg = (err as Error).message;
      if (t < TENTATIVAS_POR_MODELO) {
        const espera = BACKOFF[t - 1] ?? 60_000;
        console.log(`  [gemini] ${modelo}: ${msg.slice(0, 60)}, retry ${t}/${TENTATIVAS_POR_MODELO} em ${espera / 1000}s...`);
        await new Promise((r) => setTimeout(r, espera));
        continue;
      }
      return { ok: false, motivo: 'erro', detalhe: msg };
    }
  }
  return { ok: false, motivo: 'erro', detalhe: 'esgotou tentativas' };
}

export async function gerarRoteiro(params: GerarParams): Promise<Roteiro> {
  const prompt = montarPrompt(params);
  const falhas: string[] = [];

  for (const modelo of GEMINI_MODELOS) {
    console.log(`  [gemini] Tentando ${modelo}...`);
    const resultado = await chamarModelo(modelo, prompt);

    if (resultado.ok) {
      console.log(`  [gemini] OK via ${modelo}`);
      console.log(`  [gemini] Estilo: ${resultado.roteiro.estilo} | Cor: ${resultado.roteiro.cor}`);
      return resultado.roteiro;
    }

    if (resultado.motivo === 'rate_limit') {
      console.log(`  [gemini] ${modelo}: rate limit, proximo modelo...`);
      falhas.push(`${modelo}: rate_limit`);
      continue;
    }
    console.log(`  [gemini] ${modelo}: ${resultado.detalhe.slice(0, 80)}`);
    falhas.push(`${modelo}: ${resultado.detalhe.slice(0, 60)}`);
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  GEMINI OFFLINE — usando template fallback');
  console.log('═══════════════════════════════════════════════════════════');

  return roteiroFallback(params);
}