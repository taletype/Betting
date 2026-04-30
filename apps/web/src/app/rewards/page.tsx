import React from "react";
import { defaultLocale, formatDateTime, getLocaleCopy } from "../../lib/locale";
import { formatUsdc } from "../../lib/format";
import { getAmbassadorDashboard, toBigInt } from "../../lib/api";
import { PayoutStatusChart, RewardSplitChart, VolumeHistoryChart } from "../charts/market-charts";
import { PendingReferralNotice } from "../pending-referral-notice";
import { BetaLaunchDisclosure, EmptyState, MetricCard, SharedRewardDisclosure, SharedSafetyDisclosure, SafetyDisclosure, StatusChip, type Tone } from "../product-ui";
import { requestRewardPayoutAction } from "./reward-actions";

export const dynamic = "force-dynamic";

const rewardStatusLabels: Record<string, string> = {
  pending: "待確認",
  payable: "可提取",
  approved: "審批中",
  paid: "已支付",
  void: "已取消",
  failed: "已失敗",
};

const payoutStatusLabels: Record<string, string> = {
  requested: "已申請",
  approved: "已審批",
  paid: "已支付",
  failed: "已失敗",
  cancelled: "已取消",
};

const rewardContextLabels: Record<string, string> = {
  direct_referrer_commission: "推薦來源",
  trader_cashback: "交易者 cashback",
  platform_revenue: "平台收入",
};

const rewardShareBps: Record<string, bigint> = {
  direct_referrer_commission: 3_000n,
  trader_cashback: 1_000n,
  platform_revenue: 6_000n,
};

const estimateBuilderFeeRevenue = (amountUsdcAtoms: string | number | bigint, rewardType: string): bigint | null => {
  const share = rewardShareBps[rewardType];
  if (!share) return null;
  return (toBigInt(amountUsdcAtoms) * 10_000n) / share;
};

const statusTone = (status: string): Tone => {
  if (status === "paid" || status === "payable") return "success";
  if (status === "failed" || status === "cancelled" || status === "void") return "danger";
  if (status === "approved" || status === "requested" || status === "pending") return "warning";
  return "neutral";
};

export default async function RewardsPage() {
  const locale = defaultLocale;
  const copy = getLocaleCopy(locale).rewards;
  const authCopy = getLocaleCopy(locale).auth;
  const dashboard = await getAmbassadorDashboard().catch(() => null);
  const toUsdcNumber = (value: string | number | bigint | null | undefined) => Number(toBigInt(value)) / 1_000_000;
  const approvedRewards = dashboard ? toBigInt(dashboard.rewards.approvedRewards) : 0n;
  const payableRewards = dashboard ? toBigInt(dashboard.rewards.payableRewards) : 0n;
  const hasOpenPayout = dashboard?.payouts.some((payout) => payout.status === "requested" || payout.status === "approved") ?? false;
  const payoutDisabledReason = !dashboard
    ? null
    : payableRewards <= 0n
      ? "目前沒有可提取獎勵，暫時不能提交提款申請。"
      : hasOpenPayout
        ? "已有審批中的提款申請，完成、取消或失敗後才可再次提交。"
        : null;

  return (
    <main className="stack">
      <section className="hero">
        <h1>獎勵</h1>
        <p>獎勵來自已確認的 Builder 費用收入。實際支付需要管理員審批。</p>
        <p>獎勵不是交易餘額，不能用作平台內下注或交易。</p>
        <p>支付資產為 Polygon 上的 pUSD，請確認你的收款地址支援 Polygon 網絡。</p>
        <p>實際支付不會自動執行，必須由管理員審批及記錄交易哈希。</p>
        <p>不會自動從金庫轉帳。</p>
        <div className="trust-badge-row">
          <span className="badge badge-warning">待確認獎勵</span>
          <span className="badge badge-success">可提取獎勵</span>
          <span className="badge badge-neutral">已支付獎勵</span>
          <span className="badge badge-warning">管理員審批</span>
        </div>
        <PendingReferralNotice />
      </section>
      <BetaLaunchDisclosure />
      <SharedSafetyDisclosure />
      <SharedRewardDisclosure />
      <SafetyDisclosure title="帳務提示">
        本頁只顯示推薦獎勵帳務紀錄，亦不代表盈利。所有項目支付前需經人工審批。
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
            {approvedRewards > 0n || hasOpenPayout ? (
              <MetricCard label="審批中提款" value={formatUsdc(approvedRewards, locale)} tone="warning" note="已鎖定等待管理員審批或記錄支付。" />
            ) : null}
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
            <p className="muted">支付資產為 Polygon pUSD。請確認你的收款地址支援 Polygon 網絡。</p>
            <p className="muted">實際支付不會自動執行，必須由管理員審批及記錄交易哈希。</p>
            <p className="muted">獎勵不是交易餘額，不能用作平台內下注或交易。</p>
            <form action={requestRewardPayoutAction} className="stack">
              <label className="stack">
                payout wallet
                <input
                  name="destinationValue"
                  placeholder="0x..."
                  pattern="^0x[a-fA-F0-9]{40}$"
                  title="請輸入有效的 0x EVM 錢包地址"
                  aria-describedby="payout-wallet-help payout-disabled-reason"
                  required
                />
              </label>
              <div id="payout-wallet-help" className="muted">只可申請不超過目前可提取獎勵的全額提款；提交後不會把獎勵標記為已支付。</div>
              {payoutDisabledReason ? <div id="payout-disabled-reason" className="status-bad">{payoutDisabledReason}</div> : null}
              <button type="submit" disabled={Boolean(payoutDisabledReason)}>提交支付申請</button>
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
                    <th>Builder 費用收入</th>
                    <th>獎勵金額</th>
                    <th>狀態</th>
                    <th>推薦來源 / 交易者 cashback</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.rewardLedger.map((entry) => {
                    const builderFeeRevenue = estimateBuilderFeeRevenue(entry.amountUsdcAtoms, entry.rewardType);

                    return (
                      <tr key={entry.id}>
                        <td>{formatDateTime(locale, entry.createdAt)}</td>
                        <td className="mono">{entry.sourceTradeAttributionId.slice(0, 8)}</td>
                        <td>{builderFeeRevenue === null ? "已確認 Builder 費用收入" : formatUsdc(builderFeeRevenue, locale)}</td>
                        <td>{formatUsdc(entry.amountUsdcAtoms, locale)}</td>
                        <td><StatusChip tone={statusTone(entry.status)}>{rewardStatusLabels[entry.status] ?? copy.statuses[entry.status] ?? entry.status}</StatusChip></td>
                        <td>{rewardContextLabels[entry.rewardType] ?? copy.rewardTypes[entry.rewardType] ?? entry.rewardType}</td>
                      </tr>
                    );
                  })}
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
                    <th>requested</th>
                    <th>approved</th>
                    <th>paid</th>
                    <th>failed</th>
                    <th>cancelled</th>
                    <th>{copy.amount}</th>
                    <th>{copy.payoutDestination}</th>
                    <th>tx hash</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.payouts.map((payout) => (
                    <tr key={payout.id}>
                      <td>{formatDateTime(locale, payout.createdAt)}</td>
                      <td>{payout.reviewedAt ? formatDateTime(locale, payout.reviewedAt) : "-"}</td>
                      <td>{payout.paidAt ? formatDateTime(locale, payout.paidAt) : "-"}</td>
                      <td>{payout.status === "failed" ? payoutStatusLabels[payout.status] : "-"}</td>
                      <td>{payout.status === "cancelled" ? payoutStatusLabels[payout.status] : "-"}</td>
                      <td>{formatUsdc(payout.amountUsdcAtoms, locale)}</td>
                      <td>
                        <div>{payout.destinationValue}</div>
                        <StatusChip tone={statusTone(payout.status)}>{payoutStatusLabels[payout.status] ?? copy.payoutStatuses[payout.status] ?? payout.status}</StatusChip>
                      </td>
                      <td className="mono">{payout.txHash ?? "-"}</td>
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
