import { listExternalMarkets } from "../../lib/api";

export const dynamic = "force-dynamic";

const toDisplay = (value: number | null): string => (value === null ? "—" : String(value));

const formatDate = (value: string): string =>
  new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));

const statusTone = (status: string): "neutral" | "success" | "warning" => {
  if (status === "resolved" || status === "closed") {
    return "success";
  }

  if (status === "cancelled") {
    return "warning";
  }

  return "neutral";
};

export default async function ExternalMarketsPage() {
  const markets = await listExternalMarkets();

  return (
    <main className="stack">
      <section className="hero">
        <h1>Market Research</h1>
        <p>Price data from Polymarket and Kalshi for research. Trade these markets on their native platforms.</p>
      </section>
      <section className="stack">
        {markets.length === 0 ? (
          <div className="panel empty-state">No market data yet. Run the external sync job, then refresh this page.</div>
        ) : (
          markets.map((market) => (
            <div key={`${market.source}:${market.externalId}`} className="panel stack">
              <div className="grid">
                <div className="stack">
                  <div className="badge badge-neutral">{market.source}</div>
                  <strong>{market.title}</strong>
                  <div className={`badge badge-${statusTone(market.status)}`}>{market.status}</div>
                  <div className="muted">External ID: {market.externalId}</div>
                </div>
                <div className="stack">
                  <div className="kv">
                    <span className="kv-key">Best bid</span>
                    <span className="kv-value">{toDisplay(market.bestBid)}</span>
                  </div>
                  <div className="kv">
                    <span className="kv-key">Best ask</span>
                    <span className="kv-value">{toDisplay(market.bestAsk)}</span>
                  </div>
                  <div className="kv">
                    <span className="kv-key">Last trade</span>
                    <span className="kv-value">{toDisplay(market.lastTradePrice)}</span>
                  </div>
                </div>
              </div>
              {market.outcomes.length > 0 ? (
                <div className="muted">Outcomes: {market.outcomes.map((outcome) => outcome.title).join(" • ")}</div>
              ) : null}
              <div className="muted">Last synced: {market.lastSyncedAt ? formatDate(market.lastSyncedAt) : "never"}</div>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
