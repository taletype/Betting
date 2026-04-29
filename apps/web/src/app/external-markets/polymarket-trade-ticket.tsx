"use client";

import React, { useEffect, useMemo, useState } from "react";

import {
  getPolymarketGeoblockStatusLabel,
  getPolymarketReadinessChecklist,
  getPolymarketRoutingReadiness,
  getPolymarketTopBlockingReason,
  type PolymarketGeoblockStatus,
  type PolymarketReadinessChecklistStatus,
} from "./polymarket-routing-readiness";
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

const statusTone = (status: PolymarketReadinessChecklistStatus): "success" | "warning" | "danger" | "neutral" => {
  if (status === "complete") return "success";
  if (status === "blocked") return "danger";
  if (status === "checking") return "warning";
  return "neutral";
};

const statusLabel = (status: PolymarketReadinessChecklistStatus): string => {
  if (status === "complete") return "完成";
  if (status === "blocked") return "受阻";
  if (status === "checking") return "檢查中";
  return "待處理";
};

const initialGeoblockStatus = (allowed: boolean | undefined): PolymarketGeoblockStatus =>
  allowed === true ? "allowed" : allowed === false ? "blocked" : "unknown";

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
  const [geoblockStatus, setGeoblockStatus] = useState<PolymarketGeoblockStatus>(
    initialGeoblockStatus(props.geoblockAllowed),
  );
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
    geoblockStatus,
    geoblockAllowed: geoblockStatus === "allowed" ? true : geoblockStatus === "blocked" ? false : undefined,
    userSigningAvailable: props.userSigningAvailable,
    orderValid,
  };
  const readiness = getPolymarketRoutingReadiness(readinessInput);
  const readinessChecklist = getPolymarketReadinessChecklist(readinessInput);
  const topBlockingReason = getPolymarketTopBlockingReason(readinessInput);
  const disabled = readiness !== "ready_to_submit";
  const estimated = !Number.isFinite(parsedPrice) || !Number.isFinite(parsedSize) ? null : parsedPrice * parsedSize;
  const estimatedMaxFees = estimated === null ? null : estimated * 0.015;
  const readinessLabel = copy.readinessCopy[topBlockingReason ?? readiness] ?? topBlockingReason ?? readiness;

  useEffect(() => {
    trackFunnelEvent("trade_ticket_opened", {
      market: props.marketTitle,
      tokenId: selectedTokenId || null,
    });
  }, [props.marketTitle, selectedTokenId]);

  useEffect(() => {
    let cancelled = false;
    setGeoblockStatus("checking");
    trackFunnelEvent("order_preview_requested", { market: props.marketTitle, tokenId: selectedTokenId || null });
    fetch("https://polymarket.com/api/geoblock", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`geoblock ${response.status}`);
        return (await response.json()) as { blocked?: boolean };
      })
      .then((payload) => {
        if (cancelled) return;
        const allowed = payload.blocked !== true;
        setGeoblockStatus(allowed ? "allowed" : "blocked");
        if (!allowed) trackFunnelEvent("geoblock_failed", { market: props.marketTitle });
      })
      .catch(() => {
        if (cancelled) return;
        setGeoblockStatus("error");
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
    <div className="trade-ticket stack" data-testid="polymarket-trade-ticket">
      <div className="ticket-header">
        <div>
          <strong>{copy.tradeViaPolymarket}</strong>
          <div className="muted">非託管下單介面</div>
        </div>
        <span className="badge badge-warning">Live submit disabled</span>
      </div>
      <div className="warning-card">{copy.finalSignatureWarning}</div>
      <div className="muted">{copy.routedExecutionNotice}</div>
      <BuilderFeeDisclosureCard
        locale={props.locale}
        hasBuilderCode={props.hasBuilderCode}
        routedTradingEnabled={props.featureEnabled}
        compact
      />

      <section className="readiness-checklist stack" aria-label="Polymarket readiness checklist">
        <div className="section-heading-row">
          <strong>{copy.readiness}</strong>
          <span className={`badge badge-${topBlockingReason ? "warning" : "success"}`}>
            {topBlockingReason ? readinessLabel : "可以提交"}
          </span>
        </div>
        <div className="checklist-list" data-testid="readiness-checklist">
          {readinessChecklist.map((item) => (
            <div className="checklist-item" key={item.id} data-status={item.status}>
              <span className={`status-dot status-dot-${item.status}`} aria-hidden="true" />
              <div>
                <div className="checklist-title">
                  <span>{item.label}</span>
                  <span className={`badge badge-${statusTone(item.status)}`}>{statusLabel(item.status)}</span>
                </div>
                <div className="muted">{item.explanation}</div>
                {item.actionHref && item.actionLabel ? <a href={item.actionHref}>{item.actionLabel}</a> : null}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="readiness-grid compact-status-grid">
        <div className="kv"><span className="kv-key">Builder Code</span><span className="kv-value">{props.hasBuilderCode ? "Builder Code 已設定" : "Builder Code 未設定"}</span></div>
        <div className="kv"><span className="kv-key">{copy.walletConnected}</span><span className="kv-value">{props.walletConnected ? copy.yes : copy.no}</span></div>
        <div className="kv"><span className="kv-key">{copy.polymarketCredentials}</span><span className="kv-value">{props.hasCredentials ? copy.yes : copy.no}</span></div>
        <div className="kv"><span className="kv-key">{copy.geoblockStatus}</span><span className="kv-value">{getPolymarketGeoblockStatusLabel(geoblockStatus)}</span></div>
        <div className="kv"><span className="kv-key">{copy.routedTradingEnabled}</span><span className="kv-value">{props.featureEnabled ? "交易功能已啟用" : "交易功能尚未啟用"}</span></div>
        <div className="kv"><span className="kv-key">{copy.submitterAvailable}</span><span className="kv-value">{props.submitterAvailable ? copy.yes : copy.no}</span></div>
      </div>

      <label className="stack">
        {copy.outcome}
        <select className="control-lg" value={selectedTokenId} onChange={(event) => setSelectedTokenId(event.target.value)}>
          {(props.outcomes?.length ? props.outcomes : [{ tokenId: props.tokenId ?? "", title: props.outcome }]).map((outcome) => (
            <option key={outcome.tokenId || outcome.title} value={outcome.tokenId}>{outcome.title}</option>
          ))}
        </select>
      </label>

      <div className="segmented-control" role="group" aria-label={copy.side}>
        <button type="button" className={side === "buy" ? "active" : ""} onClick={() => setSide("buy")}>{copy.sides.buy}</button>
        <button type="button" className={side === "sell" ? "active" : ""} onClick={() => setSide("sell")}>{copy.sides.sell}</button>
      </div>

      <div className="ticket-form-grid">
        <label className="stack">
          {copy.price}
          <input className="control-lg" inputMode="decimal" value={priceValue} onChange={(event) => setPriceValue(event.target.value)} />
        </label>
        <label className="stack">
          {copy.size}
          <input className="control-lg" inputMode="decimal" value={sizeValue} onChange={(event) => setSizeValue(event.target.value)} />
        </label>
      </div>

      <details className="advanced-ticket-settings">
        <summary>進階訂單設定</summary>
        <div className="ticket-form-grid">
          <label className="stack">
            {copy.orderStyle}
            <select value={orderStyle} onChange={(event) => {
              const next = event.target.value === "marketable_limit" ? "marketable_limit" : "limit";
              setOrderStyle(next);
              setOrderType(next === "marketable_limit" ? "FOK" : "GTC");
            }}>
              <option value="limit">Limit</option>
              <option value="marketable_limit">Marketable limit</option>
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
            {copy.slippageProtection}
            <input inputMode="numeric" value={slippageBps} onChange={(event) => setSlippageBps(event.target.value)} />
          </label>
          <label className="stack">
            {copy.expiration}
            <input type="datetime-local" value={expiration} onChange={(event) => setExpiration(event.target.value)} />
          </label>
        </div>
      </details>

      <section className="order-preview stack">
        <strong>{copy.orderReview}</strong>
        <div className="kv"><span className="kv-key">{copy.market}</span><span className="kv-value">{props.marketTitle}</span></div>
        <div className="kv"><span className="kv-key">{copy.outcome}</span><span className="kv-value">{selectedOutcome?.title ?? props.outcome}</span></div>
        <div className="kv"><span className="kv-key">{copy.side}</span><span className="kv-value">{copy.sides[side] ?? side}</span></div>
        <div className="kv"><span className="kv-key">{copy.price}</span><span className="kv-value">{formatNum(Number.isFinite(parsedPrice) ? parsedPrice : null)}</span></div>
        <div className="kv"><span className="kv-key">Worst acceptable price</span><span className="kv-value">{formatNum(worstAcceptablePrice)}</span></div>
        <div className="kv"><span className="kv-key">{copy.size}</span><span className="kv-value">{formatNum(Number.isFinite(parsedSize) ? parsedSize : null)}</span></div>
        <div className="kv"><span className="kv-key">{copy.estimatedCostProceeds}</span><span className="kv-value">{formatNum(estimated)}</span></div>
        <div className="kv"><span className="kv-key">{copy.estimatedMaxFees}</span><span className="kv-value">{formatNum(estimatedMaxFees)}</span></div>
      </section>

      <div className="muted">{copy.builderAttributionNotice}</div>
      <div className="muted">{copy.feeNotice}</div>
      {topBlockingReason ? (
        <div className="ticket-disabled-reason" data-testid="top-blocking-reason">
          {readinessLabel}
        </div>
      ) : null}
      <button
        type="button"
        className="primary-cta"
        disabled={disabled}
        title={readinessLabel}
        onClick={() => {
          trackFunnelEvent("trade_cta_clicked", { market: props.marketTitle, readiness });
          trackFunnelEvent("routed_trade_attempted", { market: props.marketTitle, readiness });
          trackFunnelEvent("user_order_signature_requested", { market: props.marketTitle, readiness });
        }}
      >
        {disabled ? `${copy.tradeViaPolymarket} · ${readinessLabel}` : copy.submitUserSignedOrder}
      </button>
    </div>
  );
}
