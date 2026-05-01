import React from "react";
import { defaultLocale, formatDateTime, getLocaleCopy, getLocaleHref, type AppLocale } from "../../lib/locale";
import { formatUsdc } from "../../lib/format";
import { toBigInt } from "../../lib/api";
import { resolveAmbassadorDashboardState } from "../ambassador-dashboard-state";
import { PayoutStatusChart, RewardSplitChart, VolumeHistoryChart } from "../charts/market-charts";
import { PendingReferralNotice } from "../pending-referral-notice";
import { BetaLaunchDisclosure, EmptyState, MetricCard, SharedRewardDisclosure, SharedSafetyDisclosure, SafetyDisclosure, StatusChip, type Tone } from "../product-ui";
import { requestRewardPayoutAction } from "./reward-actions";

export const dynamic = "force-dynamic";

const rewardsPageCopy: Record<AppLocale, {
  noPayableRewards: string;
  openPayout: string;
  heroExtraOne: string;
  heroExtraTwo: string;
  noAutoTreasury: string;
  pendingRewards: string;
  payableRewards: string;
  paidRewards: string;
  accountingNoticeTitle: string;
  accountingNoticeBody: string;
  signedOutBody: string;
  pendingNote: string;
  payableNote: string;
  paidNote: string;
  approvedPayout: string;
  approvedPayoutNote: string;
  pendingShort: string;
  payableShort: string;
  paidShort: string;
  payoutReviewTitle: string;
  payoutWallet: string;
  payoutWalletTitle: string;
  payoutHelp: string;
  submitPayout: string;
  rewardLedgerEmptyTitle: string;
  rewardLedgerEmptyBody: string;
  date: string;
  builderFeeRevenue: string;
  rewardAmount: string;
  context: string;
  confirmedBuilderFeeRevenue: string;
  payoutEmptyTitle: string;
  payoutEmptyBody: string;
  requested: string;
  approved: string;
  paid: string;
  failed: string;
  cancelled: string;
}> = {
  en: {
    noPayableRewards: "There are no payable rewards right now, so a payout request cannot be submitted.",
    openPayout: "A payout request is already under review. You can submit again after it is completed, cancelled, or failed.",
    heroExtraOne: "Rewards are not trading balances and cannot be used for in-app betting or trading.",
    heroExtraTwo: "The payout asset is pUSD on Polygon. Make sure your receiving address supports Polygon.",
    noAutoTreasury: "Treasury transfers are never automatic.",
    pendingRewards: "Pending rewards",
    payableRewards: "Payable rewards",
    paidRewards: "Paid rewards",
    accountingNoticeTitle: "Accounting note",
    accountingNoticeBody: "This page shows referral reward accounting only; it does not represent profit. Every payout requires manual approval before payment.",
    signedOutBody: "Log in to view your referral reward ledger and manual payout requests.",
    pendingNote: "Still waiting for Builder-fee revenue and attribution confirmation.",
    payableNote: "Available for manual payout request.",
    paidNote: "Marked paid by an admin.",
    approvedPayout: "Payout under review",
    approvedPayoutNote: "Locked while waiting for admin approval or payout recording.",
    pendingShort: "Pending",
    payableShort: "Payable",
    paidShort: "Paid",
    payoutReviewTitle: "Request manual payout",
    payoutWallet: "Payout wallet",
    payoutWalletTitle: "Enter a valid 0x EVM wallet address",
    payoutHelp: "You can request only the full amount up to your current payable rewards. Submitting does not mark rewards as paid.",
    submitPayout: "Submit payout request",
    rewardLedgerEmptyTitle: "No reward records yet",
    rewardLedgerEmptyBody: "Referral reward accounting will appear here after eligible trades are confirmed.",
    date: "Date",
    builderFeeRevenue: "Builder-fee revenue",
    rewardAmount: "Reward amount",
    context: "Referrer / trader cashback",
    confirmedBuilderFeeRevenue: "Confirmed Builder-fee revenue",
    payoutEmptyTitle: "No payout requests yet",
    payoutEmptyBody: "Review status will appear here after you submit a manual payout request.",
    requested: "requested",
    approved: "approved",
    paid: "paid",
    failed: "failed",
    cancelled: "cancelled",
  },
  "zh-HK": {
    noPayableRewards: "目前沒有可提取獎勵，暫時不能提交提款申請。",
    openPayout: "已有審批中的提款申請，完成、取消或失敗後才可再次提交。",
    heroExtraOne: "獎勵不是交易餘額，不能用作平台內下注或交易。",
    heroExtraTwo: "支付資產為 Polygon pUSD（Polygon 上的 pUSD），請確認你的收款地址支援 Polygon 網絡。",
    noAutoTreasury: "不會自動從金庫轉帳。",
    pendingRewards: "待確認獎勵",
    payableRewards: "可提取獎勵",
    paidRewards: "已支付獎勵",
    accountingNoticeTitle: "帳務提示",
    accountingNoticeBody: "本頁只顯示推薦獎勵帳務紀錄，亦不代表盈利。所有項目支付前需經人工審批。",
    signedOutBody: "登入後可查看你的推薦獎勵帳本及人工支付申請。",
    pendingNote: "仍需確認 Builder 費用收入及歸因。",
    payableNote: "可提交人工支付申請。",
    paidNote: "已由管理員標記為支付完成。",
    approvedPayout: "審批中提款",
    approvedPayoutNote: "已鎖定等待管理員審批或記錄支付。",
    pendingShort: "待確認",
    payableShort: "可提取",
    paidShort: "已支付",
    payoutReviewTitle: "申請人工支付",
    payoutWallet: "payout wallet",
    payoutWalletTitle: "請輸入有效的 0x EVM 錢包地址",
    payoutHelp: "只可申請不超過目前可提取獎勵的全額提款；提交後不會把獎勵標記為已支付。",
    submitPayout: "提交支付申請",
    rewardLedgerEmptyTitle: "暫時未有獎勵紀錄",
    rewardLedgerEmptyBody: "合資格交易確認後，推薦獎勵帳務會顯示於此。",
    date: "日期",
    builderFeeRevenue: "Builder 費用收入",
    rewardAmount: "獎勵金額",
    context: "推薦來源 / 交易者 cashback",
    confirmedBuilderFeeRevenue: "已確認 Builder 費用收入",
    payoutEmptyTitle: "暫時未有支付申請",
    payoutEmptyBody: "提交人工支付申請後，審批狀態會顯示於此。",
    requested: "requested",
    approved: "approved",
    paid: "paid",
    failed: "failed",
    cancelled: "cancelled",
  },
  "zh-CN": {
    noPayableRewards: "目前没有可提现奖励，暂时不能提交提款申请。",
    openPayout: "已有审核中的提款申请，完成、取消或失败后才可再次提交。",
    heroExtraOne: "奖励不是交易余额，不能用作平台内下注或交易。",
    heroExtraTwo: "支付资产为 Polygon 上的 pUSD，请确认你的收款地址支持 Polygon 网络。",
    noAutoTreasury: "不会自动从金库转账。",
    pendingRewards: "待确认奖励",
    payableRewards: "可提现奖励",
    paidRewards: "已支付奖励",
    accountingNoticeTitle: "账务提示",
    accountingNoticeBody: "本页只显示推荐奖励账务记录，也不代表盈利。所有项目支付前都需人工审核。",
    signedOutBody: "登录后可查看你的推荐奖励账本及人工支付申请。",
    pendingNote: "仍需确认 Builder 费用收入及归因。",
    payableNote: "可提交人工支付申请。",
    paidNote: "已由管理员标记为支付完成。",
    approvedPayout: "审核中提款",
    approvedPayoutNote: "已锁定等待管理员审核或记录支付。",
    pendingShort: "待确认",
    payableShort: "可提现",
    paidShort: "已支付",
    payoutReviewTitle: "申请人工支付",
    payoutWallet: "payout wallet",
    payoutWalletTitle: "请输入有效的 0x EVM 钱包地址",
    payoutHelp: "只可申请不超过目前可提现奖励的全额提款；提交后不会把奖励标记为已支付。",
    submitPayout: "提交支付申请",
    rewardLedgerEmptyTitle: "暂时没有奖励记录",
    rewardLedgerEmptyBody: "合资格交易确认后，推荐奖励账务会显示于此。",
    date: "日期",
    builderFeeRevenue: "Builder 费用收入",
    rewardAmount: "奖励金额",
    context: "推荐来源 / 交易者 cashback",
    confirmedBuilderFeeRevenue: "已确认 Builder 费用收入",
    payoutEmptyTitle: "暂时没有支付申请",
    payoutEmptyBody: "提交人工支付申请后，审核状态会显示于此。",
    requested: "requested",
    approved: "approved",
    paid: "paid",
    failed: "failed",
    cancelled: "cancelled",
  },
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

export async function renderRewardsPage(locale: AppLocale, resolvedState?: Awaited<ReturnType<typeof resolveAmbassadorDashboardState>>) {
  const copy = getLocaleCopy(locale).rewards;
  const authCopy = getLocaleCopy(locale).auth;
  const pageCopy = rewardsPageCopy[locale];
  const state = resolvedState ?? await resolveAmbassadorDashboardState();
  const dashboard = state.kind === "ok" ? state.dashboard : null;
  const toUsdcNumber = (value: string | number | bigint | null | undefined) => Number(toBigInt(value)) / 1_000_000;
  const approvedRewards = dashboard ? toBigInt(dashboard!.rewards.approvedRewards) : 0n;
  const payableRewards = dashboard ? toBigInt(dashboard!.rewards.payableRewards) : 0n;
  const hasOpenPayout = dashboard?.payouts.some((payout) => payout.status === "requested" || payout.status === "approved") ?? false;
  const payoutDisabledReason = !dashboard
    ? null
    : payableRewards <= 0n
      ? pageCopy.noPayableRewards
      : hasOpenPayout
        ? pageCopy.openPayout
        : null;

  return (
    <main className="stack">
      <section className="hero">
        <h1>{copy.title}</h1>
        <p>{copy.subtitle}</p>
        <p>{pageCopy.heroExtraOne}</p>
        <p>{pageCopy.heroExtraTwo}</p>
        <p>{copy.adminApprovalNotice}</p>
        <p>{pageCopy.noAutoTreasury}</p>
        <div className="trust-badge-row">
          <span className="badge badge-warning">{pageCopy.pendingRewards}</span>
          <span className="badge badge-success">{pageCopy.payableRewards}</span>
          <span className="badge badge-neutral">{pageCopy.paidRewards}</span>
          <span className="badge badge-warning">{copy.adminApprovalNotice.includes("admin") ? "Admin approval" : "管理員審批"}</span>
        </div>
        <PendingReferralNotice />
      </section>
      <BetaLaunchDisclosure locale={locale} />
      <SharedSafetyDisclosure locale={locale} />
      <SharedRewardDisclosure locale={locale} />
      <SafetyDisclosure title={pageCopy.accountingNoticeTitle}>{pageCopy.accountingNoticeBody}</SafetyDisclosure>

      {state.kind === "signed_out" ? (
        <section className="panel stack">
          <EmptyState title={authCopy.sessionRequired}>{pageCopy.signedOutBody}</EmptyState>
          <a href={getLocaleHref(locale, "/login")}>{authCopy.login}</a>
        </section>
      ) : state.kind === "expired_session" ? (
        <section className="panel stack">
          <EmptyState title="登入狀態已過期，請重新登入。">登入狀態已過期，請重新登入。</EmptyState>
          <a href={getLocaleHref(locale, "/login")}>{authCopy.login}</a>
        </section>
      ) : state.kind === "unavailable" ? (
        <section className="panel stack">
          <EmptyState title="已登入，但獎勵資料暫時未能載入。請重新整理或稍後再試。">已登入，但獎勵資料暫時未能載入。請重新整理或稍後再試。</EmptyState>
          <a href={getLocaleHref(locale, "/rewards")}>{locale === "en" ? "Retry" : "重新整理"}</a>
        </section>
      ) : (
        <>
          <section className="grid">
            <MetricCard label={pageCopy.pendingRewards} value={formatUsdc(dashboard!.rewards.pendingRewards, locale)} tone="warning" note={pageCopy.pendingNote} />
            <MetricCard label={pageCopy.payableRewards} value={formatUsdc(dashboard!.rewards.payableRewards, locale)} tone="success" note={pageCopy.payableNote} />
            <MetricCard label={pageCopy.paidRewards} value={formatUsdc(dashboard!.rewards.paidRewards, locale)} note={pageCopy.paidNote} />
            {approvedRewards > 0n || hasOpenPayout ? (
              <MetricCard label={pageCopy.approvedPayout} value={formatUsdc(approvedRewards, locale)} tone="warning" note={pageCopy.approvedPayoutNote} />
            ) : null}
          </section>

          <section className="grid">
            <RewardSplitChart
              points={[
                { label: pageCopy.pendingShort, value: toUsdcNumber(dashboard!.rewards.pendingRewards), tone: "volume" },
                { label: pageCopy.payableShort, value: toUsdcNumber(dashboard!.rewards.payableRewards), tone: "bid" },
                { label: pageCopy.paidShort, value: toUsdcNumber(dashboard!.rewards.paidRewards), tone: "liquidity" },
              ]}
            />
            <PayoutStatusChart
              points={["requested", "approved", "paid", "failed", "cancelled"].map((status) => ({
                label: copy.payoutStatuses[status] ?? status,
                value: dashboard!.payouts.filter((payout) => payout.status === status).length,
                tone: status === "paid" ? "bid" : status === "failed" || status === "cancelled" ? "ask" : "volume",
              }))}
            />
            <VolumeHistoryChart
              points={dashboard!.rewardLedger.map((entry) => ({
                timestamp: entry.createdAt,
                value: toUsdcNumber(entry.amountUsdcAtoms),
              }))}
            />
          </section>

          <section className="panel stack">
            <h2 className="section-title">{pageCopy.payoutReviewTitle}</h2>
            <p className="muted">{copy.polygonPusdNotice}</p>
            <p className="muted">{copy.adminApprovalNotice}</p>
            <p className="muted">{pageCopy.heroExtraOne}</p>
            <form action={requestRewardPayoutAction} className="stack">
              <label className="stack">
                {pageCopy.payoutWallet}
                <input
                  name="destinationValue"
                  placeholder="0x..."
                  pattern="^0x[a-fA-F0-9]{40}$"
                  title={pageCopy.payoutWalletTitle}
                  aria-describedby="payout-wallet-help payout-disabled-reason"
                  required
                />
              </label>
              <div id="payout-wallet-help" className="muted">{pageCopy.payoutHelp}</div>
              {payoutDisabledReason ? <div id="payout-disabled-reason" className="status-bad">{payoutDisabledReason}</div> : null}
              <button type="submit" disabled={Boolean(payoutDisabledReason)}>{pageCopy.submitPayout}</button>
            </form>
          </section>

          <section className="panel stack">
            <h2 className="section-title">{copy.ledger}</h2>
            {dashboard!.rewardLedger.length === 0 ? (
              <EmptyState title={pageCopy.rewardLedgerEmptyTitle}>{pageCopy.rewardLedgerEmptyBody}</EmptyState>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>{pageCopy.date}</th>
                    <th>{copy.sourceTrade}</th>
                    <th>{pageCopy.builderFeeRevenue}</th>
                    <th>{pageCopy.rewardAmount}</th>
                    <th>{copy.status}</th>
                    <th>{pageCopy.context}</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard!.rewardLedger.map((entry) => {
                    const builderFeeRevenue = estimateBuilderFeeRevenue(entry.amountUsdcAtoms, entry.rewardType);

                    return (
                      <tr key={entry.id}>
                        <td>{formatDateTime(locale, entry.createdAt)}</td>
                        <td className="mono">{entry.sourceTradeAttributionId.slice(0, 8)}</td>
                        <td>{builderFeeRevenue === null ? pageCopy.confirmedBuilderFeeRevenue : formatUsdc(builderFeeRevenue, locale)}</td>
                        <td>{formatUsdc(entry.amountUsdcAtoms, locale)}</td>
                        <td><StatusChip tone={statusTone(entry.status)}>{copy.statuses[entry.status] ?? entry.status}</StatusChip></td>
                        <td>{copy.rewardTypes[entry.rewardType] ?? entry.rewardType}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>

          <section className="panel stack">
            <h2 className="section-title">{copy.payouts}</h2>
            {dashboard!.payouts.length === 0 ? (
              <EmptyState title={pageCopy.payoutEmptyTitle}>{pageCopy.payoutEmptyBody}</EmptyState>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>{pageCopy.requested}</th>
                    <th>{pageCopy.approved}</th>
                    <th>{pageCopy.paid}</th>
                    <th>{pageCopy.failed}</th>
                    <th>{pageCopy.cancelled}</th>
                    <th>{copy.amount}</th>
                    <th>{copy.payoutDestination}</th>
                    <th>tx hash</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard!.payouts.map((payout) => (
                    <tr key={payout.id}>
                      <td>{formatDateTime(locale, payout.createdAt)}</td>
                      <td>{payout.reviewedAt ? formatDateTime(locale, payout.reviewedAt) : "-"}</td>
                      <td>{payout.paidAt ? formatDateTime(locale, payout.paidAt) : "-"}</td>
                      <td>{payout.status === "failed" ? copy.payoutStatuses[payout.status] : "-"}</td>
                      <td>{payout.status === "cancelled" ? copy.payoutStatuses[payout.status] : "-"}</td>
                      <td>{formatUsdc(payout.amountUsdcAtoms, locale)}</td>
                      <td>
                        <div>{payout.destinationValue}</div>
                        <StatusChip tone={statusTone(payout.status)}>{copy.payoutStatuses[payout.status] ?? payout.status}</StatusChip>
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

export default async function RewardsPage() {
  return renderRewardsPage(defaultLocale);
}
