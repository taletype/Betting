import { createDatabaseClient } from "@bet/db";

interface ExternalMarketRow {
  id: string;
  source: "polymarket" | "kalshi";
  external_id: string;
  title: string;
  status: string;
  best_bid: number | string | null;
  best_ask: number | string | null;
  last_trade_price: number | string | null;
  last_synced_at: Date | string | null;
}

const db = createDatabaseClient();

const toNumber = (value: number | string | null): number | null => {
  if (value === null) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const loadMarkets = async (): Promise<ExternalMarketRow[]> =>
  db.query<ExternalMarketRow>(
    `
      select
        id,
        source,
        external_id,
        title,
        status,
        best_bid,
        best_ask,
        last_trade_price,
        last_synced_at
      from public.external_markets
      order by last_synced_at desc nulls last, updated_at desc
      limit 100
    `,
  );

export default async function ExternalMarketsPage() {
  const markets = await loadMarkets();

  return (
    <main className="stack">
      <section className="hero">
        <h1>External Markets</h1>
        <p>Read-only synced market discovery from Polymarket and Kalshi.</p>
      </section>
      <section className="stack">
        {markets.length === 0 ? (
          <div className="panel muted">No synced external markets yet. Run the external sync job.</div>
        ) : (
          markets.map((market) => (
            <div key={market.id} className="panel stack">
              <div className="muted">{market.source.toUpperCase()}</div>
              <strong>{market.title}</strong>
              <div className="grid">
                <div>
                  <div className="muted">Best bid</div>
                  <div className="metric-sm">{toNumber(market.best_bid) ?? "—"}</div>
                </div>
                <div>
                  <div className="muted">Best ask</div>
                  <div className="metric-sm">{toNumber(market.best_ask) ?? "—"}</div>
                </div>
                <div>
                  <div className="muted">Last trade</div>
                  <div className="metric-sm">{toNumber(market.last_trade_price) ?? "—"}</div>
                </div>
              </div>
              <div className="muted">
                Synced: {market.last_synced_at ? new Date(market.last_synced_at).toISOString() : "never"}
              </div>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
