import React from "react";
import Link from "next/link";

import { getAdminAmbassadorOverview } from "../../lib/api";
import { defaultLocale, getLocaleCopy } from "../../lib/locale";
import { requireCurrentAdmin } from "../../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireCurrentAdmin();
  const locale = defaultLocale;
  const copy = getLocaleCopy(locale).admin;
  const ambassador = await getAdminAmbassadorOverview().catch(() => null);

  return (
    <main className="stack">
      <section className="hero">
        <h1>{copy.title}</h1>
        <p>{copy.subtitle}</p>
        <div className="badge badge-neutral">Polymarket Builder v1</div>
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
    </main>
  );
}
