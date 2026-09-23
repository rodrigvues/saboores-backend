/**
 * Taxa de serviço da encomenda — módulo puro e testável. Fonte única do valor
 * cobrado; o frontend tem um espelho literal em `src/utils/money.ts`.
 *
 * Dinheiro em centavos inteiros. O percentual vira pontos-base antes da conta
 * porque `cents * percent / 100` em float erra o empate (1500 a 8,7% = 130,5).
 */

/** Menor e maior percentual aceito. O zod importa daqui, não repete os números. */
export const MIN_SERVICE_FEE_PERCENT = 0.01;
export const MAX_SERVICE_FEE_PERCENT = 100;

/** Taxa em centavos, meio-para-cima, sobre o subtotal dos itens. */
export function serviceFeeCents(subtotalCents: number, percent: number): number {
  if (!Number.isFinite(subtotalCents) || !Number.isFinite(percent)) return 0;
  if (subtotalCents <= 0 || percent <= 0) return 0;
  const bps = Math.round(percent * 100);
  return Math.round((subtotalCents * bps) / 10000);
}

/**
 * Duas casas decimais é regra de negócio (RN-2). Comparar com tolerância, nunca com
 * `Number.isInteger(percent * 100)`: em float `0.07 * 100` dá 7.000000000000001.
 */
export function hasMoreThanTwoDecimals(percent: number): boolean {
  return Math.abs(percent * 100 - Math.round(percent * 100)) > 1e-9;
}
