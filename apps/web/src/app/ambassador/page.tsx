import React from "react";
import { defaultLocale, formatDateTime, getLocaleCopy } from "../../lib/locale";
import { formatUsdc } from "../../lib/format";
import { getAmbassadorDashboard, toBigInt } from "../../lib/api";
import { applyReferralCodeAction } from "../auth-actions";
import { ReferralFunnelChart, RewardSplitChart } from "../charts/market-charts";
import { PendingReferralApplier } from "../pending-referral-applier";
import { PendingReferralNotice } from "../pending-referral-notice";
import { BetaLaunchDisclosure, EmptyState, MetricCard, SafetyDisclosure, StatusChip } from "../product-ui";
import { TrackedCopyButton } from "../tracked-copy-button";

export const dynamic = "force-dynamic";

export default async function AmbassadorPage() {
  const locale = defaultLocale;
  const copy = getLocaleCopy(locale).ambassador;
  const authCopy = getLocaleCopy(locale).auth;
  const dashboard = await getAmbassadorDashboard().catch(() => null);
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
  const toUsdcNumber = (value: string | number | bigint | null | undefined) => Number(toBigInt(value)) / 1_000_000;

  return (
    <main className="stack">
      <section className="hero">
        <div className="hero-copy stack">
          <h1>分享有用市場，直接邀請朋友</h1>
          <p>分享市場連結。當你直接推薦的用戶透過本平台完成合資格交易，並產生已確認的 Builder 費用收入後，你可獲得推薦獎勵。</p>
          <p>參與推薦毋須付費；獎勵只限直接推薦及已確認 Builder 費用收入，平台不承諾收益，亦不會替用戶下單。</p>
          <p>獎勵計算可自動記錄，但實際支付需要管理員審批。</p>
          <div className="trust-badge-row">
            <StatusChip>直接推薦</StatusChip>
            <StatusChip>無預繳費用</StatusChip>
            <StatusChip>人工審批支付</StatusChip>
            <StatusChip>非託管</StatusChip>
          </div>
          <PendingReferralNotice />
        </div>
      </section>
      <BetaLaunchDisclosure />
      <SafetyDisclosure title="推薦規則">
        推薦獎勵只來自直接推薦及已確認的 Builder 費用收入，不設多層推薦，不代表任何交易盈利或保證收入。
      </SafetyDisclosure>

      {!dashboard ? (
        <section className="panel stack">
          <EmptyState title={authCopy.sessionRequired}>登入後可查看你的推薦碼、直接推薦紀錄及獎勵帳務。</EmptyState>
          <a href="/login">{authCopy.login}</a>
        </section>
      ) : (
        <>
          <PendingReferralApplier />
          <section className="panel ambassador-code-card">
            <div className="stack">
              <span className="metric-label">你的推薦碼</span>
              <div className="metric-sm mono">{dashboard.ambassadorCode.code}</div>
              <p className="muted">推薦碼只作直接歸因，不代表入會層級或保證獎勵。</p>
            </div>
            <div className="market-actions">
              <TrackedCopyButton value={dashboard.ambassadorCode.inviteUrl} label="複製邀請連結" copiedLabel="已複製" eventName="invite_link_copied" metadata={{ code: dashboard.ambassadorCode.code }} />
              <TrackedCopyButton
                value={`${siteUrl}/polymarket?ref=${encodeURIComponent(dashboard.ambassadorCode.code)}`}
                label="複製市場邀請連結"
                copiedLabel="已複製"
                eventName="market_share_link_copied"
                metadata={{ code: dashboard.ambassadorCode.code, surface: "polymarket_feed" }}
              />
            </div>
          </section>

          <section className="grid">
            <MetricCard label="直接推薦用戶" value={dashboard.rewards.directReferralCount.toLocaleString(locale)} note={`${copy.directTradingVolume}: ${formatUsdc(dashboard.rewards.directTradingVolumeUsdcAtoms, locale)}`} />
            <MetricCard label="待確認獎勵" value={formatUsdc(dashboard.rewards.pendingRewards, locale)} tone="warning" />
            <MetricCard label="可申請提取" value={formatUsdc(dashboard.rewards.payableRewards, locale)} tone="success" />
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
            <a className="button-link" href="/polymarket">前往 Polymarket 市場</a>
            <a className="button-link secondary" href="/rewards">前往獎勵</a>
            <TrackedCopyButton
              value={`分享市場連結。當你直接推薦的用戶透過本平台完成合資格交易，並產生已確認的 Builder 費用收入後，你可獲得推薦獎勵。 ${dashboard.ambassadorCode.inviteUrl}`}
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
