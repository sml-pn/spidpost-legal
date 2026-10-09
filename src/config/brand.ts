/**
 * brand.ts
 * Config central de identidade visual do @idealegenial.
 */

export const BG_BASE = "#f5f0e8";
export const TEXT_DARK = "#1a1a1a";
export const TEXT_MEDIUM = "#4a4a4a";
export const TEXT_STARS = "#d4af37";
export const SELO_FIXO = "ACHADINHO";
export const CTA_FIXO = "→ Link na descrição";
export const AVALIACAO = "★★★★★";

export const CATEGORY_TINTS: Record<string, string> = {
  esporte: "#7fb3d5",
  casa: "#f5b971",
  beleza: "#f5a3b8",
  ferramentas: "#8b8b8b",
  brinquedos: "#b399d4",
  moda: "#a8a8a8",
  eletronicos: "#7fb3d5",
  outros: "#a3c9a8",
};

export const CATEGORY_TINT_ALPHA = 0.10;

export function getCategoryTint(categoria?: string | null): string {
  if (!categoria) return CATEGORY_TINTS.outros;
  const key = categoria.toLowerCase().trim();
  return CATEGORY_TINTS[key] ?? CATEGORY_TINTS.outros;
}

export function toFfmpegColor(hex: string): string {
  return "0x" + hex.replace("#", "");
}
