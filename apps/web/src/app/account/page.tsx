import React from "react";
import type { GetAmbassadorDashboardResponse } from "@bet/contracts";
import { formatUsdc } from "../../lib/format";
import { defaultLocale, getLocaleCopy } from "../../lib/locale";
import { applyReferralCodeAction, logoutAction } from "../auth-actions";
import { FunnelEventTracker } from "../funnel-analytics";
import { PendingReferralNotice, ReferralAttributionResultNotice } from "../pending-referral-notice";
import { PendingReferralApplier } from "../pending-referral-applier";
import { TrackedCopyButton } from "../tracked-copy-button";
import { ThirdwebWalletFundingCard } from "../thirdweb-wallet-funding-card";
import { getSiteUrl } from "../../lib/site-url";
import { resolveAmbassadorDashboardState, sanitizeAmbassadorDashboardDiagnostic } from "../ambassador-dashboard-state";

export function AccountReferralSection({
  dashboard,
  unavailable,
}: {
  dashboard: GetAmbassadorDashboardResponse | null;
  unavailable?: boolean;
}) {
  const copy = getLocaleCopy(defaultLocale).auth;

  return (
    <>
      <section className="panel stack">
        <strong>推薦來源</strong>
        {dashboard?.attribution ? (
          <>
            <div className="banner banner-success">推薦來源已保存</div>
            <div className="kv">
              <span className="kv-key">目前推薦來源</span>
              <span className="kv-value mono">{dashboard.attribution.ambassadorCode}</span>
            </div>
          </>
        ) : (
          <PendingReferralNotice prefix="待套用推薦碼：" />
        )}
        <form action={applyReferralCodeAction} className="stack">
          <input name="code" placeholder={getLocaleCopy(defaultLocale).ambassador.manualCodePlaceholder} />
          <button type="submit">{copy.applyReferral}</button>
        </form>
      </section>

      <section className="panel stack">
        <strong>你的推薦碼</strong>
        {dashboard?.ambassadorCode ? (
          <>
            <div className="metric-sm mono">{dashboard.ambassadorCode.code}</div>
            <TrackedCopyButton
              value={dashboard.ambassadorCode.inviteUrl}
              label="複製邀請連結"
              copiedLabel="已複製"
              eventName="invite_link_copied"
              metadata={{ code: dashboard.ambassadorCode.code, surface: "account" }}
            />
            <TrackedCopyButton
              value={`${getSiteUrl()}/polymarket?ref=${encodeURIComponent(dashboard.ambassadorCode.code)}`}
              label="複製市場推薦連結"
              copiedLabel="已複製"
              eventName="market_share_link_copied"
              metadata={{ code: dashboard.ambassadorCode.code, surface: "account" }}
            />
            <a href="/rewards">查看獎勵</a>
          </>
        ) : unavailable ? (
          <div className="empty-state">已登入，但推薦碼暫時未能載入。請重新整理或稍後再試。</div>
        ) : (
          <div className="empty-state">登入後可在此查看你的推薦碼及邀請連結。</div>
        )}
      </section>
    </>
  );
}

export async function renderAccountPage(resolvedState?: Awaited<ReturnType<typeof resolveAmbassadorDashboardState>>) {
  const copy = getLocaleCopy(defaultLocale).auth;
  const rewardsCopy = getLocaleCopy(defaultLocale).rewards;
  const state = resolvedState ?? await resolveAmbassadorDashboardState();
  const dashboard = state.kind === "ok" ? state.dashboard : null;
  const userSignedIn = state.kind !== "signed_out";
  const diagnostics = state.kind === "unavailable" && process.env.NODE_ENV !== "production" && process.env.VERCEL_ENV !== "production";

  return (
    <main className="stack">
      <section className="hero">
        <h1>{copy.accountTitle}</h1>
        <p>{copy.accountSubtitle}</p>
        <ReferralAttributionResultNotice />
        <PendingReferralNotice />
      </section>

      {state.kind === "signed_out" ? (
        <section className="panel stack">
          <div className="empty-state">{copy.sessionRequired}</div>
          <a href="/login">{copy.login}</a>
        </section>
      ) : (
        <>
          <FunnelEventTracker name="signup_completed" metadata={{ user: state.user.id }} />
          <PendingReferralApplier />
          <section className="panel stack">
            <div className="kv"><span className="kv-key">User ID</span><span className="kv-value mono">{state.user.id}</span></div>
            <div className="kv"><span className="kv-key">{copy.email}</span><span className="kv-value">{state.user.email ?? ""}</span></div>
            <div className="kv"><span className="kv-key">登入狀態</span><span className="kv-value">已登入</span></div>
            <div className="kv"><span className="kv-key">已驗證錢包</span><span className="kv-value">待驗證（請於下方連接）</span></div>
            <div className="kv"><span className="kv-key">目前連接錢包</span><span className="kv-value">請查看下方「增值錢包」卡片狀態</span></div>
            <div className="kv"><span className="kv-key">{copy.readinessStatus}</span><span className="kv-value">{getLocaleCopy(defaultLocale).research.readinessCopy.feature_disabled}</span></div>
            <form action={logoutAction}>
              <button type="submit">{copy.logout}</button>
            </form>
          </section>

          <ThirdwebWalletFundingCard surface="account" />

          {state.kind === "expired_session" ? (
            <section className="panel stack">
              <div className="empty-state">登入狀態已過期，請重新登入。</div>
              <a href="/login">{copy.login}</a>
            </section>
          ) : state.kind === "unavailable" ? (
            <section className="panel stack">
              <div className="empty-state">已登入，但推薦資料暫時未能載入。請重新整理或稍後再試。</div>
              <a href="/account">重新整理</a>
              {diagnostics ? <div className="muted mono">錯誤代碼: {sanitizeAmbassadorDashboardDiagnostic(state.code) ?? "unknown"} · 路由狀態: {state.status} · 來源: {sanitizeAmbassadorDashboardDiagnostic(state.source) ?? "same-site API"}</div> : null}
            </section>
          ) : (
            <AccountReferralSection dashboard={dashboard} unavailable={false} />
          )}

          <section className="panel stack">
            <strong>獎勵摘要</strong>
            {state.kind === "ok" ? (
              <>
                <div className="kv"><span className="kv-key">直接推薦</span><span className="kv-value">{dashboard!.rewards.directReferralCount.toLocaleString(defaultLocale)}</span></div>
                <div className="kv"><span className="kv-key">{rewardsCopy.statuses.pending}</span><span className="kv-value">{formatUsdc(dashboard!.rewards.pendingRewards, defaultLocale)}</span></div>
                <div className="kv"><span className="kv-key">{rewardsCopy.statuses.payable}</span><span className="kv-value">{formatUsdc(dashboard!.rewards.payableRewards, defaultLocale)}</span></div>
                <div className="kv"><span className="kv-key">{rewardsCopy.payouts}</span><span className="kv-value">{dashboard!.payouts.length.toLocaleString(defaultLocale)}</span></div>
                <div className="muted">獎勵只屬帳務紀錄，不會加入或修改交易餘額；支付需要管理員人手審批。</div>
              </>
            ) : (
              <div className="empty-state">已登入，但獎勵摘要暫時未能載入。請重新整理或稍後再試。</div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

export default async function AccountPage() {
  return renderAccountPage();
}
