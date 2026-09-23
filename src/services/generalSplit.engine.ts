/**
 * Motor do Racha Geral (GENERAL_SPLIT) — puro: sem Prisma, sem I/O, sem Date/random.
 * Dinheiro em centavos inteiros; porcentagem em basis points (10.000 = 100%). O
 * cálculo nunca passa por float, e a mesma entrada devolve sempre a mesma saída.
 */

/** 100% em basis points. Toda porcentagem do racha geral é inteira nesta base. */
export const BPS_TOTAL = 10_000;

/** Um participante na ordem de entrada. `sharePercentBps` null = flutuante. */
export type SplitParticipantInput = {
  orderId: string;
  userId: string;
  sharePercentBps: number | null;
};

export type SplitShare = { orderId: string; amountDueCents: number };

export type ComputeSharesInput = {
  totalAmountCents: number;
  /** JÁ ordenada por (createdAt, id). A ordem decide quem leva o resíduo. */
  participants: SplitParticipantInput[];
  creatorUserId: string;
};

export type QuoteInput = {
  totalAmountCents: number;
  participantCount: number;
  /** Flutuantes ativos EXCLUINDO quem está perguntando (RN-15). */
  floatingCount: number;
  pinnedBps: number;
};

export type JoinerQuote = {
  participantsAfter: number;
  /** ESTIMATIVA (erro <= ceil(k/2) centavos, k = fixados). Nunca persistir. */
  shareCentsIfFloating: number;
  /** Só exibição, 2 casas: a fatia que `shareCentsIfFloating` representa de T. */
  sharePercentIfFloating: number;
  minBps: number;
  maxBps: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Quanto um fixado paga. Meio-para-cima em aritmética inteira (seção 3.6). */
export function pinnedCents(totalAmountCents: number, bps: number): number {
  const total = Math.max(0, Math.round(totalAmountCents));
  const b = clamp(Math.round(bps), 0, BPS_TOTAL);
  const numerator = total * b;
  const quotient = Math.floor(numerator / BPS_TOTAL);
  const rest = numerator % BPS_TOTAL;
  return rest * 2 >= BPS_TOTAL ? quotient + 1 : quotient;
}

/** Piso da porcentagem: o que a pessoa pagaria entrando flutuante agora. */
export function minBpsForNextJoiner(input: {
  pinnedBps: number;
  floatingCount: number;
}): number {
  const remaining = BPS_TOTAL - clamp(input.pinnedBps, 0, BPS_TOTAL);
  const floats = Math.max(0, Math.floor(input.floatingCount));
  return Math.floor(remaining / (floats + 1));
}

/** Cotação O(1) para card e lista. Estimativa declarada; não vira cobrança. */
export function quoteForJoiner(input: QuoteInput): JoinerQuote {
  const total = Math.max(0, Math.round(input.totalAmountCents));
  const pinned = clamp(input.pinnedBps, 0, BPS_TOTAL);
  const floats = Math.max(0, Math.floor(input.floatingCount));
  const minBps = minBpsForNextJoiner({ pinnedBps: pinned, floatingCount: floats });
  const maxBps = BPS_TOTAL - pinned;
  // Aproximação O(1) declarada (I-8): usa o agregado pinnedBps, não a soma dos fixados.
  const remainder = Math.max(0, total - pinnedCents(total, pinned));
  const shareCents = Math.floor(remainder / (floats + 1));
  // O percentual exibido sai do dinheiro cotado, não do piso: são coisas diferentes.
  const percent = total > 0 ? Math.round((shareCents * BPS_TOTAL) / total) / 100 : 0;
  return {
    participantsAfter: Math.max(0, Math.floor(input.participantCount)) + 1,
    // ESTIMATIVA: o valor real de quem entra sai de `computeShares` depois da linha existir.
    shareCentsIfFloating: shareCents,
    sharePercentIfFloating: percent,
    minBps,
    maxBps,
  };
}

/**
 * Rateio por maior resto com desempate pelo MAIOR índice (o "último fixado" da
 * RN-G7). Fecha `total` exatamente, sem float, sem negativos.
 */
function rateioPorMaiorResto(total: number, weights: number[]): number[] {
  const W = weights.reduce((a, w) => a + w, 0);
  if (W <= 0) return weights.map(() => 0);
  const base = weights.map((w) => Math.floor((total * w) / W));
  let sobra = total - base.reduce((a, v) => a + v, 0);
  const ordem = weights
    .map((w, i) => ({ i, resto: (total * w) % W }))
    .sort((a, b) => b.resto - a.resto || b.i - a.i);
  for (const { i } of ordem) {
    if (sobra <= 0) break;
    base[i] += 1;
    sobra -= 1;
  }
  return base;
}

/** Dono do resíduo (Caminho A): criador se flutuante, senão o primeiro flutuante. */
function escolheDonoDoResiduo(
  list: SplitParticipantInput[],
  floatingIdx: number[],
  creatorUserId: string,
): number {
  const creatorFloating = list.findIndex(
    (p) => p.userId === creatorUserId && p.sharePercentBps === null,
  );
  return creatorFloating >= 0 ? creatorFloating : floatingIdx[0];
}

/** Fonte da verdade do dinheiro. Fecha o total exatamente (I-1). */
export function computeShares(input: ComputeSharesInput): SplitShare[] {
  const total = Math.max(0, Math.round(input.totalAmountCents));
  const list = input.participants;
  if (list.length === 0) return [];

  // Fixados primeiro: o valor deles não depende de mais ninguém.
  const pinnedIdx: number[] = [];
  const floatingIdx: number[] = [];
  const amounts = list.map((p, i) => {
    if (p.sharePercentBps === null) {
      floatingIdx.push(i);
      return 0;
    }
    pinnedIdx.push(i);
    return pinnedCents(total, clamp(p.sharePercentBps, 0, BPS_TOTAL));
  });
  const pool = total - amounts.reduce((a, v) => a + v, 0);

  if (floatingIdx.length > 0 && pool > 0) {
    // CAMINHO A — há flutuante e sobra a dividir: o caso normal de todo racha vivo.
    const baseValue = Math.floor(pool / floatingIdx.length);
    for (const i of floatingIdx) amounts[i] = baseValue;
    const diff = pool - baseValue * floatingIdx.length;
    const residueIndex = escolheDonoDoResiduo(list, floatingIdx, input.creatorUserId);
    amounts[residueIndex] += diff;
  } else {
    // CAMINHO B — sem flutuante, ou fixados já cobrem o total: rateio por peso.
    const weights = list.map((p) =>
      p.sharePercentBps === null ? 0 : clamp(p.sharePercentBps, 0, BPS_TOTAL),
    );
    if (weights.reduce((a, w) => a + w, 0) === 0) weights.fill(1);
    const rateado = rateioPorMaiorResto(total, weights);
    for (let i = 0; i < amounts.length; i += 1) amounts[i] = rateado[i];
  }

  return list.map((p, i) => ({ orderId: p.orderId, amountDueCents: amounts[i] }));
}

/** TARGET: valor congelado do i-ésimo participante (resíduo no índice 0). */
export function targetShareCents(
  totalAmountCents: number,
  targetParticipants: number,
  index: number,
): number {
  const total = Math.max(0, Math.round(totalAmountCents));
  const n = Math.max(1, Math.floor(targetParticipants));
  const base = Math.floor(total / n);
  const resto = total - base * n;
  return base + (index === 0 ? resto : 0);
}
