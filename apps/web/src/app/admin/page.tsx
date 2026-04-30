import React from "react";
import Link from "next/link";

import { getAdminAmbassadorOverview, toBigInt } from "../../lib/api";
import { formatUsdc } from "../../lib/format";
import { defaultLocale, getLocaleCopy } from "../../lib/locale";
import { requireCurrentAdmin } from "../../lib/supabase/server";
import { MetricCard, StatusChip } from "../product-ui";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireCurrentAdmin();
  const locale = defaultLocale;
  const copy = getLocaleCopy(locale).admin;
  const ambassador = await getAdminAmbassadorOverview().catch(() => null);
  const rewardTotal = (status: string) =>
    ambassador?.rewardLedger
      .filter((entry) => entry.status === status)
      .reduce((sum, entry) => sum + toBigInt(entry.amountUsdcAtoms), 0n) ?? 0n;

  return (
    <main className="stack">
      <section className="hero">
        <h1>管理營運中心</h1>
        <p>覆核直接推薦歸因、Builder 費用獎勵帳務、人工支付隊列及 Polymarket 市場同步狀態。</p>
        <div className="trust-badge-row">
          <StatusChip>不顯示 Builder Code</StatusChip>
          <StatusChip>人工審批支付</StatusChip>
          <StatusChip>交易 readiness 只讀</StatusChip>
        </div>
      </section>

      <section className="grid">
        <Link className="panel stack" href="/admin/ambassadors">
          <strong>{copy.ambassadors}</strong>
          <div className="metric-sm">{ambassador?.codes.length.toLocaleString(locale) ?? "-"}</div>
        </Link>
        <Link className="panel stack" href="/admin/rewards">
          <strong>{copy.rewards}</strong>
          <div className="metric-sm">{ambassador?.rewardLedger.length.toLocaleString(locale) ?? "-"}</div>
        </Link>
        <Link className="panel stack" href="/admin/payouts">
          <strong>{copy.payouts}</strong>
          <div className="metric-sm">{ambassador?.payouts.length.toLocaleString(locale) ?? "-"}</div>
        </Link>
        <Link className="panel stack" href="/admin/polymarket">
          <strong>Polymarket 管理</strong>
          <div className="metric-sm">Builder</div>
        </Link>
      </section>

      <section className="grid">
        <MetricCard label="待確認獎勵" value={formatUsdc(rewardTotal("pending"), locale)} tone="warning" />
        <MetricCard label="可支付獎勵" value={formatUsdc(rewardTotal("payable"), locale)} tone="success" />
        <MetricCard label="已支付獎勵" value={formatUsdc(rewardTotal("paid"), locale)} />
        <MetricCard label="待處理支付申請" value={(ambassador?.payouts.filter((payout) => payout.status === "requested").length ?? 0).toLocaleString(locale)} tone="info" />
      </section>
    </main>
  );
}
