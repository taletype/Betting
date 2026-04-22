import type { ExternalMarketAdapter } from "../index";
import { fetchPolymarketGammaMarkets } from "../polymarket/gamma";

export const createPolymarketAdapter = (): ExternalMarketAdapter => ({
  source: "polymarket",
  async listMarkets() {
    const rows = await fetchPolymarketGammaMarkets();
    return rows.map((row) => ({
      ...row.market,
      rawPayload: {
        rawJson: row.rawJson,
        provenance: row.provenance,
      },
    }));
  },
});
