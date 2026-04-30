import React from "react";
import { defaultLocale, formatDateTime, getLocaleCopy } from "../../lib/locale";
import { formatUsdc } from "../../lib/format";
import { getAmbassadorDashboard, toBigInt } from "../../lib/api";
import { PayoutStatusChart, RewardSplitChart, VolumeHistoryChart } from "../charts/market-charts";
import { PendingReferralNotice } from "../pending-referral-notice";
import { BetaLaunchDisclosure, EmptyState, MetricCard, SharedRewardDisclosure, SharedSafetyDisclosure, SafetyDisclosure } from "../product-ui";
import { requestRewardPayoutAction } from "./reward-actions";

export const dynamic = "force-dynamic";

export default async function RewardsPage() {
  const locale = defaultLocale;
  const copy = getLocaleCopy(locale).rewards;
  const authCopy = getLocaleCopy(locale).auth;
  const dashboard = await getAmbassadorDashboard().catch(() => null);
  const toUsdcNumber = (value: string | number | bigint | null | undefined) => Number(toBigInt(value)) / 1_000_000;

  return (
    <main className="stack">
      <section className="hero">
        <h1>推薦獎勵帳務紀錄</h1>
        <p>當你直接推薦的用戶透過本平台完成合資格交易，並產生已確認的 Builder 費用收入後，你可獲得推薦獎勵。</p>
        <p>獎勵不是交易餘額，不能用作平台內交易額度或平台餘額。</p>
        <p>獎勵以人手審批方式處理，審批後可透過 Polygon 上的 pUSD 向指定錢包支付。</p>
        <p>獎勵計算可自動記錄，但實際支付不會自動執行，必須由管理員審批及記錄交易哈希。不會自動從金庫轉帳。</p>
        <div className="trust-badge-row">
          <span className="badge badge-warning">待確認獎勵</span>
          <span className="badge badge-success">可提取獎勵</span>
          <span className="badge badge-neutral">已支付獎勵</span>
          <span className="badge badge-warning">人手審批</span>
        </div>
        <PendingReferralNotice />
      </section>
      <BetaLaunchDisclosure />
      <SharedSafetyDisclosure />
      <SharedRewardDisclosure />
      <SafetyDisclosure title="帳務提示">
        本頁不顯示可用交易資金，亦不代表盈利。所有項目均為推薦獎勵紀錄，支付前需經人工審批。
      </SafetyDisclosure>

      {!dashboard ? (
        <section className="panel stack">
          <EmptyState title={authCopy.sessionRequired}>登入後可查看你的推薦獎勵帳本及人工支付申請。</EmptyState>
          <a href="/login">{authCopy.login}</a>
        </section>
      ) : (
        <>
          <section className="grid">
            <MetricCard label="待確認獎勵" value={formatUsdc(dashboard.rewards.pendingRewards, locale)} tone="warning" note="仍需確認 Builder 費用收入及歸因。" />
            <MetricCard label="可提取獎勵" value={formatUsdc(dashboard.rewards.payableRewards, locale)} tone="success" note="可提交人工支付申請。" />
            <MetricCard label="已支付獎勵" value={formatUsdc(dashboard.rewards.paidRewards, locale)} note="已由管理員標記為支付完成。" />
            <MetricCard label="支付資產" value="Polygon pUSD" note="需要管理員審批及鏈上交易紀錄。" />
          </section>

          <section className="grid">
            <RewardSplitChart
              points={[
                { label: "待確認", value: toUsdcNumber(dashboard.rewards.pendingRewards), tone: "volume" },
                { label: "可提取", value: toUsdcNumber(dashboard.rewards.payableRewards), tone: "bid" },
                { label: "已支付", value: toUsdcNumber(dashboard.rewards.paidRewards), tone: "liquidity" },
              ]}
            />
            <PayoutStatusChart
              points={["requested", "approved", "paid", "failed", "cancelled"].map((status) => ({
                label: copy.payoutStatuses[status] ?? status,
                value: dashboard.payouts.filter((payout) => payout.status === status).length,
                tone: status === "paid" ? "bid" : status === "failed" || status === "cancelled" ? "ask" : "volume",
              }))}
            />
            <VolumeHistoryChart
              points={dashboard.rewardLedger.map((entry) => ({
                timestamp: entry.createdAt,
                value: toUsdcNumber(entry.amountUsdcAtoms),
              }))}
            />
          </section>

          <section className="panel stack">
            <h2 className="section-title">申請人工支付</h2>
            <p className="muted">請輸入 Polygon 錢包地址。支付資產為 pUSD；提交後需由管理員審批，並在完成後記錄 Polygon 交易哈希。請確認你的收款地址支援 Polygon 網絡。</p>
            <form action={requestRewardPayoutAction} className="stack">
              <label className="stack">
                Polygon wallet address
                <input name="destinationValue" placeholder="0x..." required />
              </label>
              <button type="submit" disabled={toBigInt(dashboard.rewards.payableRewards) <= 0n}>提交支付申請</button>
            </form>
          </section>

          <section className="panel stack">
            <h2 className="section-title">獎勵帳本</h2>
            {dashboard.rewardLedger.length === 0 ? (
              <EmptyState title="暫時未有獎勵紀錄">合資格交易確認後，推薦獎勵帳務會顯示於此。</EmptyState>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>日期</th>
                    <th>來源</th>
                    <th>類型</th>
                    <th>金額</th>
                    <th>狀態</th>
                    <th>歸因 ID</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.rewardLedger.map((entry) => (
                    <tr key={entry.id}>
                      <td>{formatDateTime(locale, entry.createdAt)}</td>
                      <td>Builder 費用收入</td>
                      <td>{copy.rewardTypes[entry.rewardType] ?? entry.rewardType}</td>
                      <td>{formatUsdc(entry.amountUsdcAtoms, locale)}</td>
                      <td>{copy.statuses[entry.status] ?? entry.status}</td>
                      <td className="mono">{entry.sourceTradeAttributionId.slice(0, 8)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="panel stack">
            <h2 className="section-title">{copy.payouts}</h2>
            {dashboard.payouts.length === 0 ? (
              <EmptyState title="暫時未有支付申請">提交人工支付申請後，審批狀態會顯示於此。</EmptyState>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>{copy.amount}</th>
                    <th>{copy.payoutRail}</th>
                    <th>{copy.status}</th>
                    <th>{copy.payoutDestination}</th>
                    <th>{copy.created}</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.payouts.map((payout) => (
                    <tr key={payout.id}>
                      <td>{formatUsdc(payout.amountUsdcAtoms, locale)}</td>
                      <td>{payout.payoutChain} {payout.payoutAsset}</td>
                      <td>{copy.payoutStatuses[payout.status] ?? payout.status}</td>
                      <td>{payout.destinationValue}</td>
                      <td>{formatDateTime(locale, payout.createdAt)}</td>
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
