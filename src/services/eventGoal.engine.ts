/**
 * Motor da meta de valor da encomenda — puro (sem Prisma, sem I/O). Dinheiro em
 * centavos inteiros; a borda expõe reais como string com 2 casas.
 */

/** Converte reais informados pelo organizador em centavos inteiros. */
export function amountToCents(amount: number): number {
  return Math.round(amount * 100);
}

/** Centavos -> string em reais com 2 casas ("100.00"), padrão dos DTOs. */
export function centsToAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Progresso em % inteiro, 0..100, com teto 100. `reached` força 100. */
export function goalPercent(raisedCents: number, targetCents: number, reached: boolean): number {
  if (reached) return 100; // a meta batida não "desatinge" quando alguém cancela
  if (targetCents <= 0) return 0;
  return Math.min(100, Math.floor((raisedCents / targetCents) * 100));
}

/** Bateu a meta? Alvo <= 0 nunca bate (guarda defensiva). */
export function isGoalReached(raisedCents: number, targetCents: number): boolean {
  if (targetCents <= 0) return false;
  return raisedCents >= targetCents;
}

/** Snapshot do pedido: este pedido compõe a meta? (RN-M3) */
export function resolveCountsTowardGoal(params: {
  hasGoal: boolean;
  alreadyReached: boolean;
  optOut: boolean;
}): boolean {
  return params.hasGoal && !params.alreadyReached && !params.optOut;
}
