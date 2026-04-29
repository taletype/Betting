import React from "react";
import Link from "next/link";

import { apiRequest, getAdminAmbassadorOverview, listAdminRequestedWithdrawals } from "../../lib/api";
import { baseNetworkLabel } from "../../lib/base-network";
import { formatUsdc } from "../../lib/format";
import { defaultLocale, formatDateTime, getLocaleCopy } from "../../lib/locale";

import {
  executeWithdrawalAction,
  failWithdrawalAction,
  resolveMarketAction,
} from "./actions";

export const dynamic = "force-dynamic";

interface MarketResponse {
  id: string;
  title: string;
  status: string;
  outcomes: { id: string; title: string }[];
}

const statusTone = (status: string): "neutral" | "success" | "warning" => {
  if (status === "resolved") return "success";
  if (status === "halted" || status === "cancelled") return "warning";
  return "neutral";
};

export default async function AdminPage() {
  const locale = defaultLocale;
  const copy = getLocaleCopy(locale).admin;
  const [marketsResult, withdrawalsResult, ambassadorResult] = await Promise.allSettled([
    apiRequest<MarketResponse[]>("/markets"),
    listAdminRequestedWithdrawals(),
    getAdminAmbassadorOverview(),
  ]);

  const markets = marketsResult.status === "fulfilled" ? marketsResult.value ?? [] : [];
  const withdrawals = withdrawalsResult.status === "fulfilled" ? withdrawalsResult.value : [];
  const ambassador = ambassadorResult.status === "fulfilled" ? ambassadorResult.value : null;
  const openMarkets = markets.filter((market) => market.status === "open");

  return (
    <main className="stack">
      <section className="hero">
        <h1>{copy.title}</h1>
        <p>{copy.subtitle}</p>
        <div className="badge badge-neutral">Network: {baseNetworkLabel}</div>
      </section>

      <section className="grid">
        <Link className="panel stack" href="/admin/ambassadors">
          <strong>{copy.ambassadors}</strong>
          <div className="metric-sm">{ambassador?.codes.length.toLocaleString(locale) ?? "-"}</div>
        </Link>
        <Link className="panel stack" href="/admin/rewards">
          <strong>{copy.rewards}</strong>
          <div className="metric-sm">{ambassador?.rewardLedger.length.toLocaleString(locale) ?? "-"}</div>
        </Link>
        <Link className="panel stack" href="/admin/payouts">
          <strong>{copy.payouts}</strong>
          <div className="metric-sm">{ambassador?.payouts.length.toLocaleString(locale) ?? "-"}</div>
        </Link>
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
                <span className="kv-value">{formatUsdc(withdrawal.amountAtoms, locale)}</span>
              </div>
              <div className="kv">
                <span className="kv-key">Destination</span>
                <span className="kv-value">{withdrawal.destinationAddress}</span>
              </div>
              <div className="muted">Requested {formatDateTime(locale, withdrawal.requestedAt)}</div>
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
        {openMarkets.length === 0 ? (
          <div className="panel empty-state">No open markets available for resolution actions.</div>
        ) : (
          openMarkets.map((market) => (
            <article className="panel stack" key={market.id}>
              <div className={`badge badge-${statusTone(market.status)}`}>{market.status}</div>
              <strong>{market.title}</strong>
              <form action={resolveMarketAction} className="stack">
                <input type="hidden" name="marketId" value={market.id} />
                <label className="stack">
                  Winning outcome
                  <select name="winningOutcomeId" defaultValue={market.outcomes[0]?.id} required>
                    {market.outcomes.map((outcome) => (
                      <option key={outcome.id} value={outcome.id}>{outcome.title}</option>
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
