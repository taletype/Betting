import { getPortfolio, linkWallet, requestWithdrawal, toBigInt, verifyDepositTx } from "../../lib/api";
import { formatUsdc, formatPrice, formatQuantity } from "../../lib/format";

const formatDate = (value: string): string =>
  new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Hong_Kong",
  }).format(new Date(value));

const withdrawalTone = (status: "requested" | "completed" | "failed"): "warning" | "success" | "danger" => {
  if (status === "completed") {
    return "success";
  }

  if (status === "failed") {
    return "danger";
  }

  return "warning";
};

const depositTone = (status: string): "success" | "warning" | "danger" | "neutral" => {
  if (status === "confirmed" || status === "completed") {
    return "success";
  }

  if (status === "failed") {
    return "danger";
  }

  if (status === "pending" || status === "submitted") {
    return "warning";
  }

  return "neutral";
};

export default async function PortfolioPage() {
  const portfolio = await getPortfolio();
  const primaryBalance = portfolio.balances[0];

  const linkWalletAction = async (formData: FormData) => {
    "use server";
    await linkWallet({
      walletAddress: String(formData.get("walletAddress") ?? ""),
      signedMessage: String(formData.get("signedMessage") ?? ""),
      signature: String(formData.get("signature") ?? ""),
    });
  };

  const verifyDepositAction = async (formData: FormData) => {
    "use server";
    await verifyDepositTx(String(formData.get("txHash") ?? ""));
  };

  const requestWithdrawalAction = async (formData: FormData) => {
    "use server";
    await requestWithdrawal({
      amountAtoms: BigInt(String(formData.get("amountAtoms") ?? "0")),
      destinationAddress: String(formData.get("destinationAddress") ?? ""),
    });
  };

  return (
    <main className="stack">
      <section className="hero">
        <h1>Portfolio</h1>
        <p>Review balances and transfer history, then verify deposits or request withdrawals.</p>
      </section>

      <section className="grid">
        <div className="panel stack">
          <strong>Available Balance</strong>
          <div className="metric">{primaryBalance ? formatUsdc(primaryBalance.available) : "$0.00"}</div>
          <div className="muted">{primaryBalance?.currency ?? "USDC"} available to trade.</div>
        </div>
        <div className="panel stack">
          <strong>Reserved Balance</strong>
          <div className="metric">{primaryBalance ? formatUsdc(primaryBalance.reserved) : "$0.00"}</div>
          <div className="muted">Locked for open orders and pending fills.</div>
        </div>
      </section>

      <section className="panel stack">
        <h2 className="section-title">Linked Wallet</h2>
        {portfolio.linkedWallet ? (
          <div className="stack">
            <div className="badge badge-neutral">Base Network</div>
            <div className="kv">
              <span className="kv-key">Wallet address</span>
              <span className="kv-value">{portfolio.linkedWallet.walletAddress}</span>
            </div>
            <div className="muted">Verified {formatDate(portfolio.linkedWallet.verifiedAt)}</div>
          </div>
        ) : (
          <div className="empty-state">No linked wallet yet. Link a wallet to enable Base deposits and withdrawals.</div>
        )}

        {!portfolio.linkedWallet && (
          <form action={linkWalletAction} className="stack">
            <label className="stack">
              Wallet address
              <input name="walletAddress" placeholder="0x..." required />
            </label>
            <label className="stack">
              Signed message
              <textarea name="signedMessage" placeholder="Bet wallet link\nuser:...\nnonce:..." required />
            </label>
            <label className="stack">
              Signature
              <textarea name="signature" placeholder="0x signature" required />
            </label>
            <button type="submit">Link Wallet</button>
          </form>
        )}
      </section>

      <section className="panel stack">
        <h2 className="section-title">Positions</h2>
        {portfolio.positions.length === 0 ? (
          <div className="empty-state">No open positions.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Market</th>
                <th>Outcome</th>
                <th>Shares</th>
                <th>Avg Price</th>
                <th>Realized PnL</th>
              </tr>
            </thead>
            <tbody>
              {portfolio.positions.map((position) => (
                <tr key={position.id}>
                  <td className="muted">{position.marketId.slice(0, 8)}…</td>
                  <td className="muted">{position.outcomeId.slice(0, 8)}…</td>
                  <td>{formatQuantity(position.netQuantity)}</td>
                  <td>{formatPrice(position.averageEntryPrice)}</td>
                  <td>{formatUsdc(position.realizedPnl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel stack">
        <h2 className="section-title">Open Orders</h2>
        {portfolio.openOrders.length === 0 ? (
          <div className="empty-state">No open orders.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Market</th>
                <th>Side</th>
                <th>Price</th>
                <th>Shares</th>
                <th>Remaining</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {portfolio.openOrders.map((order) => (
                <tr key={order.id}>
                  <td className="muted">{order.marketId.slice(0, 8)}…</td>
                  <td>{order.side.charAt(0).toUpperCase() + order.side.slice(1)}</td>
                  <td>{formatPrice(order.price)}</td>
                  <td>{formatQuantity(order.quantity)}</td>
                  <td>{formatQuantity(order.remainingQuantity)}</td>
                  <td>
                    <span className={`badge badge-${order.status === "open" ? "success" : order.status === "filled" ? "neutral" : "warning"}`}>
                      {order.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel stack">
        <h2 className="section-title">Claimable Winnings</h2>
        {portfolio.claims.length === 0 ? (
          <div className="empty-state">No winnings to claim.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Market</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {portfolio.claims.map((claim) => (
                <tr key={claim.id}>
                  <td className="muted">{claim.marketId.slice(0, 8)}…</td>
                  <td>{formatUsdc(claim.claimableAmount)}</td>
                  <td>
                    <span className={`badge badge-${claim.status === "claimable" ? "success" : claim.status === "claimed" ? "neutral" : "warning"}`}>
                      {claim.status}
                    </span>
                  </td>
                  <td>{claim.status === "claimable" ? "Claim" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="grid">
        <article className="panel stack">
          <div className="badge badge-neutral">Base Network</div>
          <h2 className="section-title">Credit Deposit</h2>
          <p className="muted">Enter your Base transaction hash to credit USDC to your account. Deposits must be from your linked wallet.</p>
          <form action={verifyDepositAction} className="stack">
            <input name="txHash" placeholder="0x transaction hash" required />
            <button type="submit">Credit Deposit</button>
          </form>
        </article>

        <article className="panel stack">
          <div className="badge badge-neutral">Base Network</div>
          <h2 className="section-title">Request Withdrawal</h2>
          <p className="muted">Enter amount and destination wallet to create a withdrawal request. Withdrawals are sent to your linked wallet.</p>
          <form action={requestWithdrawalAction} className="stack">
            <input name="amountAtoms" type="number" min="1" step="1" placeholder="Amount (atoms)" required />
            <input name="destinationAddress" placeholder="0x destination wallet" required />
            <button type="submit">Request Withdrawal</button>
          </form>
        </article>
      </section>

      <section className="panel stack">
        <h2 className="section-title">Deposit History</h2>
        {portfolio.deposits.length === 0 ? (
          <div className="empty-state">No deposits credited yet.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Tx hash</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Verified at</th>
              </tr>
            </thead>
            <tbody>
              {portfolio.deposits.map((deposit) => (
                <tr key={deposit.id}>
                  <td>{deposit.txHash}</td>
                  <td>{formatUsdc(deposit.amount)} {deposit.currency}</td>
                  <td>
                    <span className={`badge badge-${depositTone(deposit.txStatus)}`}>{deposit.txStatus}</span>
                  </td>
                  <td>{formatDate(deposit.verifiedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel stack">
        <h2 className="section-title">Withdrawal History</h2>
        {portfolio.withdrawals.length === 0 ? (
          <div className="empty-state">No withdrawals requested yet.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Destination</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Timeline</th>
              </tr>
            </thead>
            <tbody>
              {portfolio.withdrawals.map((withdrawal) => (
                <tr key={withdrawal.id}>
                  <td>{withdrawal.destinationAddress}</td>
                  <td>{formatUsdc(withdrawal.amountAtoms)}</td>
                  <td>
                    <span className={`badge badge-${withdrawalTone(withdrawal.status)}`}>{withdrawal.status}</span>
                  </td>
                  <td>
                    Requested: {formatDate(withdrawal.requestedAt)}
                    {withdrawal.processedAt ? ` · Processed: ${formatDate(withdrawal.processedAt)}` : ""}
                    {withdrawal.txHash ? ` · Tx: ${withdrawal.txHash}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
