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
import { getPortfolio, listMarkets } from "../../lib/api";

const formatTicks = (value: bigint): string => value.toString();

export default async function PortfolioPage() {
  const [portfolio, markets] = await Promise.all([getPortfolio(), listMarkets()]);
  const primaryBalance = portfolio.balances[0];
  const marketTitleById = new Map(markets.map((market) => [market.id, market.title]));
  const outcomeTitleById = new Map(
    markets.flatMap((market) => market.outcomes.map((outcome) => [outcome.id, outcome.title] as const)),
  );

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
        <p>Ledger-derived balances, persisted positions, and open orders from the real API read layer.</p>
      </section>
      <section className="grid">
        <div className="panel stack">
          <strong>Available Balance</strong>
          <div className="metric">{primaryBalance ? formatTicks(primaryBalance.available) : "0"}</div>
          <div className="muted">{primaryBalance?.currency ?? "USD"} available for new orders.</div>
        </div>
        <div className="panel stack">
          <strong>Reserved</strong>
          <div className="metric">{primaryBalance ? formatTicks(primaryBalance.reserved) : "0"}</div>
          <div className="muted">{primaryBalance?.currency ?? "USD"} held for resting orders.</div>
        </div>
      </section>
      <section className="panel stack">
        <h2>Positions</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Market</th>
              <th>Outcome</th>
              <th>Net quantity</th>
              <th>Average price</th>
              <th>Realized PnL</th>
            </tr>
          </thead>
          <tbody>
            {portfolio.positions.length > 0 ? (
              portfolio.positions.map((position) => (
                <tr key={position.id}>
                  <td>{marketTitleById.get(position.marketId) ?? position.marketId}</td>
                  <td>{outcomeTitleById.get(position.outcomeId) ?? position.outcomeId}</td>
                  <td>{position.netQuantity.toString()}</td>
                  <td>{position.averageEntryPrice.toString()}</td>
                  <td>{position.realizedPnl.toString()}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="muted">
                  No positions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
      <section className="panel stack">
        <h2>Open Orders</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Market</th>
              <th>Outcome</th>
              <th>Side</th>
              <th>Status</th>
              <th>Price</th>
              <th>Remaining</th>
              <th>Reserved</th>
            </tr>
          </thead>
          <tbody>
            {portfolio.openOrders.length > 0 ? (
              portfolio.openOrders.map((order) => (
                <tr key={order.id}>
                  <td>{marketTitleById.get(order.marketId) ?? order.marketId}</td>
                  <td>{outcomeTitleById.get(order.outcomeId) ?? order.outcomeId}</td>
                  <td>{order.side}</td>
                  <td>{order.status}</td>
                  <td>{order.price.toString()}</td>
                  <td>{order.remainingQuantity.toString()}</td>
                  <td>{order.reservedAmount.toString()}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="muted">
                  No open orders.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
