import { orderRepository } from "../repositories/order.repository.js";

// Cache curto: a ordem da vitrine pode ficar 60s atrás sem prejuízo nenhum.
const CACHE_TTL_MS = 60_000;
// Teto de segurança: é cache, então estourar significa jogar fora, não crescer.
const MAX_ENTRIES = 500;

type Entry = { quantities: Map<string, number>; expiresAt: number };

const cache = new Map<string, Entry>();

const keyOf = (userId: string, typeId: string) => `${userId}:${typeId}`;

class ItemHistoryService {
  /** Quantidades já pedidas por este usuário (item ausente do mapa = zero). */
  async getUserQuantities(params: {
    userId: string;
    typeId: string;
    itemIds: string[];
  }): Promise<Map<string, number>> {
    const key = keyOf(params.userId, params.typeId);
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.quantities;
    }

    const rows = await orderRepository.aggregateUserItemQuantities({
      userId: params.userId,
      itemIds: params.itemIds,
    });
    const quantities = new Map(rows.map((row) => [row.itemId, row.quantity]));

    if (cache.size >= MAX_ENTRIES) cache.clear();
    cache.set(key, { quantities, expiresAt: Date.now() + CACHE_TTL_MS });
    return quantities;
  }

  /** Chamar quando o usuário cria um pedido: o histórico dele mudou. */
  invalidateUser(userId: string) {
    const prefix = `${userId}:`;
    for (const key of cache.keys()) {
      if (key.startsWith(prefix)) cache.delete(key);
    }
  }
}

export const itemHistoryService = new ItemHistoryService();
