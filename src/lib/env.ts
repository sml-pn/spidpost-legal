/**
 * env.ts
 * ──────────────────────────────────────────────────────────────────────
 * Carrega e valida as variáveis de ambiente do .env usando Zod.
 *
 * - Se alguma variável obrigatória estiver faltando, o processo para com
 *   mensagem clara.
 * - Também exporta a cadeia de fallback de modelos Gemini, ordenada do
 *   mais capaz (menor cota) ao menos capaz (maior cota).
 * ──────────────────────────────────────────────────────────────────────
 */

import dotenv from 'dotenv';
dotenv.config({ override: true });
import { z } from 'zod';

const schema = z.object({
  // ─── Mercado Livre ───
  ML_CLIENT_ID: z.string().min(1),
  ML_CLIENT_SECRET: z.string().min(1),
  ML_REDIRECT_URI: z.string().url(),
  ML_USER_ID: z.string().min(1),
  ML_ACCESS_TOKEN: z.string().min(1),
  ML_REFRESH_TOKEN: z.string().min(1),

  // ─── Meta / Instagram ───
  META_APP_ID: z.string().min(1),
  META_APP_SECRET: z.string().min(1),
  IG_USER_ID: z.string().min(1),
  IG_USERNAME: z.string().optional(),
  PAGE_ID: z.string().min(1),
  PAGE_TOKEN: z.string().min(1),
  USER_TOKEN_LONGO: z.string().min(1),

  // ─── Google AI ───
  GEMINI_API_KEY: z.string().min(1),

  // ─── Google Cloud (opcional por enquanto) ───
  GOOGLE_SERVICE_KEY_FILE: z.string().optional(),
  GOOGLE_SHEETS_ID: z.string().optional(),
  GOOGLE_DRIVE_FOLDER_ID: z.string().optional(),

  // ─── App ───
  NODE_ENV: z.string().default('development'),
  PUBLIC_VIDEO_BASE_URL: z.string().url().optional(),
});

/**
 * Env validado. Se algum campo obrigatório faltar,
 * lança erro no boot (falha rápida e clara).
 */
export const env = schema.parse(process.env);

// ──────────────────────────────────────────────────────────────────────
// Cadeia de fallback de modelos Gemini
//
// Os limites abaixo são do plano Free Tier em 2026. A ordem importa:
// tentamos primeiro os modelos mais capazes e, se atingirem cota diária
// (HTTP 429), caímos para o próximo.
//
// | Modelo                  | RPM | RPD | Papel              |
// |-------------------------|-----|-----|--------------------|
// | gemini-3.8-flash        |  5  | 20  | Mais inteligente   |
// | gemini-3.5-flash        |  5  | 20  | Excelente          |
// | gemini-2.5-flash-lite   | 10  | 20  | Bom                |
// | gemini-3.1-flash-lite   | 15  | 500 | Cota gigante       |
// ──────────────────────────────────────────────────────────────────────
export const GEMINI_MODELOS = [
  'gemini-3.8-flash',
  'gemini-3.5-flash',
  'gemini-2.5-flash',
  'gemini-3.1-flash-lite',
] as const;

export type GeminiModelo = (typeof GEMINI_MODELOS)[number];