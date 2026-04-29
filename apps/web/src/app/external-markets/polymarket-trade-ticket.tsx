import React from "react";

import { getPolymarketRoutingReadiness, type PolymarketRoutingReadiness } from "./polymarket-routing-readiness";

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
}

const readinessCopy: Record<PolymarketRoutingReadiness, string> = {
  builder_code_missing: "Builder code missing",
  feature_disabled: "Routed trading feature disabled",
  wallet_not_connected: "Wallet not connected",
  credentials_missing: "Polymarket credentials missing",
  market_not_tradable: "Market not tradable",
  ready_to_route: "Ready (submission scaffold only)",
};

const formatNum = (value: number | null): string => (value === null ? "—" : value.toFixed(3));

export function PolymarketTradeTicket(props: Props) {
  const readiness = getPolymarketRoutingReadiness(props);
  const disabled = readiness !== "ready_to_route";
  const estimated = props.price === null || props.size === null ? null : props.price * props.size;

  return (
    <div className="market-actions stack panel">
      <strong>Trade via Polymarket (non-custodial scaffold)</strong>
      <div className="muted">Review-only shell. Orders remain user-signed and routed externally.</div>
      <div className="kv"><span className="kv-key">Market</span><span className="kv-value">{props.marketTitle}</span></div>
      <div className="kv"><span className="kv-key">Outcome</span><span className="kv-value">{props.outcome}</span></div>
      <div className="kv"><span className="kv-key">Side</span><span className="kv-value">{props.side}</span></div>
      <div className="kv"><span className="kv-key">Price</span><span className="kv-value">{formatNum(props.price)}</span></div>
      <div className="kv"><span className="kv-key">Size</span><span className="kv-value">{formatNum(props.size)}</span></div>
      <div className="kv"><span className="kv-key">Estimated cost/proceeds</span><span className="kv-value">{formatNum(estimated)}</span></div>
      <div className="muted">Builder attribution applies per Polymarket Builder settings.</div>
      <div className="muted">Readiness: {readinessCopy[readiness]}</div>
      <button type="button" disabled={disabled} title={readinessCopy[readiness]}>Submit user-signed order</button>
    </div>
  );
}
