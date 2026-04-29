import React from "react";

import { getPolymarketBuilderCode } from "@bet/integrations";

import { BuilderFeeDisclosureCard } from "../../builder-fee-disclosure-card";
import { defaultLocale, getLocaleCopy } from "../../../lib/locale";

export const dynamic = "force-dynamic";

const hasBuilderCode = (): boolean => {
  try {
    return getPolymarketBuilderCode() !== null;
  } catch {
    return false;
  }
};

export default function AdminPolymarketPage() {
  const copy = getLocaleCopy(defaultLocale).admin;
  const research = getLocaleCopy(defaultLocale).research;
  const builderConfigured = hasBuilderCode();
  const routedTradingEnabled = process.env.POLYMARKET_ROUTED_TRADING_ENABLED === "true";
  const submitterMode = process.env.POLYMARKET_CLOB_SUBMITTER ?? "disabled";
  const submitterAvailable = process.env.POLYMARKET_SUBMITTER_AVAILABLE === "true" || submitterMode !== "disabled";

  return (
    <main className="stack">
      <section className="hero">
        <h1>Polymarket 管理</h1>
        <p>{copy.subtitle}</p>
      </section>

      <BuilderFeeDisclosureCard
        locale={defaultLocale}
        hasBuilderCode={builderConfigured}
        routedTradingEnabled={routedTradingEnabled}
      />

      <section className="panel stack">
        <h2 className="section-title">Builder Code / routed trading / submitter debug</h2>
        <div className="kv"><span className="kv-key">{research.builderCodeConfigured}</span><span className="kv-value">{builderConfigured ? research.yes : research.no}</span></div>
        <div className="kv"><span className="kv-key">{research.routedTradingEnabled}</span><span className="kv-value">{routedTradingEnabled ? research.yes : research.no}</span></div>
        <div className="kv"><span className="kv-key">{research.submitterAvailable}</span><span className="kv-value">{submitterAvailable ? research.yes : research.no}</span></div>
        <div className="kv"><span className="kv-key">{research.orderSubmitterMode}</span><span className="kv-value">{submitterMode}</span></div>
        <p className="muted">Live routed trading remains disabled unless user-owned signing, Polymarket credential handling, and submitter readiness are production-safe.</p>
      </section>
    </main>
  );
}
