import { listExternalMarkets } from "../../lib/api";

export const dynamic = "force-dynamic";

const toDisplay = (value: number | null): string => (value === null ? "—" : value.toFixed(2));

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

const statusLabel = (status: string): string => {
  if (status === "open") {
    return "Active";
  }

  if (status === "resolved") {
    return "Resolved";
  }

  if (status === "closed") {
    return "Closed";
  }

  if (status === "cancelled") {
    return "Cancelled";
  }

  return status;
};

export default async function ExternalMarketsPage() {
  const markets = await listExternalMarkets();

  return (
    <main className="stack">
      <section className="hero">
        <h1>Market Research</h1>
        <p>Reference pricing from Polymarket and Kalshi for market context. Trading remains on each native venue.</p>
      </section>
      <section className="stack">
        {markets.length === 0 ? (
          <div className="panel empty-state">No synced market data yet. Run the external sync worker, then refresh this page.</div>
        ) : (
          markets.map((market) => (
            <div key={`${market.source}:${market.externalId}`} className="panel stack">
              <div className="grid">
                <div className="stack">
                  <div className="badge badge-neutral">{market.source}</div>
                  <strong>{market.title}</strong>
                  <div className={`badge badge-${statusTone(market.status)}`}>{statusLabel(market.status)}</div>
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
              ) : (
                <div className="muted">Outcomes not available in latest sync payload.</div>
              )}
              <div className="muted">24h volume: {toDisplay(market.volume24h)} · Total volume: {toDisplay(market.volumeTotal)}</div>
              <div className="muted">Last synced: {market.lastSyncedAt ? formatDate(market.lastSyncedAt) : "never"}</div>
              {market.recentTrades.length > 0 ? (
                <table className="table compact-table">
                  <thead>
                    <tr>
                      <th>Trade time</th>
                      <th>Side</th>
                      <th>Price</th>
                      <th>Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {market.recentTrades.slice(0, 3).map((trade) => (
                      <tr key={trade.externalTradeId}>
                        <td>{formatDate(trade.tradedAt)}</td>
                        <td>{trade.side ?? "—"}</td>
                        <td>{toDisplay(trade.price)}</td>
                        <td>{toDisplay(trade.size)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="muted">No recent external trades captured for this market yet.</div>
              )}
            </div>
          ))
        )}
      </section>
    </main>
  );
}
