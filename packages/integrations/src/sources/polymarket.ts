import type { ExternalMarketAdapter, NormalizedExternalTradeTick } from "../index";
import { fetchPolymarketGammaMarkets } from "../polymarket/gamma";
import { fetchPolymarketMarketTrades } from "../polymarket/trades";

const attachRecentTrades = async (
  rows: Awaited<ReturnType<typeof fetchPolymarketGammaMarkets>>,
): Promise<Awaited<ReturnType<ExternalMarketAdapter["listMarkets"]>>> => {
  const conditionIdByExternalId = new Map<string, string>();

  for (const row of rows) {
    const conditionId = row.rawJson && typeof row.rawJson === "object"
      ? (row.rawJson as { conditionId?: unknown }).conditionId
      : undefined;

    if (typeof conditionId === "string" && conditionId.trim()) {
      conditionIdByExternalId.set(row.market.externalId, conditionId.trim());
    }
  }

  let tradesByConditionId = new Map<string, NormalizedExternalTradeTick[]>();
  try {
    tradesByConditionId = await fetchPolymarketMarketTrades([...conditionIdByExternalId.values()]);
  } catch {
    return rows.map((row) => ({
      ...row.market,
      rawPayload: {
        rawJson: row.rawJson,
        provenance: row.provenance,
      },
    }));
  }

  return rows.map((row) => {
    const conditionId = conditionIdByExternalId.get(row.market.externalId);
    const recentTrades = conditionId ? (tradesByConditionId.get(conditionId) ?? []) : [];
    const latestTrade = recentTrades[0] ?? null;
    const latestTradeByOutcomeId = new Map<string, number>();

    for (const trade of recentTrades) {
      if (!trade.outcomeExternalId || latestTradeByOutcomeId.has(trade.outcomeExternalId)) {
        continue;
      }
      latestTradeByOutcomeId.set(trade.outcomeExternalId, trade.price);
    }

    return {
      ...row.market,
      lastTradePrice: latestTrade?.price ?? row.market.lastTradePrice,
      outcomes: row.market.outcomes.map((outcome) => ({
        ...outcome,
        lastPrice: latestTradeByOutcomeId.get(outcome.externalOutcomeId) ?? outcome.lastPrice,
      })),
      recentTrades,
      rawPayload: {
        rawJson: row.rawJson,
        provenance: row.provenance,
      },
    };
  });
};

export const createPolymarketAdapter = (): ExternalMarketAdapter => ({
  source: "polymarket",
  async listMarkets() {
    const rows = await fetchPolymarketGammaMarkets();
    return attachRecentTrades(rows);
  },
});
