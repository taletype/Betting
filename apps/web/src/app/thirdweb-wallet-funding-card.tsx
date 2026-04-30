"use client";

import React, { useState } from "react";
import { polygon } from "thirdweb/chains";
import { ConnectButton, PayEmbed } from "thirdweb/react";

import { trackFunnelEvent } from "./funnel-analytics";
import { useThirdwebWalletStatus } from "./thirdweb-provider";

interface ThirdwebWalletFundingCardProps {
  walletConnected?: boolean;
  compact?: boolean;
  surface: "account" | "polymarket_feed" | "polymarket_detail" | "trade_ticket";
}

const thirdwebDisclosure =
  "資金會進入你的錢包。本平台不會託管你的資金。第三方增值服務可能收取費用，實際費用會在交易前顯示。單純增值錢包不代表已完成 Polymarket 交易。";

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
        <strong>增值錢包 / Add funds</strong>
        <span className={`badge badge-${effectiveWalletConnected ? "success" : "neutral"}`}>
          {effectiveWalletConnected ? "錢包已連接" : "尚未連接錢包"}
        </span>
      </div>
      <div className="cluster">
        {thirdweb.client ? (
          <ConnectButton
            client={thirdweb.client}
            chain={polygon}
            connectButton={{ label: "連接錢包" }}
            connectModal={{ title: "連接你的錢包", size: "compact" }}
            detailsButton={{ displayBalanceToken: { [polygon.id]: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" } }}
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
          增值錢包
        </button>
      </div>
      <div className="sr-only">連接錢包 錢包已連接 更換錢包 斷開連接</div>
      <div className="kv">
        <span className="kv-key">目標網絡 / 資產</span>
        <span className="kv-value">Polygon / USDC</span>
      </div>
      <div className="kv">
        <span className="kv-key">資金流向</span>
        <span className="kv-value">資金會進入你的錢包。本平台不會託管你的資金。</span>
      </div>
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
                prefillBuy: { chain: polygon },
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
