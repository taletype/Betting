import React from "react";
import { getAdminAmbassadorOverview, toBigInt } from "../../../lib/api";
import { PayoutStatusChart, VolumeHistoryChart } from "../../charts/market-charts";
import { formatUsdc } from "../../../lib/format";
import { defaultLocale, formatDateTime, getLocaleCopy } from "../../../lib/locale";

import {
  approveRewardPayoutAction,
  cancelRewardPayoutAction,
  failRewardPayoutAction,
  markRewardPayoutPaidAction,
} from "../actions";

export const dynamic = "force-dynamic";

const explorerBaseUrl = (process.env.POLYGON_EXPLORER_URL ?? "https://polygonscan.com").replace(/\/+$/, "");

const toCsv = (rows: Awaited<ReturnType<typeof getAdminAmbassadorOverview>>["payouts"]) => {
  const header = [
    "id",
    "recipient_user_id",
    "amount_usdc_atoms",
    "status",
    "payout_chain",
    "payout_asset",
    "destination_type",
    "destination_value",
    "tx_hash",
  ].join(",");
  const body = rows.map((row) => [
    row.id,
    row.recipientUserId,
    row.amountUsdcAtoms.toString(),
    row.status,
    row.payoutChain,
    row.payoutAsset,
    row.destinationType,
    row.destinationValue.replaceAll(",", " "),
    row.txHash ?? "",
  ].join(","));
  return [header, ...body].join("\n");
};

export default async function AdminPayoutsPage() {
  const locale = defaultLocale;
  const copy = getLocaleCopy(locale).admin;
  const rewardCopy = getLocaleCopy(locale).rewards;
  const overview = await getAdminAmbassadorOverview().catch(() => null);
  const toUsdcNumber = (value: string | number | bigint | null | undefined) => Number(toBigInt(value)) / 1_000_000;
  const csvHref = overview
    ? `data:text/csv;charset=utf-8,${encodeURIComponent(toCsv(overview.payouts))}`
    : "#";

  return (
    <main className="stack">
      <section className="hero">
        <h1>{copy.payoutReview}</h1>
        <p>{copy.subtitle}</p>
        <a href={csvHref} download="ambassador-payouts.csv">{copy.exportCsv}</a>
      </section>

      {!overview ? (
        <div className="panel empty-state">{copy.noRows}</div>
      ) : overview.payouts.length === 0 ? (
        <div className="panel empty-state">{copy.noRows}</div>
      ) : (
        <>
        <section className="grid">
          <PayoutStatusChart
            points={["requested", "approved", "paid", "failed", "cancelled"].map((status) => ({
              label: rewardCopy.payoutStatuses[status] ?? status,
              value: overview.payouts.filter((payout) => payout.status === status).length,
              tone: status === "paid" ? "bid" : status === "failed" || status === "cancelled" ? "ask" : "volume",
            }))}
          />
          <VolumeHistoryChart
            points={overview.payouts.map((payout) => ({
              timestamp: payout.createdAt,
              value: toUsdcNumber(payout.amountUsdcAtoms),
            }))}
          />
        </section>
        <section className="panel stack">
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>{copy.userId}</th>
                <th>{rewardCopy.amount}</th>
                <th>{copy.payoutRail}</th>
                <th>{copy.asset}</th>
                <th>{rewardCopy.status}</th>
                <th>{rewardCopy.payoutDestination}</th>
                <th>{copy.txHash}</th>
                <th>{copy.approve}</th>
                <th>{copy.markPaid}</th>
                <th>{copy.markFailed}</th>
              </tr>
            </thead>
            <tbody>
              {overview.payouts.map((payout) => (
                <tr key={payout.id}>
                  <td className="mono">{payout.id.slice(0, 8)}</td>
                  <td className="mono">{payout.recipientUserId}</td>
                  <td>{formatUsdc(payout.amountUsdcAtoms, locale)}</td>
                  <td>{payout.payoutChain} #{payout.payoutChainId}</td>
                  <td>{payout.payoutAsset}</td>
                  <td>{rewardCopy.payoutStatuses[payout.status] ?? payout.status}</td>
                  <td>{payout.destinationValue}</td>
                  <td>
                    {payout.txHash ? (
                      <a href={`${explorerBaseUrl}/tx/${payout.txHash}`} target="_blank" rel="noreferrer">
                        {copy.polygonscan}
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>
                    <form action={approveRewardPayoutAction} className="stack">
                      <input type="hidden" name="payoutId" value={payout.id} />
                      <input name="notes" placeholder={copy.notes} />
                      <button type="submit" disabled={payout.status !== "requested"}>{copy.approve}</button>
                    </form>
                  </td>
                  <td>
                    <form action={markRewardPayoutPaidAction} className="stack">
                      <input type="hidden" name="payoutId" value={payout.id} />
                      <input name="txHash" placeholder={copy.txHash} required />
                      <input name="notes" placeholder={copy.notes} />
                      <button type="submit" disabled={payout.status !== "approved"}>{copy.markPaid}</button>
                    </form>
                  </td>
                  <td>
                    <form action={failRewardPayoutAction} className="stack">
                      <input type="hidden" name="payoutId" value={payout.id} />
                      <input name="notes" placeholder={copy.notes} required />
                      <button type="submit" disabled={payout.status === "paid"}>{copy.markFailed}</button>
                    </form>
                    <form action={cancelRewardPayoutAction} className="stack">
                      <input type="hidden" name="payoutId" value={payout.id} />
                      <input name="notes" placeholder={copy.notes} required />
                      <button type="submit" disabled={payout.status === "paid"}>{copy.cancel}</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="muted">Updated {formatDateTime(locale, new Date().toISOString())}</div>
        </section>
        </>
      )}
    </main>
  );
}
