import React from "react";

import {
  builderFeeDisclosure,
  formatBpsPercent,
  getBuilderFeeStatusLabel,
} from "../lib/builder-fee-disclosure";
import type { AppLocale } from "../lib/locale";

interface Props {
  locale: AppLocale;
  hasBuilderCode?: boolean;
  routedTradingEnabled?: boolean;
  tradingStatusLabel?: string;
  compact?: boolean;
}

export function BuilderFeeDisclosureCard({
  locale,
  hasBuilderCode,
  routedTradingEnabled,
  tradingStatusLabel,
  compact = false,
}: Props) {
  const statusLabel = getBuilderFeeStatusLabel(builderFeeDisclosure.status, locale);
  const maker = formatBpsPercent(builderFeeDisclosure.makerFeeBps);
  const taker = formatBpsPercent(builderFeeDisclosure.takerFeeBps);

  if (locale !== "zh-HK") {
    return (
      <section className={compact ? "disclosure-card stack" : "panel stack disclosure-card"}>
        <strong>Builder fee disclosure</strong>
        {hasBuilderCode !== undefined ? (
          <div className="kv"><span className="kv-key">Builder Code status</span><span className="kv-value">{hasBuilderCode ? "configured" : "not configured"}</span></div>
        ) : null}
        {routedTradingEnabled !== undefined ? (
          <div className="kv"><span className="kv-key">Routed trading</span><span className="kv-value">{tradingStatusLabel ?? (routedTradingEnabled ? "enabled" : "disabled")}</span></div>
        ) : null}
        <div className="kv"><span className="kv-key">Maker Builder fee</span><span className="kv-value">{statusLabel} {maker}</span></div>
        <div className="kv"><span className="kv-key">Taker Builder fee</span><span className="kv-value">{statusLabel} {taker}</span></div>
        <p className="muted">Disclosure values only. Builder fees apply only to eligible matched routed Polymarket orders with our Builder Code attached. Browsing markets does not create Builder fees.</p>
        <p className="muted">Users sign their own orders. The app does not custody Polymarket funds, and Polygon pUSD reward payouts remain manual and admin-approved.</p>
      </section>
    );
  }

  return (
    <section className={compact ? "disclosure-card stack" : "panel stack disclosure-card"}>
      <strong>Builder 費用披露</strong>
      {hasBuilderCode !== undefined ? (
        <div className="kv"><span className="kv-key">Builder Code</span><span className="kv-value">{hasBuilderCode ? "Builder Code 已設定" : "Builder Code 未設定"}</span></div>
      ) : null}
      {routedTradingEnabled !== undefined ? (
        <div className="kv"><span className="kv-key">交易狀態</span><span className="kv-value">{tradingStatusLabel ?? (routedTradingEnabled ? "實盤提交已啟用" : "實盤提交尚未啟用")}</span></div>
      ) : null}
      <div className="kv"><span className="kv-key">Maker Builder 費率</span><span className="kv-value">{statusLabel} Maker 費率：{maker}</span></div>
      <div className="kv"><span className="kv-key">Taker Builder 費率</span><span className="kv-value">{statusLabel} Taker 費率：{taker}</span></div>
      <p className="muted">費率只適用於合資格並成功成交的 Polymarket 路由訂單。單純瀏覽市場不會產生 Builder 費用。</p>
      <p className="muted">用戶需要自行簽署訂單，本平台不託管用戶在 Polymarket 的資金。實際支付需要管理員審批。</p>
    </section>
  );
}
