import { getPortfolio, linkWallet, listMarkets, requestWithdrawal, verifyDepositTx } from "../../lib/api";
import { baseNetworkLabel, formatBaseExplorerTxUrl } from "../../lib/base-network";
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

const orderStatusTone = (status: string): "success" | "warning" | "neutral" => {
  if (status === "open") {
    return "success";
  }

  if (status === "partially_filled") {
    return "warning";
  }

  return "neutral";
};

const orderStatusLabel = (status: string): string => {
  if (status === "partially_filled") {
    return "Partially filled";
  }

  if (status === "filled") {
    return "Filled";
  }

  if (status === "cancelled") {
    return "Cancelled";
  }

  return status.charAt(0).toUpperCase() + status.slice(1);
};

const claimStatusLabel = (status: string): string => {
  if (status === "claimable") {
    return "Claimable";
  }

  if (status === "claimed") {
    return "Claimed";
  }

  return status;
};

const withdrawalStatusLabel = (status: "requested" | "completed" | "failed"): string =>
  status === "requested" ? "Requested" : status === "completed" ? "Completed" : "Failed";

export default async function PortfolioPage() {
  const [portfolio, markets] = await Promise.all([getPortfolio(), listMarkets()]);
  const primaryBalance = portfolio.balances[0];

  const marketById = new Map(markets.map((market) => [market.id, market]));
  const getMarketTitle = (marketId: string): string => marketById.get(marketId)?.title ?? `${marketId.slice(0, 8)}…`;
  const getOutcomeTitle = (marketId: string, outcomeId: string): string =>
    marketById.get(marketId)?.outcomes.find((outcome: { id: string; title: string }) => outcome.id === outcomeId)?.title ?? `${outcomeId.slice(0, 8)}…`;

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
            <div className="badge badge-neutral">{baseNetworkLabel}</div>
            <div className="kv">
              <span className="kv-key">Wallet address</span>
              <span className="kv-value">{portfolio.linkedWallet.walletAddress}</span>
            </div>
            <div className="muted">Verified {formatDate(portfolio.linkedWallet.verifiedAt)}</div>
          </div>
        ) : (
          <div className="empty-state">No linked wallet yet. Link a wallet to enable {baseNetworkLabel} testnet deposits and withdrawals.</div>
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
                  <td className="muted">{getMarketTitle(position.marketId)}</td>
                  <td className="muted">{getOutcomeTitle(position.marketId, position.outcomeId)}</td>
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
                  <td className="muted">{getMarketTitle(order.marketId)}</td>
                  <td>{order.side.charAt(0).toUpperCase() + order.side.slice(1)}</td>
                  <td>{formatPrice(order.price)}</td>
                  <td>{formatQuantity(order.quantity)}</td>
                  <td>{formatQuantity(order.remainingQuantity)}</td>
                  <td>
                    <span className={`badge badge-${orderStatusTone(order.status)}`}>
                      {orderStatusLabel(order.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel stack">
        <h2 className="section-title">Claims</h2>
        {portfolio.claims.length === 0 ? (
          <div className="empty-state">No winnings to claim.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Market</th>
                <th>Claimable</th>
                <th>Claimed</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {portfolio.claims.map((claim) => (
                <tr key={claim.id}>
                  <td className="muted">{getMarketTitle(claim.marketId)}</td>
                  <td>{formatUsdc(claim.claimableAmount)}</td>
                  <td>{formatUsdc(claim.claimedAmount)}</td>
                  <td>
                    <span className={`badge badge-${claim.status === "claimable" ? "success" : claim.status === "claimed" ? "neutral" : "warning"}`}>
                      {claimStatusLabel(claim.status)}
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
          <div className="badge badge-neutral">{baseNetworkLabel}</div>
          <h2 className="section-title">Credit Deposit</h2>
          <p className="muted">Enter your {baseNetworkLabel} transaction hash to credit test USDC to your account. Deposits must come from your linked wallet and target the configured treasury.</p>
          <form action={verifyDepositAction} className="stack">
            <input name="txHash" placeholder="0x transaction hash" required />
            <button type="submit">Credit Deposit</button>
          </form>
        </article>

        <article className="panel stack">
          <div className="badge badge-neutral">{baseNetworkLabel}</div>
          <h2 className="section-title">Request Withdrawal</h2>
          <p className="muted">Enter amount and destination wallet to create a {baseNetworkLabel} testnet withdrawal request.</p>
          <form action={requestWithdrawalAction} className="stack">
            <input name="amountAtoms" type="number" min="1" step="1" placeholder="Amount (atoms)" required />
            <input name="destinationAddress" placeholder="0x destination wallet" required />
            <button type="submit">Request Withdrawal</button>
          </form>
        </article>
      </section>

      <section className="panel stack">
        <h2 className="section-title">Deposit History</h2>
        <div className="badge badge-neutral">{baseNetworkLabel}</div>
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
                  <td><a className="mono" href={formatBaseExplorerTxUrl(deposit.txHash)} target="_blank" rel="noreferrer">{deposit.txHash.slice(0, 10)}…{deposit.txHash.slice(-8)}</a></td>
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
        <div className="badge badge-neutral">{baseNetworkLabel}</div>
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
                  <td className="mono">{withdrawal.destinationAddress}</td>
                  <td>{formatUsdc(withdrawal.amountAtoms)}</td>
                  <td>
                    <span className={`badge badge-${withdrawalTone(withdrawal.status)}`}>{withdrawalStatusLabel(withdrawal.status)}</span>
                  </td>
                  <td>
                    Requested: {formatDate(withdrawal.requestedAt)}
                    {withdrawal.processedAt ? ` · Processed: ${formatDate(withdrawal.processedAt)}` : ""}
                    {withdrawal.txHash ? (
                      <>
                        {" · Tx: "}
                        <a className="mono" href={formatBaseExplorerTxUrl(withdrawal.txHash)} target="_blank" rel="noreferrer">
                          {withdrawal.txHash.slice(0, 10)}…{withdrawal.txHash.slice(-8)}
                        </a>
                      </>
                    ) : null}
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
