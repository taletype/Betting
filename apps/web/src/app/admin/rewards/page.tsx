import React from "react";
import { getAdminAmbassadorOverview, toBigInt } from "../../../lib/api";
import { RewardSplitChart, VolumeHistoryChart } from "../../charts/market-charts";
import { formatUsdc } from "../../../lib/format";
import { defaultLocale, formatDateTime, getLocaleCopy } from "../../../lib/locale";

import {
  markRewardsPayableAction,
  recordMockBuilderTradeAction,
  voidTradeRewardsAction,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminRewardsPage() {
  const locale = defaultLocale;
  const copy = getLocaleCopy(locale).admin;
  const rewardCopy = getLocaleCopy(locale).rewards;
  const overview = await getAdminAmbassadorOverview().catch(() => null);
  const toUsdcNumber = (value: string | number | bigint | null | undefined) => Number(toBigInt(value)) / 1_000_000;

  return (
    <main className="stack">
      <section className="hero">
        <h1>{copy.rewardLedger}</h1>
        <p>{copy.subtitle}</p>
      </section>

      {!overview ? (
        <div className="panel empty-state">{copy.noRows}</div>
      ) : (
        <>
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
            {overview.tradeAttributions.length === 0 ? (
              <div className="empty-state">{copy.noRows}</div>
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
                  {overview.tradeAttributions.map((trade) => (
                    <tr key={trade.id}>
                      <td className="mono">{trade.id.slice(0, 8)}</td>
                      <td className="mono">{trade.userId}</td>
                      <td>{formatUsdc(trade.builderFeeUsdcAtoms, locale)}</td>
                      <td>{trade.status}</td>
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
            {overview.rewardLedger.length === 0 ? (
              <div className="empty-state">{copy.noRows}</div>
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
                  {overview.rewardLedger.map((entry) => (
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
