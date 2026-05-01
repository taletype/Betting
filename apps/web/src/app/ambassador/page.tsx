import React from "react";
import { defaultLocale, formatDateTime, getLocaleCopy, getLocaleHref, type AppLocale } from "../../lib/locale";
import { formatUsdc } from "../../lib/format";
import { getAmbassadorDashboard, isApiResponseError, toBigInt } from "../../lib/api";
import { applyReferralCodeAction } from "../auth-actions";
import { ReferralFunnelChart, RewardSplitChart } from "../charts/market-charts";
import { PendingReferralApplier } from "../pending-referral-applier";
import { PendingReferralNotice } from "../pending-referral-notice";
import { BetaLaunchDisclosure, EmptyState, MetricCard, SafetyDisclosure, SharedRewardDisclosure, SharedSafetyDisclosure, StatusChip } from "../product-ui";
import { TrackedCopyButton } from "../tracked-copy-button";
import { getSiteUrl } from "../../lib/site-url";
import { getCurrentWebUser, type WebSessionUser } from "../auth-session";

export const dynamic = "force-dynamic";

const ambassadorPageCopy: Record<AppLocale, {
  heroTitle: string;
  rewardRules: string;
  payoutTips: string;
  manualPayout: string;
  polygonPayout: string;
  signedOutBody: string;
  referralCodeNote: string;
  copyReferralLink: string;
  copyMarketReferralLink: string;
  copied: string;
  directReferralCount: string;
  builderAttribution: string;
  chartEmpty: string;
  builderAttributionNote: string;
  viewMarkets: string;
  goRewards: string;
  copyShareText: string;
  emptyReferralTitle: string;
  emptyReferralBody: string;
  directReferredUser: string;
  attributedAt: string;
  eligibleVolume: string;
  expiredSession: string;
  dashboardUnavailable: string;
  preparingCode: string;
}> = {
  en: {
    heroTitle: "Ambassador Rewards",
    rewardRules: "Referral rules",
    payoutTips: "Payout tips",
    manualPayout: "Actual payouts are not automatic. They must be approved by an admin and recorded with a transaction hash.",
    polygonPayout: "Make sure your receiving address supports the Polygon network.",
    signedOutBody: "Log in or sign up to view your referral code, copy market referral links, and track direct referral reward accounting.",
    referralCodeNote: "Referral codes are used only for direct referral attribution. After you share market links, confirmed Builder-fee revenue is used for reward accounting.",
    copyReferralLink: "Copy referral link",
    copyMarketReferralLink: "Copy market referral link",
    copied: "Copied",
    directReferralCount: "Direct referrals",
    builderAttribution: "Builder fee attribution",
    chartEmpty: "No chart data yet",
    builderAttributionNote: "Rewards are calculated only from confirmed Builder-fee revenue. Actual payouts require admin approval.",
    viewMarkets: "View Polymarket markets",
    goRewards: "Go to rewards",
    copyShareText: "Copy share text",
    emptyReferralTitle: "No direct referral activity yet",
    emptyReferralBody: "Direct referral attribution will appear here after you share market links.",
    directReferredUser: "Direct referred user",
    attributedAt: "Attributed",
    eligibleVolume: "Eligible volume",
    expiredSession: "Your login session has expired. Please log in again.",
    dashboardUnavailable: "You are logged in, but referral data could not be loaded. Please refresh or try again later.",
    preparingCode: "Preparing your referral code.",
  },
  "zh-HK": {
    heroTitle: "邀請朋友",
    rewardRules: "推薦規則",
    payoutTips: "支付提示",
    manualPayout: "實際支付不會自動執行，必須由管理員審批及記錄交易哈希。",
    polygonPayout: "請確認你的收款地址支援 Polygon 網絡。",
    signedOutBody: "登入或註冊後可查看你的推薦碼、複製市場推薦連結，並追蹤直接推薦獎勵帳務。",
    referralCodeNote: "推薦碼只作直接推薦歸因。分享市場連結後，已確認 Builder 費用收入會用作獎勵帳務紀錄。",
    copyReferralLink: "複製推薦連結",
    copyMarketReferralLink: "複製市場推薦連結",
    copied: "已複製",
    directReferralCount: "直接推薦人數",
    builderAttribution: "Builder 費用歸因",
    chartEmpty: "暫時未有圖表資料",
    builderAttributionNote: "獎勵只會根據已確認的 Builder 費用收入計算，實際支付需要管理員審批。",
    viewMarkets: "查看 Polymarket 市場",
    goRewards: "前往獎勵",
    copyShareText: "複製分享文字",
    emptyReferralTitle: "暫時未有直接推薦活動",
    emptyReferralBody: "分享市場連結後，直接推薦歸因會在此顯示。",
    directReferredUser: "直接推薦用戶",
    attributedAt: "歸因日期",
    eligibleVolume: "合資格成交額",
    expiredSession: "登入狀態已過期，請重新登入。",
    dashboardUnavailable: "已登入，但推薦資料暫時未能載入。請重新整理或稍後再試。",
    preparingCode: "正在準備你的推薦碼。",
  },
  "zh-CN": {
    heroTitle: "邀请朋友",
    rewardRules: "推荐规则",
    payoutTips: "支付提示",
    manualPayout: "实际支付不会自动执行，必须由管理员审核并记录交易哈希。",
    polygonPayout: "请确认你的收款地址支持 Polygon 网络。",
    signedOutBody: "登录或注册后可查看你的推荐码、复制市场推荐链接，并追踪直接推荐奖励账务。",
    referralCodeNote: "推荐码只作直接推荐归因。分享市场链接后，已确认 Builder 费用收入会用作奖励账务记录。",
    copyReferralLink: "复制推荐链接",
    copyMarketReferralLink: "复制市场推荐链接",
    copied: "已复制",
    directReferralCount: "直接推荐人数",
    builderAttribution: "Builder 费用归因",
    chartEmpty: "暂时没有图表数据",
    builderAttributionNote: "奖励只会根据已确认的 Builder 费用收入计算，实际支付需要管理员审核。",
    viewMarkets: "查看 Polymarket 市场",
    goRewards: "前往奖励",
    copyShareText: "复制分享文字",
    emptyReferralTitle: "暂时没有直接推荐活动",
    emptyReferralBody: "分享市场链接后，直接推荐归因会在此显示。",
    directReferredUser: "直接推荐用户",
    attributedAt: "归因日期",
    eligibleVolume: "合资格成交额",
    expiredSession: "登录状态已过期，请重新登录。",
    dashboardUnavailable: "已登录，但推荐资料暂时未能载入。请刷新或稍后再试。",
    preparingCode: "正在准备你的推荐码。",
  },
};

const getMarketSlug = (searchParams?: Record<string, string | string[] | undefined>): string | null => {
  const rawSlug = searchParams?.market ?? searchParams?.slug;
  const slug = Array.isArray(rawSlug) ? rawSlug[0] : rawSlug;
  if (!slug || !/^[a-z0-9][a-z0-9-]{0,180}$/i.test(slug)) {
    return null;
  }

  return slug;
};

const showOperatorDiagnostics = (): boolean =>
  process.env.NODE_ENV !== "production" && process.env.VERCEL_ENV !== "production";

const dashboardErrorHint = (error: unknown, locale: AppLocale): string | null => {
  if (!showOperatorDiagnostics() || !isApiResponseError(error)) return null;
  const labels = locale === "en"
    ? { code: "error code", status: "route status", source: "source" }
    : locale === "zh-CN"
      ? { code: "错误代码", status: "路由状态", source: "来源" }
      : { code: "錯誤代碼", status: "路由狀態", source: "來源" };
  return `${labels.code}: ${error.code ?? "unknown"} · ${labels.status}: ${error.status} · ${labels.source}: ${error.source ?? "same-site API"}`;
};

export async function renderAmbassadorPage(locale: AppLocale, {
  searchParams,
  currentUser,
  dashboardLoader = getAmbassadorDashboard,
}: Readonly<{
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
  currentUser?: WebSessionUser | null;
  dashboardLoader?: typeof getAmbassadorDashboard;
}> = {}) {
  const copy = getLocaleCopy(locale).ambassador;
  const authCopy = getLocaleCopy(locale).auth;
  const pageCopy = ambassadorPageCopy[locale];
  const user = currentUser === undefined ? await getCurrentWebUser() : currentUser;
  let dashboard: Awaited<ReturnType<typeof getAmbassadorDashboard>> | null = null;
  let dashboardError: unknown = null;
  if (user) {
    try {
      dashboard = await dashboardLoader();
    } catch (error) {
      dashboardError = error;
    }
  }
  const siteUrl = getSiteUrl();
  const resolvedSearchParams = await searchParams;
  const marketSlug = getMarketSlug(resolvedSearchParams);
  const toUsdcNumber = (value: string | number | bigint | null | undefined) => Number(toBigInt(value)) / 1_000_000;
  const referralCode = dashboard?.ambassadorCode.code ?? null;
  const referralLink = dashboard?.ambassadorCode.inviteUrl ?? "";
  const marketReferralLink = referralCode
    ? `${siteUrl}/polymarket${marketSlug ? `/${marketSlug}` : ""}?ref=${encodeURIComponent(referralCode)}`
    : "";

  return (
    <main className="stack">
      <section className="hero">
        <div className="hero-copy stack">
          <h1>{pageCopy.heroTitle}</h1>
          <p>{copy.subtitle}</p>
          <div className="trust-badge-row">
            <StatusChip>{copy.directReferrals}</StatusChip>
            <StatusChip>{getLocaleCopy(locale).rewards.adminApprovalNotice.includes("admin") ? "Manual approval" : "人手審批"}</StatusChip>
            <StatusChip tone="warning">{copy.pendingRewards}</StatusChip>
            <StatusChip>{locale === "en" ? "Non-custodial" : locale === "zh-CN" ? "非托管" : "非託管"}</StatusChip>
          </div>
          <PendingReferralNotice />
        </div>
      </section>
      <BetaLaunchDisclosure locale={locale} />
      <SharedSafetyDisclosure locale={locale} />
      <SharedRewardDisclosure locale={locale} />
      <SafetyDisclosure title={pageCopy.rewardRules}>
        <div className="stack">
          <p>{copy.subtitle}</p>
          <p>{copy.safeNotice}</p>
          <p>{copy.approvalNotice}</p>
        </div>
      </SafetyDisclosure>
      <SafetyDisclosure title={pageCopy.payoutTips}>
        <div className="stack">
          <p>{pageCopy.manualPayout}</p>
          <p>{pageCopy.polygonPayout}</p>
        </div>
      </SafetyDisclosure>

      {!user ? (
        <section className="panel stack">
          <EmptyState title={authCopy.sessionRequired}>{pageCopy.signedOutBody}</EmptyState>
          <span className="sr-only">{pageCopy.copyMarketReferralLink}</span>
          <div className="market-actions">
            <a className="button-link" href={getLocaleHref(locale, "/login")}>{authCopy.login}</a>
            <a className="button-link secondary" href={getLocaleHref(locale, "/signup")}>{authCopy.signup}</a>
          </div>
        </section>
      ) : dashboardError ? (
        <section className="panel stack">
          <EmptyState title={isApiResponseError(dashboardError) && dashboardError.status === 401 ? pageCopy.expiredSession : pageCopy.dashboardUnavailable}>
            {isApiResponseError(dashboardError) && dashboardError.status === 401 ? pageCopy.expiredSession : pageCopy.referralCodeNote}
          </EmptyState>
          {dashboardErrorHint(dashboardError, locale) ? (
            <p className="muted mono">{dashboardErrorHint(dashboardError, locale)}</p>
          ) : null}
          {isApiResponseError(dashboardError) && dashboardError.status === 401 ? (
            <div className="market-actions">
              <a className="button-link" href={getLocaleHref(locale, "/login")}>{authCopy.login}</a>
            </div>
          ) : (
            <div className="market-actions">
              <a className="button-link" href={getLocaleHref(locale, "/ambassador")}>{locale === "en" ? "Retry" : locale === "zh-CN" ? "重新整理" : "重新整理"}</a>
            </div>
          )}
        </section>
      ) : !dashboard?.ambassadorCode?.code ? (
        <section className="panel stack">
          <EmptyState title={pageCopy.preparingCode}>{pageCopy.dashboardUnavailable}</EmptyState>
        </section>
      ) : (
        <>
          <PendingReferralApplier />
          <section className="panel ambassador-code-card invite-link-card">
            <div className="stack">
              <span className="metric-label">{copy.code}</span>
              <div className="metric-sm mono">{referralCode}</div>
              <span className="metric-label">{copy.link}</span>
              <div className="metric-sm mono">{referralLink}</div>
              <p className="muted">{pageCopy.referralCodeNote}</p>
            </div>
            <div className="market-actions">
              <TrackedCopyButton value={referralLink} label={pageCopy.copyReferralLink} copiedLabel={pageCopy.copied} eventName="invite_link_copied" metadata={{ code: dashboard.ambassadorCode.code }} />
              <TrackedCopyButton
                value={marketReferralLink}
                label={pageCopy.copyMarketReferralLink}
                copiedLabel={pageCopy.copied}
                eventName="market_share_link_copied"
                metadata={{ code: dashboard.ambassadorCode.code, marketSlug: marketSlug ?? "polymarket_feed" }}
              />
            </div>
          </section>

          <section className="grid">
            <MetricCard label={pageCopy.directReferralCount} value={dashboard.rewards.directReferralCount.toLocaleString(locale)} />
            <MetricCard label={copy.pendingRewards} value={formatUsdc(dashboard.rewards.pendingRewards, locale)} tone="warning" />
            <MetricCard label={copy.payableRewards} value={formatUsdc(dashboard.rewards.payableRewards, locale)} tone="success" />
            <MetricCard label={copy.paidRewards} value={formatUsdc(dashboard.rewards.paidRewards, locale)} />
          </section>

          <section className="grid">
            <ReferralFunnelChart
              points={dashboard.directReferrals.map((referral) => ({
                timestamp: referral.attributedAt,
                value: 1,
              }))}
            />
            <RewardSplitChart
              points={[
                { label: copy.pendingRewards, value: toUsdcNumber(dashboard.rewards.pendingRewards), tone: "volume" },
                { label: copy.payableRewards, value: toUsdcNumber(dashboard.rewards.payableRewards), tone: "bid" },
                { label: copy.paidRewards, value: toUsdcNumber(dashboard.rewards.paidRewards), tone: "liquidity" },
              ]}
            />
            <section className="chart-panel stack" aria-label={pageCopy.builderAttribution}>
              <strong>{pageCopy.builderAttribution}</strong>
              <div className="chart-empty">{pageCopy.chartEmpty}</div>
              <p className="muted">{pageCopy.builderAttributionNote}</p>
            </section>
          </section>

          <section className="market-actions">
            <a className="button-link" href={getLocaleHref(locale, "/polymarket")}>{pageCopy.viewMarkets}</a>
            <a className="button-link secondary" href={getLocaleHref(locale, "/rewards")}>{pageCopy.goRewards}</a>
            <TrackedCopyButton
              value={`${copy.subtitle} ${referralLink}`}
              label={pageCopy.copyShareText}
              copiedLabel={pageCopy.copied}
              eventName="invite_link_copied"
              metadata={{ code: dashboard.ambassadorCode.code }}
            />
          </section>

          <section className="panel stack">
            <h2 className="section-title">{copy.manualCodeTitle}</h2>
            <p className="muted">{copy.manualCodeHint}</p>
            <form action={applyReferralCodeAction} className="stack">
              <input name="code" placeholder={copy.manualCodePlaceholder} />
              <button type="submit">{copy.applyCode}</button>
            </form>
          </section>

          <section className="panel stack">
            <h2 className="section-title">{copy.referredTraders}</h2>
            {dashboard.directReferrals.length === 0 ? (
              <EmptyState title={pageCopy.emptyReferralTitle}>{pageCopy.emptyReferralBody}</EmptyState>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>{pageCopy.directReferredUser}</th>
                    <th>{pageCopy.attributedAt}</th>
                    <th>{pageCopy.eligibleVolume}</th>
                    <th>{copy.status}</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.directReferrals.map((referral) => (
                    <tr key={referral.userId}>
                      <td>{referral.displayName ?? referral.username ?? referral.userId}</td>
                      <td>{formatDateTime(locale, referral.attributedAt)}</td>
                      <td>{formatUsdc(referral.tradingVolumeUsdcAtoms, locale)}</td>
                      <td>{referral.qualificationStatus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </main>
  );
}

export default async function AmbassadorPage(props: Readonly<{
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}> = {}) {
  return renderAmbassadorPage(defaultLocale, props);
}
