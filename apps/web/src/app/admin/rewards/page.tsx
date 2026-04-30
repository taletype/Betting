import React from "react";
import { getAdminAmbassadorOverview, toBigInt } from "../../../lib/api";
import { requireCurrentAdmin } from "../../../lib/supabase/server";
import { RewardSplitChart, VolumeHistoryChart } from "../../charts/market-charts";
import { formatUsdc } from "../../../lib/format";
import { defaultLocale, formatDateTime, getLocaleCopy } from "../../../lib/locale";

import {
  markRewardsPayableAction,
  recordMockBuilderTradeAction,
  voidTradeRewardsAction,
} from "../actions";
import { EmptyState, MetricCard, StatusChip } from "../../product-ui";

export const dynamic = "force-dynamic";

export default async function AdminRewardsPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>;
}) {
  await requireCurrentAdmin();
  const locale = defaultLocale;
  const copy = getLocaleCopy(locale).admin;
  const rewardCopy = getLocaleCopy(locale).rewards;
  const overview = await getAdminAmbassadorOverview().catch(() => null);
  const toUsdcNumber = (value: string | number | bigint | null | undefined) => Number(toBigInt(value)) / 1_000_000;
  const q = (await searchParams)?.q?.trim().toLowerCase() ?? "";
  const visibleTrades = overview?.tradeAttributions.filter((trade) => !q || `${trade.id} ${trade.userId} ${trade.marketSlug ?? ""} ${trade.conditionId ?? ""} ${trade.status}`.toLowerCase().includes(q)) ?? [];
  const visibleRewards = overview?.rewardLedger.filter((entry) => !q || `${entry.id} ${entry.recipientUserId} ${entry.sourceTradeAttributionId} ${entry.status}`.toLowerCase().includes(q)) ?? [];
  const rewardTotal = (status: string) =>
    overview?.rewardLedger
      .filter((entry) => entry.status === status)
      .reduce((sum, entry) => sum + toBigInt(entry.amountUsdcAtoms), 0n) ?? 0n;

  return (
    <main className="stack">
      <section className="hero">
        <h1>獎勵帳務管理</h1>
        <p>覆核 Builder 歸因狀態、確認待處理獎勵、將合資格紀錄標記為可支付，或作廢有問題歸因。</p>
      </section>

      {!overview ? (
        <EmptyState title={copy.noRows} />
      ) : (
        <>
          <form className="panel filters admin-filter-bar" action="/admin/rewards">
            <label className="stack">
              搜尋推薦碼 / 歸因 ID / 用戶 ID
              <input name="q" defaultValue={q} placeholder="輸入用戶、歸因或市場 ID" />
            </label>
            <button type="submit">搜尋</button>
            <a className="button-link secondary" href="/admin/rewards">重設</a>
          </form>
          <section className="grid">
            <MetricCard label="待確認獎勵" value={formatUsdc(rewardTotal("pending"), locale)} tone="warning" />
            <MetricCard label="可支付獎勵" value={formatUsdc(rewardTotal("payable"), locale)} tone="success" />
            <MetricCard label="已支付獎勵" value={formatUsdc(rewardTotal("paid"), locale)} />
            <MetricCard label="Builder 歸因狀態" value={`${overview.tradeAttributions.filter((trade) => trade.status === "confirmed").length}/${overview.tradeAttributions.length}`} note="已確認 / 全部歸因" tone="info" />
          </section>
          <section className="grid">
            <RewardSplitChart
              points={["pending", "payable", "paid", "void"].map((status) => ({
                label: rewardCopy.statuses[status] ?? status,
                value: overview.rewardLedger.filter((entry) => entry.status === status).reduce((sum, entry) => sum + toUsdcNumber(entry.amountUsdcAtoms), 0),
                tone: status === "paid" ? "bid" : status === "void" ? "ask" : "volume",
              }))}
            />
            <VolumeHistoryChart
              points={overview.tradeAttributions.map((trade) => ({
                timestamp: trade.confirmedAt ?? new Date().toISOString(),
                value: toUsdcNumber(trade.builderFeeUsdcAtoms),
              }))}
            />
          </section>
          <section className="panel stack">
            <h2 className="section-title">{copy.manualTrade}</h2>
            <form action={recordMockBuilderTradeAction} className="stack">
              <input name="userId" placeholder={copy.userId} required />
              <input name="polymarketOrderId" placeholder="Polymarket order ID" />
              <input name="polymarketTradeId" placeholder="Polymarket trade ID" />
              <input name="conditionId" placeholder="Condition ID" />
              <input name="marketSlug" placeholder="Market slug" />
              <input name="notionalUsdcAtoms" type="number" min="1" placeholder={copy.notional} required />
              <input name="builderFeeUsdcAtoms" type="number" min="1" placeholder={copy.builderFee} required />
              <button type="submit">{copy.recordConfirmedTrade}</button>
            </form>
          </section>

          <section className="panel stack">
            <h2 className="section-title">{copy.tradeAttributions}</h2>
            {visibleTrades.length === 0 ? (
              <EmptyState title={copy.noRows} />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>{copy.userId}</th>
                    <th>{copy.builderFee}</th>
                    <th>{copy.status}</th>
                    <th>{copy.markPayable}</th>
                    <th>Void</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTrades.map((trade) => (
                    <tr key={trade.id}>
                      <td className="mono">{trade.id.slice(0, 8)}</td>
                      <td className="mono">{trade.userId}</td>
                      <td>{formatUsdc(trade.builderFeeUsdcAtoms, locale)}</td>
                      <td><StatusChip tone={trade.status === "confirmed" ? "success" : trade.status === "void" ? "danger" : "warning"}>{trade.status}</StatusChip></td>
                      <td>
                        <form action={markRewardsPayableAction}>
                          <input type="hidden" name="tradeAttributionId" value={trade.id} />
                          <button type="submit" disabled={trade.status !== "confirmed"}>{copy.markPayable}</button>
                        </form>
                      </td>
                      <td>
                        <form action={voidTradeRewardsAction} className="stack">
                          <input type="hidden" name="tradeAttributionId" value={trade.id} />
                          <input name="reason" placeholder={copy.reason} required />
                          <button type="submit">Void</button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="panel stack">
            <h2 className="section-title">{copy.rewardLedger}</h2>
            {visibleRewards.length === 0 ? (
              <EmptyState title={copy.noRows} />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>{rewardCopy.sourceTrade}</th>
                    <th>{rewardCopy.rewardType}</th>
                    <th>{rewardCopy.amount}</th>
                    <th>{rewardCopy.status}</th>
                    <th>{rewardCopy.created}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRewards.map((entry) => (
                    <tr key={entry.id}>
                      <td className="mono">{entry.sourceTradeAttributionId.slice(0, 8)}</td>
                      <td>{rewardCopy.rewardTypes[entry.rewardType] ?? entry.rewardType}</td>
                      <td>{formatUsdc(entry.amountUsdcAtoms, locale)}</td>
                      <td>{rewardCopy.statuses[entry.status] ?? entry.status}</td>
                      <td>{formatDateTime(locale, entry.createdAt)}</td>
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
