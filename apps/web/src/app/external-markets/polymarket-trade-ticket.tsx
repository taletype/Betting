"use client";

import React, { useEffect, useMemo, useState } from "react";

import { getPolymarketRoutingDisabledReasons, getPolymarketRoutingReadiness } from "./polymarket-routing-readiness";
import { BuilderFeeDisclosureCard } from "../builder-fee-disclosure-card";
import { trackFunnelEvent } from "../funnel-analytics";
import { getLocaleCopy, type AppLocale } from "../../lib/locale";

interface Props {
  marketTitle: string;
  outcomes?: { tokenId: string; title: string; bestBid?: number | null; bestAsk?: number | null; lastPrice?: number | null }[];
  outcome: string;
  tokenId?: string;
  side: "buy" | "sell";
  price: number | null;
  size: number | null;
  loggedIn?: boolean;
  hasBuilderCode: boolean;
  featureEnabled: boolean;
  submitModeEnabled?: boolean;
  walletConnected: boolean;
  geoblockAllowed?: boolean;
  hasCredentials: boolean;
  userSigningAvailable?: boolean;
  marketTradable: boolean;
  orderValid?: boolean;
  submitterAvailable: boolean;
  userSigned?: boolean;
  submitted?: boolean;
  locale: AppLocale;
}

const formatNum = (value: number | null): string => (value === null ? "—" : value.toFixed(3));

export function PolymarketTradeTicket(props: Props) {
  const copy = getLocaleCopy(props.locale).research;
  const [selectedTokenId, setSelectedTokenId] = useState(props.tokenId ?? props.outcomes?.[0]?.tokenId ?? "");
  const [side, setSide] = useState<"buy" | "sell">(props.side);
  const [orderStyle, setOrderStyle] = useState<"limit" | "marketable_limit">("limit");
  const [orderType, setOrderType] = useState<"GTC" | "GTD" | "FOK" | "FAK">("GTC");
  const [priceValue, setPriceValue] = useState(props.price?.toFixed(2) ?? "");
  const [sizeValue, setSizeValue] = useState(props.size?.toString() ?? "10");
  const [slippageBps, setSlippageBps] = useState("100");
  const [expiration, setExpiration] = useState("");
  const [geoblockAllowed, setGeoblockAllowed] = useState<boolean | undefined>(props.geoblockAllowed);
  const selectedOutcome = props.outcomes?.find((outcome) => outcome.tokenId === selectedTokenId);
  const parsedPrice = Number(priceValue);
  const parsedSize = Number(sizeValue);
  const parsedSlippageBps = Number(slippageBps);
  const orderValid = Boolean(
    props.orderValid !== false &&
    selectedTokenId &&
    Number.isFinite(parsedPrice) &&
    parsedPrice > 0 &&
    parsedPrice < 1 &&
    Number.isFinite(parsedSize) &&
    parsedSize > 0 &&
    Number.isFinite(parsedSlippageBps) &&
    parsedSlippageBps >= 0 &&
    (orderType !== "GTD" || Boolean(expiration)),
  );
  const worstAcceptablePrice = useMemo(() => {
    if (!Number.isFinite(parsedPrice)) return null;
    if (orderStyle !== "marketable_limit") return parsedPrice;
    const multiplier = side === "buy" ? 1 + parsedSlippageBps / 10_000 : 1 - parsedSlippageBps / 10_000;
    return Math.min(0.99, Math.max(0.01, parsedPrice * multiplier));
  }, [orderStyle, parsedPrice, parsedSlippageBps, side]);
  const readinessInput = {
    ...props,
    loggedIn: props.loggedIn,
    geoblockAllowed,
    userSigningAvailable: props.userSigningAvailable,
    orderValid,
  };
  const readiness = getPolymarketRoutingReadiness(readinessInput);
  const disabledReasons = getPolymarketRoutingDisabledReasons(readinessInput);
  const disabled = readiness !== "ready_to_submit";
  const routingUsable = readiness === "ready_to_submit" || readiness === "submitted";
  const estimated = !Number.isFinite(parsedPrice) || !Number.isFinite(parsedSize) ? null : parsedPrice * parsedSize;
  const estimatedMaxFees = estimated === null ? null : estimated * 0.015;
  const readinessLabel = copy.readinessCopy[readiness] ?? readiness;

  useEffect(() => {
    trackFunnelEvent("trade_ticket_opened", {
      market: props.marketTitle,
      tokenId: selectedTokenId || null,
    });
  }, [props.marketTitle, selectedTokenId]);

  useEffect(() => {
    let cancelled = false;
    trackFunnelEvent("order_preview_requested", { market: props.marketTitle, tokenId: selectedTokenId || null });
    fetch("https://polymarket.com/api/geoblock", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`geoblock ${response.status}`);
        return (await response.json()) as { blocked?: boolean };
      })
      .then((payload) => {
        if (cancelled) return;
        const allowed = payload.blocked !== true;
        setGeoblockAllowed(allowed);
        if (!allowed) trackFunnelEvent("geoblock_failed", { market: props.marketTitle });
      })
      .catch(() => {
        if (cancelled) return;
        setGeoblockAllowed(false);
        trackFunnelEvent("geoblock_failed", { market: props.marketTitle });
      });

    return () => {
      cancelled = true;
    };
  }, [props.marketTitle, selectedTokenId]);

  useEffect(() => {
    if (!props.hasCredentials) {
      trackFunnelEvent("l2_credentials_missing", { market: props.marketTitle });
    }
  }, [props.hasCredentials, props.marketTitle]);

  useEffect(() => {
    if (props.hasBuilderCode && props.featureEnabled && props.marketTradable) {
      trackFunnelEvent("builder_attribution_prepared", {
        market: props.marketTitle,
        submitterAvailable: props.submitterAvailable,
      });
    }

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
      trackFunnelEvent("order_preview_failed", { market: props.marketTitle, reason: readiness });
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
      <div className="muted">{copy.routedExecutionNotice}</div>
      <BuilderFeeDisclosureCard
        locale={props.locale}
        hasBuilderCode={props.hasBuilderCode}
        routedTradingEnabled={routingUsable}
        compact
      />
      <div className="readiness-grid">
        <div className="kv"><span className="kv-key">{copy.builderCodeConfigured}</span><span className="kv-value">{props.hasBuilderCode ? copy.yes : copy.no}</span></div>
        <div className="kv"><span className="kv-key">{copy.routedTradingEnabled}</span><span className="kv-value">{routingUsable ? copy.yes : copy.readinessCopy.feature_disabled}</span></div>
        <div className="kv"><span className="kv-key">{copy.orderSubmitterMode}</span><span className="kv-value">{props.submitModeEnabled ? copy.yes : copy.disabled}</span></div>
        <div className="kv"><span className="kv-key">登入狀態</span><span className="kv-value">{props.loggedIn ? copy.yes : copy.no}</span></div>
        <div className="kv"><span className="kv-key">{copy.walletConnected}</span><span className="kv-value">{props.walletConnected ? copy.yes : copy.no}</span></div>
        <div className="kv"><span className="kv-key">{copy.polymarketCredentials}</span><span className="kv-value">{props.hasCredentials ? copy.yes : copy.no}</span></div>
        <div className="kv"><span className="kv-key">{copy.geoblockStatus}</span><span className="kv-value">{geoblockAllowed ? copy.yes : copy.readinessCopy.geoblocked}</span></div>
        <div className="kv"><span className="kv-key">{copy.marketTradable}</span><span className="kv-value">{props.marketTradable ? copy.yes : copy.no}</span></div>
        <div className="kv"><span className="kv-key">{copy.submitterAvailable}</span><span className="kv-value">{props.submitterAvailable ? copy.yes : copy.no}</span></div>
      </div>
      <label className="stack">
        {copy.outcome}
        <select value={selectedTokenId} onChange={(event) => setSelectedTokenId(event.target.value)}>
          {(props.outcomes?.length ? props.outcomes : [{ tokenId: props.tokenId ?? "", title: props.outcome }]).map((outcome) => (
            <option key={outcome.tokenId || outcome.title} value={outcome.tokenId}>{outcome.title}</option>
          ))}
        </select>
      </label>
      <label className="stack">
        {copy.side}
        <select value={side} onChange={(event) => setSide(event.target.value === "sell" ? "sell" : "buy")}>
          <option value="buy">{copy.sides.buy}</option>
          <option value="sell">{copy.sides.sell}</option>
        </select>
      </label>
      <label className="stack">
        {copy.orderStyle}
        <select value={orderStyle} onChange={(event) => {
          const next = event.target.value === "marketable_limit" ? "marketable_limit" : "limit";
          setOrderStyle(next);
          setOrderType(next === "marketable_limit" ? "FOK" : "GTC");
        }}>
          <option value="limit">limit</option>
          <option value="marketable_limit">marketable limit</option>
        </select>
      </label>
      <label className="stack">
        {copy.orderType}
        <select value={orderType} onChange={(event) => setOrderType(event.target.value as "GTC" | "GTD" | "FOK" | "FAK")}>
          <option value="GTC">GTC</option>
          <option value="GTD">GTD</option>
          <option value="FOK">FOK</option>
          <option value="FAK">FAK</option>
        </select>
      </label>
      <label className="stack">
        {copy.price}
        <input inputMode="decimal" value={priceValue} onChange={(event) => setPriceValue(event.target.value)} />
      </label>
      <label className="stack">
        {copy.size}
        <input inputMode="decimal" value={sizeValue} onChange={(event) => setSizeValue(event.target.value)} />
      </label>
      <label className="stack">
        {copy.slippageProtection}
        <input inputMode="numeric" value={slippageBps} onChange={(event) => setSlippageBps(event.target.value)} />
      </label>
      <label className="stack">
        {copy.expiration}
        <input type="datetime-local" value={expiration} onChange={(event) => setExpiration(event.target.value)} />
      </label>
      <div className="kv"><span className="kv-key">{copy.market}</span><span className="kv-value">{props.marketTitle}</span></div>
      <div className="kv"><span className="kv-key">Token ID</span><span className="kv-value mono">{selectedTokenId || "—"}</span></div>
      <div className="kv"><span className="kv-key">{copy.outcome}</span><span className="kv-value">{selectedOutcome?.title ?? props.outcome}</span></div>
      <div className="kv"><span className="kv-key">{copy.side}</span><span className="kv-value">{copy.sides[side] ?? side}</span></div>
      <div className="kv"><span className="kv-key">{copy.price}</span><span className="kv-value">{formatNum(Number.isFinite(parsedPrice) ? parsedPrice : null)}</span></div>
      <div className="kv"><span className="kv-key">Worst acceptable price</span><span className="kv-value">{formatNum(worstAcceptablePrice)}</span></div>
      <div className="kv"><span className="kv-key">{copy.size}</span><span className="kv-value">{formatNum(Number.isFinite(parsedSize) ? parsedSize : null)}</span></div>
      <div className="kv"><span className="kv-key">{copy.estimatedCostProceeds}</span><span className="kv-value">{formatNum(estimated)}</span></div>
      <div className="kv"><span className="kv-key">{copy.estimatedMaxFees}</span><span className="kv-value">{formatNum(estimatedMaxFees)}</span></div>
      <div className="muted">{copy.builderAttributionNotice}</div>
      <div className="muted">{copy.feeNotice}</div>
      <div className="muted">{copy.finalSignatureWarning}</div>
      <div className="muted">{copy.readiness}: {readinessLabel}</div>
      {disabledReasons.length > 0 ? (
        <ul className="muted">
          {disabledReasons.map((reason) => <li key={reason}>{copy.readinessCopy[reason] ?? reason}</li>)}
        </ul>
      ) : null}
      <button
        type="button"
        disabled={disabled}
        title={readinessLabel}
        onClick={() => {
          trackFunnelEvent("trade_cta_clicked", { market: props.marketTitle, readiness });
          trackFunnelEvent("routed_trade_attempted", { market: props.marketTitle, readiness });
          trackFunnelEvent("user_order_signature_requested", { market: props.marketTitle, readiness });
        }}
      >
        {copy.tradeViaPolymarket}
      </button>
    </div>
  );
}
