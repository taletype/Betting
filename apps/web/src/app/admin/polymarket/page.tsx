import Link from "next/link";
import React from "react";

import { getAdminAmbassadorOverview } from "../../../lib/api";
import { requireCurrentAdmin } from "../../../lib/supabase/server";
import { defaultLocale, formatDateTime, getLocaleCopy } from "../../../lib/locale";
import { getPolymarketOperationsDashboard } from "./dashboard";

export const dynamic = "force-dynamic";

const yesNo = (value: boolean): string => (value ? "yes" : "no");
const yesNoUnknown = (value: boolean | null): string => value === null ? "-" : yesNo(value);
const count = (value: number | null): string => value?.toLocaleString(defaultLocale) ?? "-";
const status = (value: number | "unreachable"): string => value === "unreachable" ? value : String(value);

const diagnosisCopy: Record<"ok" | "safe_empty" | "unavailable", string> = {
  ok: "ok",
  safe_empty: "safe empty: route is reachable but returned no markets",
  unavailable: "failure: public market route is unavailable or non-JSON",
};

export default async function AdminPolymarketPage() {
  await requireCurrentAdmin();

  const copy = getLocaleCopy(defaultLocale).admin;
  const dashboard = await getPolymarketOperationsDashboard({
    readAmbassadorOverview: async () => getAdminAmbassadorOverview().catch(() => null),
  });
  const { marketDataHealth, publicPages, readiness, rewards } = dashboard;
  const statusPayload = await import("../../api/_shared/admin-polymarket-status").then(({ getAdminPolymarketStatusPayload }) => getAdminPolymarketStatusPayload());

  return (
    <main className="stack">
      <section className="hero">
        <h1>Polymarket operations</h1>
        <p>{copy.subtitle}</p>
        <div className="badge badge-warning">Live trading remains disabled unless preflight is ready</div>
      </section>

      <section className="panel stack">
        <h2 className="section-title">Market data health</h2>
        <div className="kv"><span className="kv-key">backend/Supabase external_market_cache reachable</span><span className="kv-value">{yesNo(marketDataHealth.backendReachable)}</span></div>
        <div className="kv"><span className="kv-key">cache market count</span><span className="kv-value">{count(marketDataHealth.backendMarketCount)}</span></div>
        <div className="kv"><span className="kv-key">Gamma fallback reachable</span><span className="kv-value">{yesNo(marketDataHealth.gammaFallbackReachable)}</span></div>
        <div className="kv"><span className="kv-key">fallback market count</span><span className="kv-value">{count(marketDataHealth.gammaFallbackMarketCount)}</span></div>
        <div className="kv"><span className="kv-key">last checked time</span><span className="kv-value">{formatDateTime(defaultLocale, marketDataHealth.lastCheckedAt)}</span></div>
        <div className="kv">
          <span className="kv-key">last error code/source, redacted</span>
          <span className="kv-value">{marketDataHealth.lastError ? `${marketDataHealth.lastError.code} / ${marketDataHealth.lastError.source}` : "none"}</span>
        </div>
      </section>

      <section className="panel stack">
        <h2 className="section-title">Public pages</h2>
        <div className="kv"><span className="kv-key">/polymarket status</span><span className="kv-value">{status(publicPages.polymarketStatus)}</span></div>
        <div className="kv"><span className="kv-key">/api/external/markets status</span><span className="kv-value">{status(publicPages.externalMarketsStatus)}</span></div>
        <div className="kv"><span className="kv-key">latest market count</span><span className="kv-value">{count(publicPages.latestMarketCount)}</span></div>
        <div className="kv"><span className="kv-key">Supabase cache reachable</span><span className="kv-value">{yesNoUnknown(publicPages.supabaseCacheReachable)}</span></div>
        <div className="kv"><span className="kv-key">newest last_synced_at</span><span className="kv-value">{publicPages.newestLastSyncedAt ? formatDateTime(defaultLocale, publicPages.newestLastSyncedAt) : "-"}</span></div>
        <div className="kv"><span className="kv-key">stale market count</span><span className="kv-value">{count(publicPages.staleMarketCount)}</span></div>
        <div className="kv"><span className="kv-key">last sync status</span><span className="kv-value">{publicPages.lastSyncStatus ?? "-"}</span></div>
        <div className="kv"><span className="kv-key">fallback used last request</span><span className="kv-value">{yesNoUnknown(publicPages.fallbackUsedLastRequest)}</span></div>
        <div className="kv"><span className="kv-key">safe empty/failure diagnosis</span><span className="kv-value">{diagnosisCopy[publicPages.diagnosis]}</span></div>
      </section>

      <section className="panel stack">
        <h2 className="section-title">Builder/routing readiness</h2>
        <div className="kv"><span className="kv-key">builder code configured</span><span className="kv-value">{yesNo(readiness.builderCodeConfigured)}</span></div>
        <div className="kv"><span className="kv-key">routed trading enabled</span><span className="kv-value">{yesNo(readiness.routedTradingEnabled)}</span></div>
        <div className="kv"><span className="kv-key">canary mode</span><span className="kv-value">{readiness.canaryOnly ? "private canary only" : "not allowed for this canary build"}</span></div>
        <div className="kv"><span className="kv-key">allowed users count</span><span className="kv-value">{readiness.allowedUsersCount.toLocaleString(defaultLocale)}</span></div>
        <div className="kv"><span className="kv-key">kill switch</span><span className="kv-value">{readiness.killSwitchActive ? "active" : "inactive"}</span></div>
        <div className="kv"><span className="kv-key">CLOB submitter mode</span><span className="kv-value">{readiness.clobSubmitterMode}</span></div>
        <div className="kv"><span className="kv-key">submitter status</span><span className="kv-value">{readiness.clobSubmitterMode === "real" ? "configured" : "unavailable"}</span></div>
        <div className="kv"><span className="kv-key">signature verifier implemented</span><span className="kv-value">{yesNo(readiness.signatureVerifierImplemented)}</span></div>
        <div className="kv"><span className="kv-key">L2 credential lookup implemented</span><span className="kv-value">{yesNo(readiness.l2CredentialLookupImplemented)}</span></div>
        <div className="kv"><span className="kv-key">L2 credential readiness count</span><span className="kv-value">{count(readiness.l2CredentialReadyCount)}</span></div>
        <div className="kv"><span className="kv-key">server geoblock verifier implemented</span><span className="kv-value">{yesNo(readiness.serverGeoblockVerifierImplemented)}</span></div>
        <div className="kv"><span className="kv-key">region check status</span><span className="kv-value">{readiness.regionCheckStatus}</span></div>
        <div className="kv"><span className="kv-key">last preflight failures</span><span className="kv-value">{readiness.lastPreflightFailures.join(", ") || "none"}</span></div>
        <div className="kv"><span className="kv-key">last order submit attempts</span><span className="kv-value">{count(readiness.lastSubmitAttempts)}</span></div>
        <div className="kv"><span className="kv-key">last builder attribution sync</span><span className="kv-value">{readiness.lastBuilderAttributionSync ? formatDateTime(defaultLocale, readiness.lastBuilderAttributionSync) : "-"}</span></div>
        <div className="kv"><span className="kv-key">preflight status</span><span className="kv-value">{readiness.preflightStatus}</span></div>
      </section>

      <section className="panel stack">
        <h2 className="section-title">Language and translations</h2>
        <div className="kv"><span className="kv-key">default locale</span><span className="kv-value">{statusPayload.translation.defaultLocale}</span></div>
        <div className="kv"><span className="kv-key">supported locales</span><span className="kv-value">{statusPayload.translation.supportedLocales.join(", ")}</span></div>
        <div className="kv"><span className="kv-key">translation enabled</span><span className="kv-value">{yesNo(statusPayload.translation.enabled)}</span></div>
        <div className="kv"><span className="kv-key">provider/model</span><span className="kv-value">{statusPayload.translation.provider} / {statusPayload.translation.model}</span></div>
        <div className="kv"><span className="kv-key">last translation sync</span><span className="kv-value">{statusPayload.translation.lastTranslationSync ? formatDateTime(defaultLocale, statusPayload.translation.lastTranslationSync) : "-"}</span></div>
        <table className="table compact-table">
          <thead><tr><th>locale</th><th>translated</th><th>failed</th><th>stale</th><th>pending/skipped</th></tr></thead>
          <tbody>
            {Object.entries(statusPayload.translation.coverageByLocale).map(([locale, row]) => (
              <tr key={locale}>
                <td>{locale}</td>
                <td>{row.translated}</td>
                <td>{row.failed}</td>
                <td>{row.stale}</td>
                <td>{row.pending}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel stack">
        <h2 className="section-title">Referral/reward state</h2>
        <div className="kv"><span className="kv-key">ambassador codes count</span><span className="kv-value">{count(rewards.ambassadorCodesCount)}</span></div>
        <div className="kv"><span className="kv-key">direct referral attribution count</span><span className="kv-value">{count(rewards.directReferralAttributionCount)}</span></div>
        <div className="kv"><span className="kv-key">pending rewards</span><span className="kv-value">{count(rewards.pendingRewards)}</span></div>
        <div className="kv"><span className="kv-key">payable rewards</span><span className="kv-value">{count(rewards.payableRewards)}</span></div>
        <div className="kv"><span className="kv-key">payout requests</span><span className="kv-value">{count(rewards.payoutRequests)}</span></div>
        <div className="kv"><span className="kv-key">open high-risk flags</span><span className="kv-value">{count(rewards.openHighRiskFlags)}</span></div>
        <div className="kv"><span className="kv-key">automatic payouts</span><span className="kv-value">{rewards.autoPayoutEnabled ? "must be disabled" : "disabled"}</span></div>
      </section>

      <section className="panel stack">
        <h2 className="section-title">Safe operator actions</h2>
        <form action="/admin/polymarket" method="get">
          <button type="submit">Refresh market data health</button>
        </form>
        <Link href="/admin/rewards">Review reward ledger</Link>
        <Link href="/admin/payouts">Review payout requests</Link>
        <p className="muted">This dashboard is read-only. It does not enable live trading, submit orders, auto-pay rewards, or mutate ledger, balance, or matching state.</p>
      </section>
    </main>
  );
}
