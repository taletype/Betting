import Link from "next/link";
import React from "react";

import { getAdminAmbassadorOverview } from "../../../lib/api";
import { requireCurrentAdmin } from "../../../lib/supabase/server";
import { defaultLocale, formatDateTime, getLocaleCopy } from "../../../lib/locale";
import { getPolymarketOperationsDashboard } from "./dashboard";
import { StatusChip } from "../../product-ui";

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

const debugSourceUrls = [
  { label: "Public market feed API", url: "/api/external/markets" },
  { label: "Admin status API", url: "/api/admin/polymarket/status" },
  { label: "Same-page status route", url: "/admin/polymarket/status" },
  { label: "Polymarket Gamma events source", url: "https://gamma-api.polymarket.com/events" },
];

export default async function AdminPolymarketPage() {
  const adminUser = await requireCurrentAdmin();

  const copy = getLocaleCopy(defaultLocale).admin;
  const dashboard = await getPolymarketOperationsDashboard({
    readAmbassadorOverview: async () => getAdminAmbassadorOverview().catch(() => null),
    currentUser: adminUser,
  });
  const { marketDataHealth, publicPages, readiness, rewards } = dashboard;
  const statusPayload = await import("../../api/_shared/admin-polymarket-status").then(({ getAdminPolymarketStatusPayload }) => getAdminPolymarketStatusPayload());

  return (
    <main className="stack">
      <section className="hero">
        <h1>Polymarket 營運狀態</h1>
        <p>檢查市場同步、公開頁面、Builder 歸因與路由交易 readiness。此頁只顯示安全狀態，不會顯示 POLY_BUILDER_CODE、L2 憑證、API keys、簽名或服務金鑰。</p>
        <div className="trust-badge-row">
          <StatusChip tone="warning">未通過 preflight 前不會啟用路由交易</StatusChip>
          <StatusChip>Builder Code：{readiness.builderCodeConfigured ? "已設定" : "未設定"}</StatusChip>
        </div>
      </section>

      <section className="panel stack">
        <h2 className="section-title">市場同步狀態</h2>
        <div className="kv"><span className="kv-key">Supabase market cache 可連線</span><span className="kv-value">{yesNo(marketDataHealth.backendReachable)}</span></div>
        <div className="kv"><span className="kv-key">快取市場數量</span><span className="kv-value">{count(marketDataHealth.backendMarketCount)}</span></div>
        <div className="kv"><span className="kv-key">Gamma fallback 可連線</span><span className="kv-value">{yesNo(marketDataHealth.gammaFallbackReachable)}</span></div>
        <div className="kv"><span className="kv-key">fallback 市場數量</span><span className="kv-value">{count(marketDataHealth.gammaFallbackMarketCount)}</span></div>
        <div className="kv"><span className="kv-key">最後檢查時間</span><span className="kv-value">{formatDateTime(defaultLocale, marketDataHealth.lastCheckedAt)}</span></div>
        <div className="kv">
          <span className="kv-key">last error code/source, redacted</span>
          <span className="kv-value">{marketDataHealth.lastError ? `${marketDataHealth.lastError.code} / ${marketDataHealth.lastError.source}` : "none"}</span>
        </div>
      </section>

      <section className="panel stack">
        <h2 className="section-title">公開市場頁面</h2>
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
        <h2 className="section-title">Source URLs / debug info</h2>
        <p className="muted">Raw source URLs are intentionally kept on the admin page for diagnostics and are not rendered as public user CTAs.</p>
        <table className="table compact-table">
          <thead><tr><th>Source</th><th>URL</th></tr></thead>
          <tbody>
            {debugSourceUrls.map((source) => (
              <tr key={source.url}>
                <td>{source.label}</td>
                <td className="mono">{source.url}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel stack">
        <h2 className="section-title">路由交易 readiness</h2>
        <div className="kv"><span className="kv-key">Builder Code 已設定</span><span className="kv-value">{yesNo(readiness.builderCodeConfigured)}</span></div>
        <div className="kv"><span className="kv-key">公開路由交易已啟用</span><span className="kv-value">{yesNo(readiness.publicRoutedTradingEnabled)}</span></div>
        <div className="kv"><span className="kv-key">beta 路由交易已啟用</span><span className="kv-value">{yesNo(readiness.betaRoutedTradingEnabled)}</span></div>
        <div className="kv"><span className="kv-key">當前管理員在 allowlist</span><span className="kv-value">{yesNoUnknown(readiness.currentUserAllowlisted)}</span></div>
        <div className="kv"><span className="kv-key">canary mode</span><span className="kv-value">{readiness.canaryOnly ? "private canary only" : "not allowed for this canary build"}</span></div>
        <div className="kv"><span className="kv-key">allowed users count</span><span className="kv-value">{readiness.allowedUsersCount.toLocaleString(defaultLocale)}</span></div>
        <div className="kv"><span className="kv-key">kill switch</span><span className="kv-value">{readiness.killSwitchActive ? "active" : "inactive"}</span></div>
        <div className="kv"><span className="kv-key">CLOB submitter mode</span><span className="kv-value">{readiness.clobSubmitterMode}</span></div>
        <div className="kv"><span className="kv-key">submitter ready</span><span className="kv-value">{yesNo(readiness.submitterReady)}</span></div>
        <div className="kv"><span className="kv-key">attribution recording ready</span><span className="kv-value">{yesNo(readiness.attributionRecordingReady)}</span></div>
        <div className="kv"><span className="kv-key">signature verifier implemented</span><span className="kv-value">{yesNo(readiness.signatureVerifierImplemented)}</span></div>
        <div className="kv"><span className="kv-key">L2 credential lookup implemented</span><span className="kv-value">{yesNo(readiness.l2CredentialLookupImplemented)}</span></div>
        <div className="kv"><span className="kv-key">L2 credential readiness count</span><span className="kv-value">{count(readiness.l2CredentialReadyCount)}</span></div>
        <div className="kv"><span className="kv-key">server geoblock verifier implemented</span><span className="kv-value">{yesNo(readiness.serverGeoblockVerifierImplemented)}</span></div>
        <div className="kv"><span className="kv-key">region check status</span><span className="kv-value">{readiness.regionCheckStatus}</span></div>
        <div className="kv"><span className="kv-key">last readiness failure reason</span><span className="kv-value">{readiness.lastPreflightFailures[0] ?? "none"}</span></div>
        <div className="kv"><span className="kv-key">last preflight failures</span><span className="kv-value">{readiness.lastPreflightFailures.join(", ") || "none"}</span></div>
        <div className="kv"><span className="kv-key">last order submit attempts</span><span className="kv-value">{count(readiness.lastSubmitAttempts)}</span></div>
        <div className="kv"><span className="kv-key">last builder attribution sync</span><span className="kv-value">{readiness.lastBuilderAttributionSync ? formatDateTime(defaultLocale, readiness.lastBuilderAttributionSync) : "-"}</span></div>
        <div className="kv"><span className="kv-key">preflight 狀態</span><span className="kv-value">{readiness.preflightStatus}</span></div>
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
        <h2 className="section-title">推薦 / 獎勵營運狀態</h2>
        <div className="kv"><span className="kv-key">推薦碼數量</span><span className="kv-value">{count(rewards.ambassadorCodesCount)}</span></div>
        <div className="kv"><span className="kv-key">直接推薦歸因數量</span><span className="kv-value">{count(rewards.directReferralAttributionCount)}</span></div>
        <div className="kv"><span className="kv-key">待確認獎勵</span><span className="kv-value">{count(rewards.pendingRewards)}</span></div>
        <div className="kv"><span className="kv-key">可支付獎勵</span><span className="kv-value">{count(rewards.payableRewards)}</span></div>
        <div className="kv"><span className="kv-key">支付申請</span><span className="kv-value">{count(rewards.payoutRequests)}</span></div>
        <div className="kv"><span className="kv-key">高風險開放旗標</span><span className="kv-value">{count(rewards.openHighRiskFlags)}</span></div>
        <div className="kv"><span className="kv-key">自動支付</span><span className="kv-value">{rewards.autoPayoutEnabled ? "必須停用" : "已停用"}</span></div>
      </section>

      <section className="panel stack">
        <h2 className="section-title">Builder fee 對帳</h2>
        <div className="kv"><span className="kv-key">官方費用證據來源</span><span className="kv-value">{statusPayload.builderFeeReconciliation.evidenceSourceConfigured ? "已設定" : "未設定"}</span></div>
        <div className="kv"><span className="kv-key">最新 run 狀態</span><span className="kv-value">{statusPayload.builderFeeReconciliation.latestRunStatus ?? "-"}</span></div>
        <div className="kv"><span className="kv-key">last error</span><span className="kv-value">{statusPayload.builderFeeReconciliation.lastError ?? "none"}</span></div>
        <div className="kv"><span className="kv-key">imported / matched / confirmed</span><span className="kv-value">{statusPayload.builderFeeReconciliation.counts.imported} / {statusPayload.builderFeeReconciliation.counts.matched} / {statusPayload.builderFeeReconciliation.counts.confirmed}</span></div>
        <div className="kv"><span className="kv-key">disputed / void</span><span className="kv-value">{statusPayload.builderFeeReconciliation.counts.disputed} / {statusPayload.builderFeeReconciliation.counts.voided}</span></div>
        <table className="table compact-table">
          <thead><tr><th>run</th><th>source</th><th>status</th><th>confirmed</th><th>error</th></tr></thead>
          <tbody>
            {statusPayload.builderFeeReconciliation.recentRuns.map((run) => (
              <tr key={run.id}>
                <td className="mono">{run.startedAt ? formatDateTime(defaultLocale, run.startedAt) : "-"}</td>
                <td>{run.source}</td>
                <td>{run.status}</td>
                <td>{run.confirmedCount}</td>
                <td>{run.errorMessage ?? "none"}</td>
              </tr>
            ))}
            {statusPayload.builderFeeReconciliation.recentRuns.length === 0 ? (
              <tr><td colSpan={5}>未有 Builder fee 對帳 run</td></tr>
            ) : null}
          </tbody>
        </table>
        <p className="muted">獎勵只可由已確認的官方 Builder fee 證據建立；本頁不會顯示 Builder Code secret、API key、錢包私鑰或 service-role key。</p>
      </section>

      <section className="panel stack">
        <h2 className="section-title">安全營運操作</h2>
        <form action="/admin/polymarket" method="get">
          <button type="submit">重新檢查市場資料狀態</button>
        </form>
        <Link href="/admin/rewards">覆核獎勵帳本</Link>
        <Link href="/admin/payouts">覆核支付申請</Link>
        <p className="muted">此 dashboard 只讀，不會啟用實盤交易、提交訂單、自動支付獎勵，或修改帳務與撮合狀態。</p>
      </section>
    </main>
  );
}
