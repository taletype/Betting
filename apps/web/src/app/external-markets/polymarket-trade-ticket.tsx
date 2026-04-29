"use client";

import React, { useEffect } from "react";

import { getPolymarketRoutingReadiness } from "./polymarket-routing-readiness";
import { trackFunnelEvent } from "../funnel-analytics";
import { getLocaleCopy, type AppLocale } from "../../lib/locale";

interface Props {
  marketTitle: string;
  outcome: string;
  side: "buy" | "sell";
  price: number | null;
  size: number | null;
  hasBuilderCode: boolean;
  featureEnabled: boolean;
  walletConnected: boolean;
  hasCredentials: boolean;
  marketTradable: boolean;
  submitterAvailable: boolean;
  userSigned?: boolean;
  submitted?: boolean;
  locale: AppLocale;
}

const formatNum = (value: number | null): string => (value === null ? "—" : value.toFixed(3));

export function PolymarketTradeTicket(props: Props) {
  const copy = getLocaleCopy(props.locale).research;
  const readiness = getPolymarketRoutingReadiness(props);
  const disabled = readiness !== "ready_to_submit";
  const estimated = props.price === null || props.size === null ? null : props.price * props.size;
  const readinessLabel = copy.readinessCopy[readiness] ?? readiness;

  useEffect(() => {
    if (disabled) {
      trackFunnelEvent("routed_trade_disabled_reason", {
        reason: readiness,
        market: props.marketTitle,
        builderCodeConfigured: props.hasBuilderCode,
        routedTradingEnabled: props.featureEnabled,
        walletConnected: props.walletConnected,
        hasCredentials: props.hasCredentials,
        marketTradable: props.marketTradable,
        submitterAvailable: props.submitterAvailable,
      });
    }
  }, [
    disabled,
    props.featureEnabled,
    props.hasBuilderCode,
    props.hasCredentials,
    props.marketTitle,
    props.marketTradable,
    props.submitterAvailable,
    props.walletConnected,
    readiness,
  ]);

  return (
    <div className="market-actions stack">
      <strong>{copy.tradeViaPolymarket}</strong>
      <div className="muted">{copy.nonCustodialNotice}</div>
      <div className="readiness-grid">
        <div className="kv"><span className="kv-key">{copy.builderCodeConfigured}</span><span className="kv-value">{props.hasBuilderCode ? copy.yes : copy.no}</span></div>
        <div className="kv"><span className="kv-key">{copy.routedTradingEnabled}</span><span className="kv-value">{props.featureEnabled ? copy.yes : copy.no}</span></div>
        <div className="kv"><span className="kv-key">{copy.walletConnected}</span><span className="kv-value">{props.walletConnected ? copy.yes : copy.no}</span></div>
        <div className="kv"><span className="kv-key">{copy.polymarketCredentials}</span><span className="kv-value">{props.hasCredentials ? copy.yes : copy.no}</span></div>
        <div className="kv"><span className="kv-key">{copy.marketTradable}</span><span className="kv-value">{props.marketTradable ? copy.yes : copy.no}</span></div>
        <div className="kv"><span className="kv-key">{copy.submitterAvailable}</span><span className="kv-value">{props.submitterAvailable ? copy.yes : copy.no}</span></div>
      </div>
      <div className="kv"><span className="kv-key">{copy.market}</span><span className="kv-value">{props.marketTitle}</span></div>
      <div className="kv"><span className="kv-key">{copy.outcome}</span><span className="kv-value">{props.outcome}</span></div>
      <div className="kv"><span className="kv-key">{copy.side}</span><span className="kv-value">{copy.sides[props.side] ?? props.side}</span></div>
      <div className="kv"><span className="kv-key">{copy.price}</span><span className="kv-value">{formatNum(props.price)}</span></div>
      <div className="kv"><span className="kv-key">{copy.size}</span><span className="kv-value">{formatNum(props.size)}</span></div>
      <div className="kv"><span className="kv-key">{copy.estimatedCostProceeds}</span><span className="kv-value">{formatNum(estimated)}</span></div>
      <div className="muted">{copy.builderAttributionNotice}</div>
      <div className="muted">{copy.readiness}: {readinessLabel}</div>
      <button
        type="button"
        disabled={disabled}
        title={readinessLabel}
        onClick={() => {
          trackFunnelEvent("trade_cta_clicked", { market: props.marketTitle, readiness });
          trackFunnelEvent("routed_trade_attempted", { market: props.marketTitle, readiness });
          trackFunnelEvent("routed_trade_signature_requested", { market: props.marketTitle, readiness });
        }}
      >
        {copy.submitUserSignedOrder}
      </button>
    </div>
  );
}
