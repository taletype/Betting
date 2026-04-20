import { apiRequest, listAdminRequestedWithdrawals, toBigInt } from "../../lib/api";

import { executeWithdrawalAction, failWithdrawalAction, resolveMarketAction } from "./actions";

interface MarketResponse {
  id: string;
  title: string;
  status: string;
  outcomes: { id: string; title: string }[];
}

export default async function AdminPage() {
  const [markets, withdrawals] = await Promise.all([
    apiRequest<MarketResponse[]>("/markets"),
    listAdminRequestedWithdrawals(),
  ]);

  return (
    <main className="stack">
      <section className="hero">
        <h1>Admin</h1>
        <p>Resolve markets and manually execute/fail Base withdrawals.</p>
      </section>

      <section className="stack">
        <h2>Requested Withdrawals</h2>
        {withdrawals.length === 0 ? <div className="muted">No pending withdrawals.</div> : null}
        {withdrawals.map((withdrawal) => (
          <article className="panel stack" key={withdrawal.id}>
            <strong>{withdrawal.id}</strong>
            <div>
              Amount: {toBigInt(withdrawal.amountAtoms).toString()} · Destination: {withdrawal.destinationAddress}
            </div>
            <div className="muted">Requested {new Date(withdrawal.requestedAt).toISOString()}</div>

            <form action={executeWithdrawalAction} className="stack">
              <input type="hidden" name="withdrawalId" value={withdrawal.id} />
              <input name="txHash" placeholder="0x tx hash" required />
              <button type="submit">Mark executed</button>
            </form>

            <form action={failWithdrawalAction} className="stack">
              <input type="hidden" name="withdrawalId" value={withdrawal.id} />
              <input name="reason" placeholder="Failure reason" required />
              <button type="submit">Mark failed</button>
            </form>
          </article>
        ))}
      </section>

      <section className="stack">
        <h2>Market Resolution</h2>
        {(markets ?? []).map((market) => (
          <article className="panel stack" key={market.id}>
            <div className="muted">{market.status.toUpperCase()}</div>
            <strong>{market.title}</strong>
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
              <button type="submit">Resolve market</button>
            </form>
          </article>
        ))}
      </section>
    </main>
  );
}
