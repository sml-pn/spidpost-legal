/**
 * gemini.ts
 * ──────────────────────────────────────────────────────────────────────
 * Geração de roteiros com CTA "Link na bio" (sem pedir comentário).
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
  descricao?: string | null;
  categoria: string;
  variacao: Variacao;
};

const ANGULOS: Record<Variacao, string> = {
  A: 'Educacional - explique 2 ou 3 beneficios concretos do produto',
  B: 'Economico - foque no desconto e na economia gerada',
  C: 'Cenario hipotetico - descreva uma situacao real de uso (sem inventar historia pessoal). Use 2a pessoa ("voce") ou 3a pessoa ("o produto faz").',
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
  const { nome, preco, precoOriginal, categoria, variacao, descricao } = params;
  const nomeCurto = nome.split(/\s+/).slice(0, 5).join(' ');
  const precoFmt = `R$ ${preco.toFixed(2).replace('.', ',')}`;

  const estiloPorCategoria: Record<string, Estilo> = {
    eletronicos: 'moderno', casa: 'aconchegante', moda: 'elegante', beleza: 'elegante',
    ferramentas: 'tecnico', automotivo: 'tecnico', esporte: 'vibrante',
    pet: 'aconchegante', brinquedos: 'vibrante', games: 'vibrante', solar: 'tecnico',
  };

  const estilo = estiloPorCategoria[categoria] ?? 'moderno';

  return {
    fala: `${nomeCurto} por apenas ${precoFmt}! Link na bio! Corre lá.`,
    legenda: `${nomeCurto} por ${precoFmt}!`,
    hashtags: ['#promocao', '#ofertas', '#achadinhos', `#${categoria}`, '#desconto'],
    estilo,
    cor: CORES_POR_ESTILO[estilo],
    selo: 'OFERTA',
    beneficios: ['Otimo custo-beneficio', 'Entrega rapida', 'Qualidade garantida'],
    cta: 'Link na bio',
    fallback: true,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Prompt
// ──────────────────────────────────────────────────────────────────────

function montarPrompt(params: GerarParams): string {
  const { nome, preco, precoOriginal, categoria, variacao, descricao } = params;
  const angulo = ANGULOS[variacao];
  const precoNum = preco.toFixed(2).replace('.', ',');

  return `Voce e um copywriter de elite brasileiro. Seu trabalho e criar um roteiro curto e MAGNÉTICO para Reels.

Produto: ${nome}
Preco Atual: R$ ${precoNum}
${precoOriginal ? `Preco Original: R$ ${precoOriginal.toFixed(2).replace('.', ',')}` : ''}
Categoria: ${categoria}
Descricao: ${descricao || '(sem descricao)'}
Angulo: ${angulo}

REGRAS CRÍTICAS DE INTELIGÊNCIA, VERACIDADE E ÁUDIO:
0. PROIBIDO INVENTAR HISTORIAS PESSOAIS. NUNCA escreva "Passei meses...", "Antes eu...", "Eu fazia...", "Mudei minha vida quando...", "Meu quintal era...", "Eu tinha...", "Sempre sonhei com...", ou qualquer experiência em 1a pessoa. Voce NAO e o consumidor. Voce NAO viveu nada. Descreva o PRODUTO e o BENEFICIO real, nao uma historia ficticia sobre voce.
1. VERACIDADE ABSOLUTA: Se o nome tem "Refletor" ou "Holofote", ele DA LUZ e GASTA energia. NUNCA diga que economiza energia. Se tem "Painel Solar", ai sim fala de economia. Use o bom senso baseado no nome e descricao.
2. GANCHO ÚNICO: PROIBIDO usar as frases: "Quer economizar", "Voce sabia", "Cansado de", "Olha so", "Imagina so", "A conta de luz". Tambem PROIBIDO comecar com "Passei", "Eu", "Meu", "Minha", "Antes eu", "Sempre".
3. PREÇO NA FALA: Escreva o preço POR EXTENSO na "fala" (Ex: "quarenta e tres reais e setenta e sete centavos"). Isso e obrigatorio para o audio.
4. PREÇO NA LEGENDA: Na "legenda", use o formato numerico (Ex: "R$ 43,77").
5. PRONÚNCIA DE SIGLAS: O sintetizador de voz soletra "L-E-D". Para ler naturalmente, escreva "Lédi" na "fala" (Ex: "refletor de Lédi"). Na "legenda", mantenha "LED".
6. Maximo de 50 palavras na fala. Termine EXATAMENTE com: "Link na bio! Corre lá."
7. TOM PROFISSIONAL E AMIGÁVEL: Use linguagem natural, confiante e respeitosa. NUNCA use gírias forçadas, abreviações de internet ("vc", "pq"), ou frases exageradas ("não olha o preço", "vai querer comprar três"). Seja persuasivo sem apelar para impulsividade irracional.

ESTILO DA VARIACAO:
- Variacao A (Educacional): Ensine algo tecnico real.
- Variacao B (Economico): Destaque o desconto (de X por Y), com o preco falado por extenso.
- Variacao C (Cenario): Descreva uma SITUACAO HIPOTETICA de uso em 2a pessoa ("Imagine imprimir pecas em minutos...", "Voce acorda e o cafe ja esta pronto..."). NUNCA use 1a pessoa ("Eu", "Passei", "Meu"). O foco e no que o produto faz para QUEM COMPRA, nao em voce.

Responda APENAS com JSON valido:
{"fala":"...","legenda":"Texto de vendas focado no produto e benefícios. Link na bio para garantir o seu. #hashtag1 #hashtag2 #hashtag3 #hashtag4 #hashtag5","hashtags":["#hashtag1","#hashtag2","#hashtag3","#hashtag4","#hashtag5"],"estilo":"moderno","cor":"#00d9ff","selo":"OFERTA","beneficios":["B1","B2","B3"],"cta":"Link na bio"}`;
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
    cta: 'Link na bio', // fallback
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