import React from "react";

import { getPolymarketRoutingReadiness } from "./polymarket-routing-readiness";

interface Props {
  hasBuilderCode: boolean;
  featureEnabled: boolean;
  walletConnected: boolean;
  hasCredentials: boolean;
  marketTradable: boolean;
}

export function PolymarketTradeTicket(props: Props) {
  const readiness = getPolymarketRoutingReadiness(props);
  const disabled = readiness !== "ready_to_route";
  const label = readiness === "wallet_not_connected"
    ? "Connect wallet"
    : readiness === "credentials_missing"
      ? "Polymarket credentials required"
      : readiness === "ready_to_route"
        ? "Submit user-signed order"
        : "Trading not enabled";

  return (
    <div className="market-actions stack">
      <div className="muted">{disabled ? label : "Review order"}</div>
      <button type="button" disabled={disabled} title={label}>Trade via Polymarket</button>
      {!disabled ? <div className="muted">Submit user-signed order</div> : null}
    </div>
  );
}
