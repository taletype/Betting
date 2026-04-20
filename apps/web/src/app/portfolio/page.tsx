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
