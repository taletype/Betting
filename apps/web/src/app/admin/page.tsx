import { apiRequest, listAdminRequestedWithdrawals, toBigInt } from "../../lib/api";
import { baseNetworkLabel } from "../../lib/base-network";

import { executeWithdrawalAction, failWithdrawalAction, resolveMarketAction } from "./actions";

export const dynamic = "force-dynamic";

interface MarketResponse {
  id: string;
  title: string;
  status: string;
  outcomes: { id: string; title: string }[];
}

const formatDate = (value: string): string =>
  new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Hong_Kong",
  }).format(new Date(value));

const statusTone = (status: string): "neutral" | "success" | "warning" => {
  if (status === "resolved") {
    return "success";
  }

  if (status === "paused") {
    return "warning";
  }

  return "neutral";
};

export default async function AdminPage() {
  const [markets, withdrawals] = await Promise.all([
    apiRequest<MarketResponse[]>("/markets"),
    listAdminRequestedWithdrawals(),
  ]);

  return (
    <main className="stack">
      <section className="hero">
        <h1>Admin</h1>
        <p>Resolve markets and process {baseNetworkLabel} withdrawal requests.</p>
      </section>

      <section className="stack">
        <h2 className="section-title">Requested Withdrawals</h2>
        {withdrawals.length === 0 ? (
          <div className="panel empty-state">No pending withdrawal requests.</div>
        ) : (
          withdrawals.map((withdrawal) => (
            <article className="panel stack" key={withdrawal.id}>
              <div className="badge badge-warning">Requested</div>
              <strong>{withdrawal.id}</strong>
              <div className="kv">
                <span className="kv-key">Amount</span>
                <span className="kv-value">{toBigInt(withdrawal.amountAtoms).toString()}</span>
              </div>
              <div className="kv">
                <span className="kv-key">Destination</span>
                <span className="kv-value">{withdrawal.destinationAddress}</span>
              </div>
              <div className="muted">Requested {formatDate(withdrawal.requestedAt)}</div>

              <form action={executeWithdrawalAction} className="stack">
                <input type="hidden" name="withdrawalId" value={withdrawal.id} />
                <label className="stack">
                  {baseNetworkLabel} transaction hash
                  <input name="txHash" placeholder="0x transaction hash" required />
                </label>
                <button type="submit">Confirm Payout</button>
              </form>

              <form action={failWithdrawalAction} className="stack">
                <input type="hidden" name="withdrawalId" value={withdrawal.id} />
                <label className="stack">
                  Failure reason
                  <input name="reason" placeholder="Failure reason" required />
                </label>
                <button type="submit">Mark Failed</button>
              </form>
            </article>
          ))
        )}
      </section>

      <section className="stack">
        <h2 className="section-title">Market Resolution</h2>
        {(markets ?? []).length === 0 ? (
          <div className="panel empty-state">No markets available for resolution actions.</div>
        ) : (
          (markets ?? []).filter((market) => market.status === "open").map((market) => (
            <article className="panel stack" key={market.id}>
              <div className={`badge badge-${statusTone(market.status)}`}>{market.status}</div>
              <strong>{market.title}</strong>
              <div className="muted">{market.id.slice(0, 8)}…</div>

              <form action={resolveMarketAction} className="stack">
                <input type="hidden" name="marketId" value={market.id} />
                <label className="stack">
                  Winning outcome
                  <select name="winningOutcomeId" defaultValue={market.outcomes[0]?.id} required>
                    {market.outcomes.map((outcome) => (
                      <option key={outcome.id} value={outcome.id}>
                        {outcome.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="stack">
                  Resolver identity
                  <input name="resolverId" placeholder="ops-admin-1" required />
                </label>
                <label className="stack">
                  Evidence text
                  <textarea name="evidenceText" rows={3} required />
                </label>
                <label className="stack">
                  Evidence URL (optional)
                  <input name="evidenceUrl" type="url" placeholder="https://example.com/proof" />
                </label>
                <button type="submit">Resolve Market</button>
              </form>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
