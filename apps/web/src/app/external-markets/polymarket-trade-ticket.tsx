"use client";

import React, { useEffect, useMemo, useState } from "react";
import { polygon } from "thirdweb/chains";
import { ConnectButton } from "thirdweb/react";

import {
  getPolymarketGeoblockStatusLabel,
  getPolymarketReadinessChecklist,
  getPolymarketRoutingReadiness,
  getPolymarketTopBlockingReason,
  type PolymarketReadinessChecklistStatus,
  type PolymarketRoutingReadinessInput,
} from "./polymarket-routing-readiness";
import { BuilderFeeDisclosureCard } from "../builder-fee-disclosure-card";
import { trackFunnelEvent } from "../funnel-analytics";
import { ThirdwebWalletFundingCard } from "../thirdweb-wallet-funding-card";
import { useThirdwebWalletStatus } from "../thirdweb-provider";
import { formatDateTime, getLocaleCopy, type AppLocale } from "../../lib/locale";

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
  betaUserAllowlisted?: boolean;
  submitModeEnabled?: boolean;
  walletConnected: boolean;
  walletFundsSufficient?: boolean;
  geoblockAllowed?: boolean;
  hasCredentials: boolean;
  userSigningAvailable?: boolean;
  marketTradable: boolean;
  orderValid?: boolean;
  submitterAvailable: boolean;
  userSigned?: boolean;
  submitted?: boolean;
  balanceAllowanceReady?: boolean;
  attributionRecordingReady?: boolean;
  locale: AppLocale;
}

const formatNum = (value: number | null): string => (value === null ? "—" : value.toFixed(3));

const statusTone = (status: PolymarketReadinessChecklistStatus): "success" | "warning" | "danger" | "neutral" => {
  if (status === "complete") return "success";
  if (status === "unavailable" || status === "disabled") return "warning";
  if (status === "checking") return "warning";
  return "neutral";
};

const statusLabel = (status: PolymarketReadinessChecklistStatus): string => {
  if (status === "complete") return "完成";
  if (status === "unavailable") return "只供瀏覽";
  if (status === "disabled") return "已停用";
  if (status === "checking") return "檢查中";
  return "待處理";
};

const getTradeTicketActionLabel = (
  input: PolymarketRoutingReadinessInput,
  readiness: ReturnType<typeof getPolymarketRoutingReadiness>,
): string => {
  if (!input.walletConnected || input.walletAddressKnown === false) return "連接錢包";
  if (input.walletFundsSufficient === false || input.balanceAllowanceReady === false || input.fundingAvailable === false) return "增值錢包";
  if (!input.hasCredentials) return "設定 Polymarket 憑證";
  if (!input.marketTradable) return "市場只供瀏覽";
  if (input.submitModeEnabled === false || !input.submitterAvailable || input.submitterEndpointAvailable === false) return "實盤提交已停用";
  if (!input.featureEnabled) return "交易功能尚未啟用";
  if (input.orderValid === false) return "請輸入有效價格及數量";
  if (readiness === "signature_required" || input.userSigningAvailable === false || !input.userSigned) return "準備自行簽署訂單";
  if (input.submitted) return "訂單已提交";
  return "準備自行簽署訂單";
};

type SignedPolymarketOrder = Record<string, unknown> & {
  signer: string;
  tokenId: string;
  side: "BUY" | "SELL";
  timestamp: string;
  expiration: string;
  builder: string;
  signature: string;
};

interface L2CredentialStatusResponse {
  status: "present" | "missing" | "revoked";
  walletAddress: string | null;
  updatedAt: string | null;
}

const isL2CredentialStatusResponse = (value: unknown): value is L2CredentialStatusResponse => {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<L2CredentialStatusResponse>;
  return (
    (payload.status === "present" || payload.status === "missing" || payload.status === "revoked") &&
    (payload.walletAddress === null || typeof payload.walletAddress === "string") &&
    (payload.updatedAt === null || typeof payload.updatedAt === "string")
  );
};

const redactWalletAddress = (value: string | null): string => {
  if (!value) return "未連結";
  if (value.length <= 10) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
};

const readErrorMessage = async (response: Response, fallback: string): Promise<string> => {
  const payload = await response.json().catch(() => null) as { error?: unknown; code?: unknown } | null;
  const code = typeof payload?.code === "string" ? payload.code : null;
  if (code === "POLYMARKET_WALLET_NOT_VERIFIED") return "請先在帳戶頁完成已連結錢包驗證，之後再設定 Polymarket 憑證。";
  if (code === "POLYMARKET_WALLET_MISMATCH") return "提交的 Polymarket 憑證與已驗證錢包不一致。";
  if (code === "POLYMARKET_L2_SETUP_UNAVAILABLE") return "目前未啟用 Polymarket 憑證設定服務。";
  return typeof payload?.error === "string" && payload.error.trim() ? payload.error : fallback;
};

export function PolymarketTradeTicket(props: Props) {
  const copy = getLocaleCopy(props.locale).research;
  const thirdweb = useThirdwebWalletStatus();
  const walletConnected = thirdweb.configured ? thirdweb.connected : props.walletConnected;
  const walletAddressKnown = thirdweb.configured ? Boolean(thirdweb.address) : props.walletConnected;
  const [credentialStatus, setCredentialStatus] = useState<L2CredentialStatusResponse | null>(() =>
    props.hasCredentials ? { status: "present", walletAddress: null, updatedAt: null } : null,
  );
  const [credentialStatusLoading, setCredentialStatusLoading] = useState(Boolean(props.loggedIn));
  const [credentialStatusCheckedAt, setCredentialStatusCheckedAt] = useState<string | null>(null);
  const [l2CredentialReady, setL2CredentialReady] = useState(props.hasCredentials);
  const [credentialFormVisible, setCredentialFormVisible] = useState(false);
  const [credentialKey, setCredentialKey] = useState("");
  const [credentialSecret, setCredentialSecret] = useState("");
  const [credentialPassphrase, setCredentialPassphrase] = useState("");
  const [credentialSubmitting, setCredentialSubmitting] = useState(false);
  const [signedOrder, setSignedOrder] = useState<SignedPolymarketOrder | null>(null);
  const [flowStatus, setFlowStatus] = useState<string | null>(null);
  const [flowError, setFlowError] = useState<string | null>(null);
  const [selectedTokenId, setSelectedTokenId] = useState(props.tokenId ?? props.outcomes?.[0]?.tokenId ?? "");
  const [side, setSide] = useState<"buy" | "sell">(props.side);
  const [orderStyle, setOrderStyle] = useState<"limit" | "marketable_limit">("limit");
  const [orderType, setOrderType] = useState<"GTC" | "GTD" | "FOK" | "FAK">("GTC");
  const [priceValue, setPriceValue] = useState(props.price?.toFixed(2) ?? "");
  const [sizeValue, setSizeValue] = useState(props.size?.toString() ?? "10");
  const [slippageBps, setSlippageBps] = useState("100");
  const [expiration, setExpiration] = useState("");
  const [finalConfirmation, setFinalConfirmation] = useState(false);
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
    walletConnected,
    walletAddressKnown,
    fundingAvailable: thirdweb.configured ? true : undefined,
    walletFundsSufficient: walletConnected ? props.walletFundsSufficient === true : props.walletFundsSufficient,
    hasCredentials: props.hasCredentials || l2CredentialReady,
    userSigningAvailable: props.userSigningAvailable === true || Boolean(walletConnected && l2CredentialReady),
    userSigned: props.userSigned || Boolean(signedOrder),
    orderValid,
  };
  const effectiveHasCredentials = readinessInput.hasCredentials;
  const readiness = getPolymarketRoutingReadiness(readinessInput);
  const readinessChecklist = getPolymarketReadinessChecklist(readinessInput);
  const visibleReadinessChecklist = readinessChecklist.filter((item) =>
    item.id === "wallet" ||
    item.id === "credentials" ||
    item.id === "builder_code" ||
    item.id === "market_status" ||
    item.id === "submitter"
  );
  const topBlockingReason = getPolymarketTopBlockingReason(readinessInput);
  const tradeButtonLabel = getTradeTicketActionLabel(readinessInput, readiness);
  const disabled =
    tradeButtonLabel === "請輸入有效價格及數量" ||
    tradeButtonLabel === "市場只供瀏覽" ||
    tradeButtonLabel === "交易功能尚未啟用" ||
    tradeButtonLabel === "實盤提交已停用";
  const publicTradingReady = Boolean(
    props.featureEnabled &&
    props.hasBuilderCode &&
    walletConnected &&
    effectiveHasCredentials &&
    readinessInput.userSigningAvailable === true &&
    props.marketTradable &&
    props.submitModeEnabled === true &&
    props.submitterAvailable,
  );
  const tradingStatusLabel = publicTradingReady
    ? "實盤提交已啟用"
    : props.submitModeEnabled === false
      ? "交易介面預覽；實盤提交已停用"
      : props.marketTradable
        ? "交易介面預覽"
        : "市場只供瀏覽";
  const estimated = !Number.isFinite(parsedPrice) || !Number.isFinite(parsedSize) ? null : parsedPrice * parsedSize;
  const estimatedMaxFees = estimated === null ? null : estimated * 0.015;
  const readinessLabel = copy.readinessCopy[topBlockingReason ?? readiness] ?? topBlockingReason ?? readiness;
  const credentialBadgeTone = l2CredentialReady ? "success" : credentialStatusLoading || credentialStatus?.status === "revoked" ? "warning" : "neutral";
  const credentialBadgeLabel = l2CredentialReady
    ? "已就緒"
    : credentialStatusLoading
      ? "檢查中"
      : credentialStatus?.status === "revoked"
        ? "已撤銷"
        : "未設定";
  const credentialDescription = l2CredentialReady
    ? `已為 ${redactWalletAddress(credentialStatus?.walletAddress ?? null)} 準備好用戶自己的 Polymarket L2 憑證。`
    : credentialStatus?.status === "revoked"
      ? "目前儲存的 Polymarket L2 憑證已撤銷；如要交易，需要重新設定用戶自己的 key、secret 與 passphrase。"
      : "需要用戶自己的 Polymarket L2 key、secret 與 passphrase；平台不會替用戶建立或代管交易身份。";
  const refreshCredentialStatus = async () => {
    setFlowError(null);
    if (!props.loggedIn) {
      setCredentialStatus(null);
      setCredentialStatusLoading(false);
      setL2CredentialReady(false);
      setCredentialStatusCheckedAt(new Date().toISOString());
      return;
    }

    setCredentialStatusLoading(true);
    try {
      const response = await fetch("/api/polymarket/l2-credentials/status", {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "未能取得 Polymarket 憑證狀態。"));
      }
      const payload = await response.json();
      if (!isL2CredentialStatusResponse(payload)) {
        throw new Error("Polymarket 憑證狀態回應格式不正確。");
      }
      setCredentialStatus(payload);
      setL2CredentialReady(payload.status === "present");
      setCredentialStatusCheckedAt(new Date().toISOString());
    } catch (error) {
      setCredentialStatus(null);
      setL2CredentialReady(false);
      setCredentialStatusCheckedAt(new Date().toISOString());
      setFlowError(error instanceof Error ? error.message : "未能取得 Polymarket 憑證狀態。");
    } finally {
      setCredentialStatusLoading(false);
    }
  };

  const setupCredentials = async () => {
    setFlowError(null);
    if (!props.loggedIn) {
      setFlowStatus("請先登入，再儲存你自己的 Polymarket L2 憑證。");
      return;
    }
    setCredentialFormVisible(true);
    setFlowStatus("請輸入你自己的 Polymarket L2 key、secret 與 passphrase。平台只會在伺服器端加密保存。");
    trackFunnelEvent("l2_credentials_missing", { market: props.marketTitle, action: "setup_requested" });
  };

  const submitCredentials = async () => {
    setFlowError(null);
    setFlowStatus(null);
    setCredentialSubmitting(true);

    try {
      const response = await fetch("/api/polymarket/l2-credentials", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          credentials: {
            key: credentialKey.trim(),
            secret: credentialSecret.trim(),
            passphrase: credentialPassphrase.trim(),
          },
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "未能儲存 Polymarket 憑證。"));
      }

      const payload = await response.json();
      if (!isL2CredentialStatusResponse(payload)) {
        throw new Error("Polymarket 憑證狀態回應格式不正確。");
      }
      setCredentialStatus(payload);
      setL2CredentialReady(payload.status === "present");
      setCredentialStatusCheckedAt(new Date().toISOString());
      setCredentialFormVisible(false);
      setCredentialKey("");
      setCredentialSecret("");
      setCredentialPassphrase("");
      setFlowStatus("Polymarket 憑證已安全儲存，現在可以繼續後續簽署流程。");
      trackFunnelEvent("l2_credentials_missing", { market: props.marketTitle, action: "setup_completed" });
    } catch (error) {
      setFlowError(error instanceof Error ? error.message : "未能儲存 Polymarket 憑證。");
    } finally {
      setCredentialSubmitting(false);
    }
  };

  const revokeCredentials = async () => {
    setFlowError(null);
    setFlowStatus(null);
    setCredentialSubmitting(true);

    try {
      const response = await fetch("/api/polymarket/l2-credentials", {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "未能撤銷 Polymarket 憑證。"));
      }
      const payload = await response.json();
      if (!isL2CredentialStatusResponse(payload)) {
        throw new Error("Polymarket 憑證狀態回應格式不正確。");
      }
      setCredentialStatus(payload);
      setL2CredentialReady(false);
      setCredentialStatusCheckedAt(new Date().toISOString());
      setCredentialFormVisible(false);
      setFlowStatus("已撤銷目前儲存的 Polymarket 憑證。");
    } catch (error) {
      setFlowError(error instanceof Error ? error.message : "未能撤銷 Polymarket 憑證。");
    } finally {
      setCredentialSubmitting(false);
    }
  };

  const signOrder = async () => {
    setFlowError(null);
    setFlowStatus("訂單簽署只會在市場、憑證及提交器全部就緒後啟動；目前不會提交交易。");
    trackFunnelEvent("user_order_signature_requested", { market: props.marketTitle, readiness });
  };

  const handlePrimaryAction = async () => {
    try {
      trackFunnelEvent("trade_cta_clicked", { market: props.marketTitle, readiness });
      if (tradeButtonLabel === "設定 Polymarket 憑證") {
        await setupCredentials();
      } else if (tradeButtonLabel === "連接錢包") {
        setFlowStatus("請使用錢包連接元件連接你的錢包；不需要登入帳戶。");
      } else if (tradeButtonLabel === "增值錢包") {
        setFlowStatus("請使用上方增值錢包流程為你自己的錢包增值；平台不託管資金。");
      } else if (tradeButtonLabel === "準備自行簽署訂單") {
        await signOrder();
      }
    } catch (error) {
      setFlowError(error instanceof Error ? error.message : "Polymarket 流程未能完成。");
    }
  };

  useEffect(() => {
    void refreshCredentialStatus();
  }, [props.loggedIn]);

  useEffect(() => {
    trackFunnelEvent("trade_ticket_opened", {
      market: props.marketTitle,
      tokenId: selectedTokenId || null,
    });
  }, [props.marketTitle, selectedTokenId]);

  useEffect(() => {
    trackFunnelEvent("order_preview_requested", { market: props.marketTitle, tokenId: selectedTokenId || null });
  }, [props.marketTitle, selectedTokenId]);

  useEffect(() => {
    if (!effectiveHasCredentials) {
      trackFunnelEvent("l2_credentials_missing", { market: props.marketTitle });
    }
  }, [effectiveHasCredentials, props.marketTitle]);

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
        walletConnected,
        hasCredentials: effectiveHasCredentials,
        marketTradable: props.marketTradable,
        submitterAvailable: props.submitterAvailable,
      });
      trackFunnelEvent("order_preview_failed", { market: props.marketTitle, reason: readiness });
    }
  }, [
    disabled,
    props.featureEnabled,
    props.hasBuilderCode,
    props.marketTitle,
    props.marketTradable,
    props.submitterAvailable,
    effectiveHasCredentials,
    walletConnected,
    readiness,
  ]);

  return (
    <div className="trade-ticket stack" data-testid="polymarket-trade-ticket">
      <div className="ticket-header">
        <div>
          <strong>{copy.tradeViaPolymarket}</strong>
        </div>
        <span className="badge badge-neutral">非託管</span>
      </div>
      <div className="badge badge-warning">
        {props.submitModeEnabled && props.submitterAvailable ? "提交器已就緒" : props.submitModeEnabled ? "交易提交器未準備好" : "實盤提交已停用"}
      </div>
      <div className="warning-card">{copy.finalSignatureWarning}</div>
      <div className="muted">本平台不會代用戶下注或交易；訂單必須由你自己的錢包簽署。</div>
      <div className="muted">{copy.routedExecutionNotice}</div>
      <div className="muted">Polymarket 可能因市場、錢包、流動性、所在地區或合規檢查而拒絕訂單。</div>
      <ThirdwebWalletFundingCard compact surface="trade_ticket" walletConnected={walletConnected} />
      <BuilderFeeDisclosureCard
        locale={props.locale}
        hasBuilderCode={props.hasBuilderCode}
        routedTradingEnabled={publicTradingReady}
        tradingStatusLabel={tradingStatusLabel}
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
          {visibleReadinessChecklist.map((item) => (
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

      <section className="stack" aria-label="Polymarket credential setup">
        <div className="section-heading-row">
          <strong>Polymarket 憑證設定</strong>
          <span className={`badge badge-${credentialBadgeTone}`}>{credentialBadgeLabel}</span>
        </div>
        <div className="muted">{credentialDescription}</div>
        {credentialStatus?.updatedAt ? (
          <div className="muted">最後更新：{formatDateTime(props.locale, credentialStatus.updatedAt)}</div>
        ) : null}
        {credentialStatusCheckedAt ? (
          <div className="muted">最後檢查：{formatDateTime(props.locale, credentialStatusCheckedAt)}</div>
        ) : null}
        <div className="button-row">
          {!l2CredentialReady ? (
            <button type="button" className="secondary-cta" onClick={() => void setupCredentials()} disabled={credentialSubmitting}>
              設定 Polymarket 憑證
            </button>
          ) : (
            <button type="button" className="secondary-cta" onClick={() => void revokeCredentials()} disabled={credentialSubmitting}>
              撤銷已儲存憑證
            </button>
          )}
          <button type="button" className="secondary-cta" onClick={() => void refreshCredentialStatus()} disabled={credentialSubmitting || credentialStatusLoading}>
            {credentialStatusLoading ? "檢查中" : "重新整理狀態"}
          </button>
        </div>
        {credentialFormVisible ? (
          <div className="ticket-form-grid">
            <label className="stack">
              API key
              <input className="control-lg" value={credentialKey} onChange={(event) => setCredentialKey(event.target.value)} autoComplete="off" />
            </label>
            <label className="stack">
              API secret
              <input className="control-lg" type="password" value={credentialSecret} onChange={(event) => setCredentialSecret(event.target.value)} autoComplete="off" />
            </label>
            <label className="stack">
              Passphrase
              <input className="control-lg" type="password" value={credentialPassphrase} onChange={(event) => setCredentialPassphrase(event.target.value)} autoComplete="off" />
            </label>
            <div className="button-row">
              <button
                type="button"
                className="primary-cta"
                disabled={credentialSubmitting || !credentialKey.trim() || !credentialSecret.trim() || !credentialPassphrase.trim()}
                onClick={() => void submitCredentials()}
              >
                {credentialSubmitting ? "儲存中" : "儲存用戶自己的 Polymarket 憑證"}
              </button>
              <button type="button" className="secondary-cta" disabled={credentialSubmitting} onClick={() => setCredentialFormVisible(false)}>
                取消
              </button>
            </div>
            <div className="muted">提交前請先在帳戶頁完成已連結錢包驗證，系統只接受與已驗證錢包一致的使用者憑證。</div>
          </div>
        ) : null}
      </section>

      <div className="readiness-grid compact-status-grid">
        <div className="kv"><span className="kv-key">交易介面</span><span className="kv-value">完成</span></div>
        <div className="kv"><span className="kv-key">實際訂單提交</span><span className="kv-value">{props.featureEnabled && props.submitModeEnabled && props.submitterAvailable ? "已啟用" : "已停用"}</span></div>
        <div className="kv"><span className="kv-key">Builder Code</span><span className="kv-value">{props.hasBuilderCode ? "Builder Code 已設定" : "Builder Code 未設定"}</span></div>
        <div className="kv"><span className="kv-key">錢包</span><span className="kv-value">{walletConnected ? "已連接" : "待處理"}</span></div>
        <div className="kv"><span className="kv-key">錢包地址</span><span className="kv-value">{walletAddressKnown ? "已確認" : "未知"}</span></div>
        <div className="kv"><span className="kv-key">錢包資金</span><span className="kv-value">{walletConnected && thirdweb.configured ? "檢查中" : "待處理"}</span></div>
        <div className="kv"><span className="kv-key">Polymarket 憑證</span><span className="kv-value">{effectiveHasCredentials ? "已就緒" : "需要"}</span></div>
        <div className="kv"><span className="kv-key">市場狀態</span><span className="kv-value">{props.marketTradable ? "可交易" : "暫時不可交易"}</span></div>
        <div className="kv"><span className="kv-key">提交器</span><span className="kv-value">{props.submitModeEnabled && props.submitterAvailable ? "已就緒" : "已停用"}</span></div>
        <div className="kv"><span className="kv-key">{getPolymarketGeoblockStatusLabel("unknown")}</span><span className="kv-value">實際交易是否可提交，將由 Polymarket 的錢包、憑證、市場及合規檢查判斷。</span></div>
        <div className="kv">
          <span className="kv-key">非託管交易</span>
          <span className="kv-value">本平台不會代用戶下注或交易，亦不託管用戶在 Polymarket 的資金。</span>
        </div>
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
        <div className="kv"><span className="kv-key">可接受最差價格</span><span className="kv-value">{formatNum(worstAcceptablePrice)}</span></div>
        <div className="kv"><span className="kv-key">{copy.size}</span><span className="kv-value">{formatNum(Number.isFinite(parsedSize) ? parsedSize : null)}</span></div>
        <div className="kv"><span className="kv-key">{copy.estimatedCostProceeds}</span><span className="kv-value">{formatNum(estimated)}</span></div>
        <div className="kv"><span className="kv-key">{copy.estimatedMaxFees}</span><span className="kv-value">{formatNum(estimatedMaxFees)}</span></div>
        <div className="kv"><span className="kv-key">Builder Maker / Taker 費用</span><span className="kv-value">0.5% / 1%</span></div>
        <div className="kv"><span className="kv-key">Polymarket 平台費用</span><span className="kv-value">以市場回傳資料為準</span></div>
      </section>

      <div className="muted">{copy.builderAttributionNotice}</div>
      <div className="muted">{copy.feeNotice}</div>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={finalConfirmation}
          disabled={readiness !== "ready_to_submit"}
          onChange={(event) => setFinalConfirmation(event.target.checked)}
        />
        <span>我確認以上費用、非託管安排，並準備自行簽署此 Polymarket 訂單。</span>
      </label>
      {topBlockingReason ? (
        <div className="ticket-disabled-reason" data-testid="top-blocking-reason">
          {readinessLabel}
        </div>
      ) : null}
      <a className="secondary-cta" href={props.loggedIn ? "/rewards" : "/login"}>登入以保存推薦獎勵</a>
      {flowStatus ? <div className="badge badge-success">{flowStatus}</div> : null}
      {flowError ? <div className="ticket-disabled-reason">{flowError}</div> : null}
      {tradeButtonLabel === "連接錢包" && thirdweb.client ? (
        <ConnectButton
          client={thirdweb.client}
          chain={polygon}
          connectButton={{ label: "連接錢包" }}
          connectModal={{ title: "連接你的錢包", size: "compact" }}
          theme="dark"
          onConnect={(wallet) => {
            trackFunnelEvent("wallet_connected", { surface: "trade_ticket_primary", provider: "thirdweb", walletId: wallet.id });
          }}
        />
      ) : (
        <button
          type="button"
          className="primary-cta"
          disabled={disabled}
          title={tradeButtonLabel}
          onClick={handlePrimaryAction}
        >
          {tradeButtonLabel}
        </button>
      )}
    </div>
  );
}
