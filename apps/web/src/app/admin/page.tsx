import { apiRequest, getAdminMlmOverview, listAdminRequestedWithdrawals } from "../../lib/api";
import { formatUsdc } from "../../lib/format";
import { baseNetworkLabel } from "../../lib/base-network";

import {
  activateMlmPlanAction,
  createMlmPlanAction,
  executeWithdrawalAction,
  failWithdrawalAction,
  overrideReferralSponsorAction,
  resolveMarketAction,
} from "./actions";

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

  if (status === "halted" || status === "cancelled") {
    return "warning";
  }

  return "neutral";
};

export default async function AdminPage() {
  const [marketsResult, withdrawalsResult, mlmResult] = await Promise.allSettled([
    apiRequest<MarketResponse[]>("/markets"),
    listAdminRequestedWithdrawals(),
    getAdminMlmOverview(),
  ]);

  const markets = marketsResult.status === "fulfilled" ? marketsResult.value : [];
  const withdrawals = withdrawalsResult.status === "fulfilled" ? withdrawalsResult.value : [];
  const mlm = mlmResult.status === "fulfilled" ? mlmResult.value : null;
  const adminDataError = withdrawalsResult.status === "rejected" ? withdrawalsResult.reason : null;

  const openMarkets = (markets ?? []).filter((market) => market.status === "open");
  const resolvedMarkets = (markets ?? []).filter((market) => market.status === "resolved");

  return (
    <main className="stack">
      <section className="hero">
        <h1>Admin</h1>
        <p>Resolve markets and process {baseNetworkLabel} withdrawal requests.</p>
        <div className="badge badge-neutral">Network: {baseNetworkLabel}</div>
      </section>

      <section className="stack">
        <h2 className="section-title">MLM Commission Plan</h2>
        <div className="grid">
          <article className="panel stack">
            <strong>Active Plan</strong>
            {mlm?.activePlan ? (
              <>
                <div>{mlm.activePlan.name}</div>
                <div className="muted">Version {mlm.activePlan.version} · Depth {mlm.activePlan.payableDepth}</div>
                <div className="muted">
                  {mlm.activePlan.levels.map((level) => `L${level.levelDepth}: ${(level.rateBps / 100).toFixed(2)}%`).join(" · ")}
                </div>
              </>
            ) : (
              <div className="empty-state">No active commission plan yet.</div>
            )}
          </article>

          <article className="panel stack">
            <strong>Create Plan</strong>
            <form action={createMlmPlanAction} className="stack">
              <label className="stack">
                Plan name
                <input name="name" defaultValue="Growth Plan" required />
              </label>
              <label className="stack">
                Level 1 rate (bps)
                <input name="levelOneRateBps" type="number" min="0" defaultValue="1000" required />
              </label>
              <label className="stack">
                Level 2 rate (bps)
                <input name="levelTwoRateBps" type="number" min="0" defaultValue="500" required />
              </label>
              <label className="stack">
                Level 3 rate (bps)
                <input name="levelThreeRateBps" type="number" min="0" defaultValue="250" required />
              </label>
              <label className="stack">
                <span>Activate immediately</span>
                <input name="activate" type="checkbox" defaultChecked />
              </label>
              <button type="submit">Create MLM Plan</button>
            </form>
          </article>
        </div>

        {mlm?.plans.length ? (
          <div className="grid">
            {mlm.plans.map((plan) => (
              <article className="panel stack" key={plan.id}>
                <div className={`badge badge-${plan.isActive ? "success" : "neutral"}`}>{plan.isActive ? "Active" : "Inactive"}</div>
                <strong>{plan.name}</strong>
                <div className="muted">Version {plan.version} · Depth {plan.payableDepth}</div>
                <div className="muted">
                  {plan.levels.map((level) => `L${level.levelDepth}: ${(level.rateBps / 100).toFixed(2)}%`).join(" · ")}
                </div>
                {!plan.isActive ? (
                  <form action={activateMlmPlanAction}>
                    <input type="hidden" name="planId" value={plan.id} />
                    <button type="submit">Activate Plan</button>
                  </form>
                ) : null}
              </article>
            ))}
          </div>
        ) : null}
      </section>

      <section className="stack">
        <h2 className="section-title">Referral Overrides</h2>
        <article className="panel stack">
          <form action={overrideReferralSponsorAction} className="stack">
            <label className="stack">
              Referred user ID
              <input name="referredUserId" placeholder="00000000-0000-4000-8000-000000000001" required />
            </label>
            <label className="stack">
              Sponsor code
              <input name="sponsorCode" placeholder="DEMO1001" required />
            </label>
            <label className="stack">
              Reason
              <input name="reason" placeholder="Manual correction after support review" required />
            </label>
            <button type="submit">Override Sponsor</button>
          </form>
        </article>

        {mlm?.relationships.length ? (
          <div className="panel stack">
            <strong>Recent Relationships</strong>
            <table className="table">
              <thead>
                <tr>
                  <th>Referred</th>
                  <th>Sponsor</th>
                  <th>Code</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {mlm.relationships.map((relationship) => (
                  <tr key={relationship.id}>
                    <td>{relationship.referredDisplayName ?? relationship.referredUserId}</td>
                    <td>{relationship.sponsorDisplayName ?? relationship.sponsorUserId}</td>
                    <td>{relationship.referralCode ?? "N/A"}</td>
                    <td>{relationship.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="stack">
        <h2 className="section-title">Recent MLM Commissions</h2>
        {mlm?.recentCommissions.length ? (
          <div className="panel stack">
            <table className="table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Level</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {mlm.recentCommissions.map((commission) => (
                  <tr key={commission.id}>
                    <td>{commission.sourceDisplayName ?? commission.sourceUserId}</td>
                    <td>Level {commission.levelDepth}</td>
                    <td>{formatUsdc(commission.amount)}</td>
                    <td>{commission.payoutStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="panel empty-state">No MLM commissions yet.</div>
        )}
      </section>

      <section className="stack">
        <h2 className="section-title">Requested Withdrawals</h2>
        {adminDataError ? (
          <div className="panel empty-state">Sign in as an admin to view and process withdrawal requests.</div>
        ) : withdrawals.length === 0 ? (
          <div className="panel empty-state">No pending withdrawal requests.</div>
        ) : (
          withdrawals.map((withdrawal) => (
            <article className="panel stack" key={withdrawal.id}>
              <div className="badge badge-warning">Requested</div>
              <strong>{withdrawal.id}</strong>
              <div className="kv">
                <span className="kv-key">Amount</span>
                <span className="kv-value">{formatUsdc(withdrawal.amountAtoms)}</span>
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
          openMarkets.map((market) => (
            <article className="panel stack" key={market.id}>
              <div className={`badge badge-${statusTone(market.status)}`}>{market.status === "open" ? "Active" : market.status}</div>
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

      <section className="stack">
        <h2 className="section-title">Recently Resolved Markets</h2>
        {resolvedMarkets.length === 0 ? (
          <div className="panel empty-state">No resolved markets yet.</div>
        ) : (
          <div className="grid">
            {resolvedMarkets.map((market) => (
              <article className="panel stack" key={market.id}>
                <div className={`badge badge-${statusTone(market.status)}`}>{market.status === "open" ? "Active" : market.status}</div>
                <strong>{market.title}</strong>
                <div className="muted">{market.id.slice(0, 8)}…</div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
