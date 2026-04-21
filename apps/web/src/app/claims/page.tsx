import { getPortfolio, listMarkets } from "../../lib/api";
import { formatUsdc } from "../../lib/format";

const formatDate = (value: string): string =>
  new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));

const claimTone = (status: string): "success" | "neutral" | "warning" => {
  if (status === "claimable") {
    return "success";
  }

  if (status === "claimed") {
    return "neutral";
  }

  return "warning";
};

export default async function ClaimsPage() {
  const [portfolio, markets] = await Promise.all([getPortfolio(), listMarkets()]);
  const marketTitleById = new Map(markets.map((market) => [market.id, market.title]));

  return (
    <main className="stack">
      <section className="hero">
        <h1>Claims & Payouts</h1>
        <p>Track claimable and claimed payout states for resolved markets in your portfolio.</p>
      </section>

      <section className="grid">
        <div className="panel stack">
          <strong>Claimable now</strong>
          <div className="metric">
            {formatUsdc(
              portfolio.claims
                .filter((claim) => claim.status === "claimable")
                .reduce((total, claim) => total + BigInt(claim.claimableAmount), 0n),
            )}
          </div>
          <div className="muted">Claims still waiting for action.</div>
        </div>
        <div className="panel stack">
          <strong>Claimed lifetime</strong>
          <div className="metric">
            {formatUsdc(portfolio.claims.reduce((total, claim) => total + BigInt(claim.claimedAmount), 0n))}
          </div>
          <div className="muted">Total settled payout amount.</div>
        </div>
      </section>

      <section className="panel stack">
        <h2 className="section-title">Claim History</h2>
        {portfolio.claims.length === 0 ? (
          <div className="empty-state">No claims yet. Resolve a market where you hold winning shares to generate claim records.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Market</th>
                <th>Status</th>
                <th>Claimable</th>
                <th>Claimed</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {portfolio.claims.map((claim) => (
                <tr key={claim.id}>
                  <td>{marketTitleById.get(claim.marketId) ?? `${claim.marketId.slice(0, 8)}…`}</td>
                  <td>
                    <span className={`badge badge-${claimTone(claim.status)}`}>{claim.status === "claimable" ? "Claimable" : claim.status === "claimed" ? "Claimed" : claim.status}</span>
                  </td>
                  <td>{formatUsdc(claim.claimableAmount)}</td>
                  <td>{formatUsdc(claim.claimedAmount)}</td>
                  <td>{formatDate(claim.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
