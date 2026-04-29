import React from "react";
import { getAdminAmbassadorOverview } from "../../../lib/api";
import { formatUsdc } from "../../../lib/format";
import { defaultLocale, formatDateTime, getLocaleCopy } from "../../../lib/locale";

import {
  approveRewardPayoutAction,
  cancelRewardPayoutAction,
  failRewardPayoutAction,
  markRewardPayoutPaidAction,
} from "../actions";

export const dynamic = "force-dynamic";

const toCsv = (rows: Awaited<ReturnType<typeof getAdminAmbassadorOverview>>["payouts"]) => {
  const header = ["id", "recipient_user_id", "amount_usdc_atoms", "status", "destination_type", "destination_value"].join(",");
  const body = rows.map((row) => [
    row.id,
    row.recipientUserId,
    row.amountUsdcAtoms.toString(),
    row.status,
    row.destinationType,
    row.destinationValue.replaceAll(",", " "),
  ].join(","));
  return [header, ...body].join("\n");
};

export default async function AdminPayoutsPage() {
  const locale = defaultLocale;
  const copy = getLocaleCopy(locale).admin;
  const rewardCopy = getLocaleCopy(locale).rewards;
  const overview = await getAdminAmbassadorOverview().catch(() => null);
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
        <section className="panel stack">
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>{copy.userId}</th>
                <th>{rewardCopy.amount}</th>
                <th>{rewardCopy.status}</th>
                <th>{rewardCopy.payoutDestination}</th>
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
                  <td>{rewardCopy.payoutStatuses[payout.status] ?? payout.status}</td>
                  <td>{payout.destinationValue}</td>
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
                      <input name="txHash" placeholder={copy.txHash} />
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
      )}
    </main>
  );
}
