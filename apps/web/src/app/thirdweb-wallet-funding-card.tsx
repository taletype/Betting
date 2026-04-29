"use client";

import React, { useState } from "react";
import { base } from "thirdweb/chains";
import { ConnectButton, PayEmbed } from "thirdweb/react";

import { trackFunnelEvent } from "./funnel-analytics";
import { useThirdwebWalletStatus } from "./thirdweb-provider";

interface ThirdwebWalletFundingCardProps {
  walletConnected?: boolean;
  compact?: boolean;
  surface: "account" | "polymarket_feed" | "polymarket_detail" | "trade_ticket";
}

const thirdwebDisclosure =
  "用戶可透過第三方錢包及付款服務為自己的錢包增值。資金會進入用戶自行控制的錢包，本平台不託管用戶資金。部分加密貨幣兌換或付款流程可能產生平台服務費；實際費用會在交易前顯示。";

export function ThirdwebWalletFundingCard({
  walletConnected = false,
  compact = false,
  surface,
}: ThirdwebWalletFundingCardProps) {
  const [fundingState, setFundingState] = useState<"idle" | "opened" | "completed" | "failed">("idle");
  const thirdweb = useThirdwebWalletStatus();
  const effectiveWalletConnected = thirdweb.configured ? thirdweb.connected : walletConnected;

  const openFunding = () => {
    trackFunnelEvent("wallet_funding_opened", { surface, provider: "thirdweb" });
    trackFunnelEvent("wallet_funding_quoted", { surface, provider: "thirdweb" });
    trackFunnelEvent("thirdweb_route_quoted", { surface, provider: "thirdweb" });
    trackFunnelEvent("thirdweb_developer_fee_disclosed", { surface, provider: "thirdweb" });
    setFundingState("opened");
  };

  return (
    <section className={compact ? "disclosure-card stack" : "panel disclosure-card stack"} data-testid="thirdweb-wallet-funding">
      <div className="section-heading-row">
        <strong>Thirdweb 錢包及增值</strong>
        <span className={`badge badge-${effectiveWalletConnected ? "success" : "neutral"}`}>
          {effectiveWalletConnected ? "錢包已連接" : "尚未連接錢包"}
        </span>
      </div>
      <div className="cluster">
        {thirdweb.client ? (
          <ConnectButton
            client={thirdweb.client}
            chain={base}
            connectButton={{ label: "連接錢包" }}
            connectModal={{ title: "連接你的錢包", size: "compact" }}
            detailsButton={{ displayBalanceToken: { [base.id]: "0x0000000000000000000000000000000000000000" } }}
            theme="light"
            onConnect={(wallet) => {
              trackFunnelEvent("wallet_connect_started", { surface, provider: "thirdweb" });
              trackFunnelEvent("wallet_connected", { surface, provider: "thirdweb", walletId: wallet.id });
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              trackFunnelEvent("wallet_connect_started", { surface, provider: "thirdweb", configured: false });
            }}
          >
            連接錢包
          </button>
        )}
        <button type="button" onClick={openFunding}>
          為錢包增值
        </button>
      </div>
      <div className="kv">
        <span className="kv-key">付款服務</span>
        <span className="kv-value">使用第三方付款服務</span>
      </div>
      <div className="kv">
        <span className="kv-key">資金流向</span>
        <span className="kv-value">資金會進入你的錢包</span>
      </div>
      <p className="muted">本平台不託管用戶資金</p>
      <p className="muted">{thirdwebDisclosure}</p>
      {thirdweb.address ? (
        <div className="kv">
          <span className="kv-key">已連接地址</span>
          <span className="kv-value mono">{thirdweb.address}</span>
        </div>
      ) : null}
      {fundingState === "opened" ? (
        <div className="stack">
          <div className="badge badge-warning">Thirdweb 增值流程會在第三方付款服務中完成；完成狀態只可由供應商確認。</div>
          {thirdweb.client ? (
            <PayEmbed
              client={thirdweb.client}
              theme="light"
              payOptions={{
                mode: "fund_wallet",
                metadata: { name: "為你的錢包增值" },
                prefillBuy: { chain: base },
              }}
            />
          ) : (
            <div className="muted">設定 NEXT_PUBLIC_THIRDWEB_CLIENT_ID 後即可啟用 Thirdweb Pay / onramp UI。</div>
          )}
        </div>
      ) : null}
    </section>
  );
}

export { thirdwebDisclosure };
