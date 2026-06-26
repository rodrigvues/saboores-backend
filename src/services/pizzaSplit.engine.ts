/**
 * Motor de cálculo do Racha de Pizza (RP6/RP10) — **módulo puro e testável**.
 * Fonte única de: estimativa do participante/card, dashboard do organizador e
 * rateio igualitário do custo real. Tudo em tom de **sugestão** (≈), exceto o
 * rateio do custo real (esse fecha exatamente o total).
 *
 * Dinheiro do rateio é tratado em **centavos inteiros** para evitar erro de
 * ponto flutuante; a estimativa (não-cobrança) usa reais com 2 casas.
 */

export type FlavorVoteInput = {
  flavorId: string;
  name: string;
  isSweet: boolean;
  votes: number;
};

export type PreferenceInput = {
  key: string;
  text: string;
  yes: number;
  no: number;
};

export type RecommendInput = {
  participants: number;
  totalSlices: number;
  slicesPerPizza: number;
  avgLargePizzaPrice: number;
  /** Quantos participantes votaram em ao menos um sabor doce. */
  sweetVoters: number;
  flavorVotes: FlavorVoteInput[];
  preferences: PreferenceInput[];
};

export type FlavorVoteResult = FlavorVoteInput & { suggestedPizzas: number };
export type PreferenceResult = PreferenceInput & { suggestion: number | null };

export type RecommendResult = {
  participants: number;
  totalSlices: number;
  recommendedPizzas: { total: number; savory: number; sweet: number };
  /** Custo estimado em reais (≈). */
  estimatedTotal: number;
  /** Valor por pessoa em reais (≈) ou null quando não há base. */
  estimatedPerPerson: number | null;
  flavorVotes: FlavorVoteResult[];
  preferences: PreferenceResult[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Distribui `total` pizzas inteiras entre itens proporcionalmente aos votos
 * (método do maior resto), garantindo que a soma feche exatamente `total`.
 */
function distributeProportional(
  items: { votes: number }[],
  total: number,
): number[] {
  const sumVotes = items.reduce((acc, item) => acc + item.votes, 0);
  if (total <= 0 || sumVotes <= 0) {
    return items.map(() => 0);
  }

  const raw = items.map((item) => (item.votes / sumVotes) * total);
  const result = raw.map(Math.floor);
  const used = result.reduce((acc, value) => acc + value, 0);
  let remainder = total - used;

  const byFraction = raw
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac);

  let cursor = 0;
  while (remainder > 0 && byFraction.length > 0) {
    result[byFraction[cursor % byFraction.length].index] += 1;
    cursor += 1;
    remainder -= 1;
  }
  return result;
}

/** Sugestão derivada da semântica conhecida da pergunta (`key`). */
function suggestionForKey(key: string, yes: number): number | null {
  switch (key) {
    // Refrigerante: ~1 garrafa de 2L para cada 4 pessoas que querem.
    case "beverage":
      return yes > 0 ? Math.ceil(yes / 4) : 0;
    default:
      return null;
  }
}

/** Recomendação de compra + estimativa (RP6). Não cobra nada — é tudo "≈". */
export function recommendPurchase(input: RecommendInput): RecommendResult {
  const slicesPerPizza = Math.max(1, Math.floor(input.slicesPerPizza || 1));
  const participants = Math.max(0, input.participants);
  const totalSlices = Math.max(0, input.totalSlices);

  const totalPizzas =
    totalSlices > 0 ? Math.ceil(totalSlices / slicesPerPizza) : 0;
  const estimatedTotal = totalPizzas * input.avgLargePizzaPrice;
  const estimatedPerPerson =
    participants > 0 && totalPizzas > 0 ? estimatedTotal / participants : null;

  const sweetPizzas =
    participants > 0
      ? clamp(
          Math.round((totalPizzas * input.sweetVoters) / participants),
          0,
          totalPizzas,
        )
      : 0;
  const savoryPizzas = totalPizzas - sweetPizzas;

  const savory = input.flavorVotes.filter((flavor) => !flavor.isSweet);
  const sweet = input.flavorVotes.filter((flavor) => flavor.isSweet);
  const savoryAlloc = distributeProportional(savory, savoryPizzas);
  const sweetAlloc = distributeProportional(sweet, sweetPizzas);

  const flavorVotes: FlavorVoteResult[] = [
    ...savory.map((flavor, index) => ({
      ...flavor,
      suggestedPizzas: savoryAlloc[index],
    })),
    ...sweet.map((flavor, index) => ({
      ...flavor,
      suggestedPizzas: sweetAlloc[index],
    })),
  ].sort((a, b) => b.votes - a.votes);

  const preferences: PreferenceResult[] = input.preferences.map((pref) => ({
    ...pref,
    suggestion: suggestionForKey(pref.key, pref.yes),
  }));

  return {
    participants,
    totalSlices,
    recommendedPizzas: { total: totalPizzas, savory: savoryPizzas, sweet: sweetPizzas },
    estimatedTotal,
    estimatedPerPerson,
    flavorVotes,
    preferences,
  };
}

export type SplitParticipant = { orderId: string; userId: string };

export type SplitResult = { orderId: string; amountDueCents: number }[];

/**
 * Rateio **igualitário** do custo real (RP10): cada participante paga
 * `floor(total/n)`; o **resíduo de centavos** recai sobre o **organizador**
 * (ou, se ele não participou, sobre o primeiro da lista). `Σ amountDue = total`.
 */
export function splitCostEqually(input: {
  totalCostCents: number;
  participants: SplitParticipant[];
  organizerUserId: string;
}): SplitResult {
  const count = input.participants.length;
  if (count === 0) {
    return [];
  }

  const total = Math.max(0, Math.round(input.totalCostCents));
  const base = Math.floor(total / count);
  const remainder = total - base * count;

  let residueIndex = input.participants.findIndex(
    (participant) => participant.userId === input.organizerUserId,
  );
  if (residueIndex < 0) {
    residueIndex = 0;
  }

  return input.participants.map((participant, index) => ({
    orderId: participant.orderId,
    amountDueCents: base + (index === residueIndex ? remainder : 0),
  }));
}
