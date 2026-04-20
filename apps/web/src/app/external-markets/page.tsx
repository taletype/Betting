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

const formatDate = (value: Date | string): string =>
  new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Hong_Kong",
  }).format(new Date(value));

const statusTone = (status: string): "neutral" | "success" | "warning" => {
  if (status === "resolved" || status === "closed") {
    return "success";
  }

  if (status === "paused") {
    return "warning";
  }

  return "neutral";
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
        <p>Read-only market snapshots synced from Polymarket and Kalshi.</p>
      </section>
      <section className="stack">
        {markets.length === 0 ? (
          <div className="panel empty-state">No synced external markets yet. Run the external sync job, then refresh.</div>
        ) : (
          markets.map((market) => (
            <div key={market.id} className="panel stack">
              <div className="grid">
                <div className="stack">
                  <div className="badge badge-neutral">{market.source}</div>
                  <strong>{market.title}</strong>
                  <div className={`badge badge-${statusTone(market.status)}`}>{market.status}</div>
                  <div className="muted">External ID: {market.external_id}</div>
                </div>
                <div className="stack">
                  <div className="kv">
                    <span className="kv-key">Best bid</span>
                    <span className="kv-value">{toNumber(market.best_bid) ?? "—"}</span>
                  </div>
                  <div className="kv">
                    <span className="kv-key">Best ask</span>
                    <span className="kv-value">{toNumber(market.best_ask) ?? "—"}</span>
                  </div>
                  <div className="kv">
                    <span className="kv-key">Last trade</span>
                    <span className="kv-value">{toNumber(market.last_trade_price) ?? "—"}</span>
                  </div>
                </div>
              </div>
              <div className="muted">Last synced: {market.last_synced_at ? formatDate(market.last_synced_at) : "never"}</div>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
