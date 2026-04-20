import { apiRequest, toBigInt } from "../../lib/api";

interface PortfolioResponse {
  balances: { currency: string; available: string; reserved: string }[];
}

interface ClaimsResponse {
  claims: {
    id: string;
    marketId: string;
    claimedAmount: string;
    status: string;
    createdAt: string;
  }[];
  states: {
    marketId: string;
    claimableAmount: string;
    claimedAmount: string;
    status: string;
  }[];
}

export default async function PortfolioPage() {
  const [portfolio, claimsPayload] = await Promise.all([
    apiRequest<PortfolioResponse>("/portfolio"),
    apiRequest<ClaimsResponse>("/claims"),
  ]);

  return (
    <main className="stack">
      <section className="hero">
        <h1>Portfolio</h1>
        <p>Balances and claim states are ledger-derived and integer-only.</p>
      </section>
      <section className="grid">
        {portfolio.balances.map((balance) => (
          <div className="panel stack" key={balance.currency}>
            <strong>{balance.currency} Balance</strong>
            <div className="metric">{toBigInt(balance.available).toString()}</div>
            <div className="muted">Available units</div>
            <div className="muted">Reserved: {toBigInt(balance.reserved).toString()}</div>
          </div>
        ))}
      </section>
      <section className="panel stack">
        <strong>Claimable by market</strong>
        {claimsPayload.states.length === 0 ? <div className="muted">No resolved markets yet.</div> : null}
        {claimsPayload.states.map((state) => (
          <div key={state.marketId}>
            <div className="muted">Market {state.marketId.slice(0, 8)}</div>
            <div>
              Status: {state.status} · Claimable: {toBigInt(state.claimableAmount).toString()} · Claimed: {toBigInt(state.claimedAmount).toString()}
            </div>
          </div>
        ))}
      </section>
      <section className="panel stack">
        <strong>Claim history</strong>
        {claimsPayload.claims.length === 0 ? <div className="muted">No claims submitted.</div> : null}
        {claimsPayload.claims.map((claim) => (
          <div key={claim.id}>
            <div className="muted">{new Date(claim.createdAt).toISOString()}</div>
            <div>
              Market {claim.marketId.slice(0, 8)} · {claim.status} · Amount {toBigInt(claim.claimedAmount).toString()}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
