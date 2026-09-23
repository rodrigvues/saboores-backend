/**
 * Utilitário puro de dinheiro do backend. Dinheiro novo é centavo inteiro; a
 * borda (DTO) expõe reais como string, que é a convenção da API. Não importa
 * nada do Prisma: quem tem `Prisma.Decimal` converte com `.toString()` antes.
 */

/** Centavo inteiro vira reais com duas casas (ex.: 4290 -> "42.90"). */
export function centsToReais(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Reais (string ou número) vira centavo inteiro, meio-para-cima. */
export function reaisToCents(value: string | number): number {
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** Decimal da API (string ou número) vira centavo inteiro. Somar em centavo
 *  evita o erro de ponto flutuante que o master proíbe em dinheiro. */
export function decimalToCents(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}
