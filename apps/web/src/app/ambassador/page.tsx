import React from "react";
import { defaultLocale, formatDateTime, getLocaleCopy } from "../../lib/locale";
import { formatUsdc } from "../../lib/format";
import { getAmbassadorDashboard, toBigInt } from "../../lib/api";
import { applyReferralCodeAction } from "../auth-actions";
import { ReferralFunnelChart, RewardSplitChart } from "../charts/market-charts";
import { PendingReferralApplier } from "../pending-referral-applier";
import { PendingReferralNotice } from "../pending-referral-notice";
import { BetaLaunchDisclosure, EmptyState, MetricCard, SafetyDisclosure, SharedRewardDisclosure, SharedSafetyDisclosure, StatusChip } from "../product-ui";
import { TrackedCopyButton } from "../tracked-copy-button";
import { getSiteUrl } from "../../lib/site-url";

export const dynamic = "force-dynamic";

const rewardExplanation =
  "分享市場連結。當你直接推薦的用戶透過本平台完成合資格交易，並產生已確認的 Builder 費用收入後，你可獲得推薦獎勵。";
const safetyExplanation =
  "參與推薦毋須付費；獎勵只限直接推薦及已確認 Builder 費用收入，平台不承諾收益，亦不會替用戶下單。";
const payoutApprovalExplanation = "獎勵計算可自動記錄，但實際支付需要管理員審批。";
const manualPayoutExplanation = "實際支付不會自動執行，必須由管理員審批及記錄交易哈希。";
const polygonPayoutExplanation = "請確認你的收款地址支援 Polygon 網絡。";

const getMarketSlug = (searchParams?: Record<string, string | string[] | undefined>): string | null => {
  const rawSlug = searchParams?.market ?? searchParams?.slug;
  const slug = Array.isArray(rawSlug) ? rawSlug[0] : rawSlug;
  if (!slug || !/^[a-z0-9][a-z0-9-]{0,180}$/i.test(slug)) {
    return null;
  }

  return slug;
};

export default async function AmbassadorPage({
  searchParams,
}: Readonly<{
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}> = {}) {
  const locale = defaultLocale;
  const copy = getLocaleCopy(locale).ambassador;
  const authCopy = getLocaleCopy(locale).auth;
  const dashboard = await getAmbassadorDashboard().catch(() => null);
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
          <h1>邀請朋友</h1>
          <p>{rewardExplanation}</p>
          <div className="trust-badge-row">
            <StatusChip>直接推薦</StatusChip>
            <StatusChip>人手審批</StatusChip>
            <StatusChip tone="warning">待確認獎勵</StatusChip>
            <StatusChip>非託管</StatusChip>
          </div>
          <PendingReferralNotice />
        </div>
      </section>
      <BetaLaunchDisclosure />
      <SharedSafetyDisclosure />
      <SharedRewardDisclosure />
      <SafetyDisclosure title="推薦規則">
        <div className="stack">
          <p>{rewardExplanation}</p>
          <p>{safetyExplanation}</p>
          <p>{payoutApprovalExplanation}</p>
        </div>
      </SafetyDisclosure>
      <SafetyDisclosure title="支付提示">
        <div className="stack">
          <p>{manualPayoutExplanation}</p>
          <p>{polygonPayoutExplanation}</p>
        </div>
      </SafetyDisclosure>

      {!dashboard ? (
        <section className="panel stack">
          <EmptyState title={authCopy.sessionRequired}>登入或註冊後可查看你的推薦碼、複製市場推薦連結，並追蹤直接推薦獎勵帳務。</EmptyState>
          <div className="market-actions">
            <a className="button-link" href="/login">{authCopy.login}</a>
            <a className="button-link secondary" href="/signup">{authCopy.signup}</a>
          </div>
        </section>
      ) : (
        <>
          <PendingReferralApplier />
          <section className="panel ambassador-code-card invite-link-card">
            <div className="stack">
              <span className="metric-label">推薦碼</span>
              <div className="metric-sm mono">{referralCode}</div>
              <span className="metric-label">推薦連結</span>
              <div className="metric-sm mono">{referralLink}</div>
              <p className="muted">推薦碼只作直接推薦歸因。分享市場連結後，已確認 Builder 費用收入會用作獎勵帳務紀錄。</p>
            </div>
            <div className="market-actions">
              <TrackedCopyButton value={referralLink} label="複製推薦連結" copiedLabel="已複製" eventName="invite_link_copied" metadata={{ code: dashboard.ambassadorCode.code }} />
              <TrackedCopyButton
                value={marketReferralLink}
                label="複製市場推薦連結"
                copiedLabel="已複製"
                eventName="market_share_link_copied"
                metadata={{ code: dashboard.ambassadorCode.code, marketSlug: marketSlug ?? "polymarket_feed" }}
              />
            </div>
          </section>

          <section className="grid">
            <MetricCard label="直接推薦人數" value={dashboard.rewards.directReferralCount.toLocaleString(locale)} />
            <MetricCard label="待確認獎勵" value={formatUsdc(dashboard.rewards.pendingRewards, locale)} tone="warning" />
            <MetricCard label="可提取獎勵" value={formatUsdc(dashboard.rewards.payableRewards, locale)} tone="success" />
            <MetricCard label="已支付獎勵" value={formatUsdc(dashboard.rewards.paidRewards, locale)} />
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
                { label: "待確認", value: toUsdcNumber(dashboard.rewards.pendingRewards), tone: "volume" },
                { label: "可提取", value: toUsdcNumber(dashboard.rewards.payableRewards), tone: "bid" },
                { label: "已支付", value: toUsdcNumber(dashboard.rewards.paidRewards), tone: "liquidity" },
              ]}
            />
            <section className="chart-panel stack" aria-label="Builder 費用收入">
              <strong>Builder 費用歸因</strong>
              <div className="chart-empty">暫時未有圖表資料</div>
              <p className="muted">獎勵只會根據已確認的 Builder 費用收入計算，實際支付需要管理員審批。</p>
            </section>
          </section>

          <section className="market-actions">
            <a className="button-link" href="/polymarket">查看 Polymarket 市場</a>
            <a className="button-link secondary" href="/rewards">前往獎勵</a>
            <TrackedCopyButton
              value={`${rewardExplanation} ${referralLink}`}
              label="複製分享文字"
              copiedLabel="已複製"
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
              <EmptyState title="暫時未有直接推薦活動">分享市場連結後，直接推薦歸因會在此顯示。</EmptyState>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>直接推薦用戶</th>
                    <th>歸因日期</th>
                    <th>合資格成交額</th>
                    <th>狀態</th>
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
