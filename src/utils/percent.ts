/**
 * Fronteira de porcentagem do racha geral: o backend só conhece basis points
 * (inteiros), o fio só conhece porcentagem com 2 casas. Estes helpers são os
 * ÚNICOS lugares onde bps vira % e vice-versa.
 */

/** Basis points → porcentagem do fio, 2 casas. 3333 → 33.33 */
export function bpsToPercent(bps: number): number {
  return Math.round(bps) / 100;
}

/** Porcentagem do fio (2 casas) → basis points inteiros. 33.33 → 3333 */
export function percentToBps(percent: number): number {
  return Math.round(percent * 100);
}

/** Porcentagem na COPY pt-BR (plano 01 §6.2): 3333 → "33,33". */
export function bpsToPercentLabel(bps: number): string {
  return bpsToPercent(bps).toFixed(2).replace(".", ",");
}
