"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useThirdwebWalletStatus } from "../thirdweb-provider";
import {
  getActiveEvmAddressOrThrow,
  getVerifiedWallet,
  hasWalletAddressValue,
  normalizeEvmAddress,
  runWalletVerificationFlow,
  shortAddress,
  toWalletVerificationErrorCode,
  walletVerificationMessages,
  WalletVerificationFlowError,
  type ChallengeResponse,
  type VerifiedWallet,
  type VerifyResponse,
  type WalletsMeResponse,
  type WalletVerificationChallengeContext,
  type WalletVerificationErrorCode,
} from "./wallet-verification-flow";

type EthereumProvider = {
  request: (input: { method: string; params?: unknown[] }) => Promise<unknown>;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

const chain = "base";
const walletVerificationTitle = "驗證此 EVM 錢包";
const walletVerificationDisclosure = "瀏覽器錢包連接只代表你可使用該錢包；伺服器已驗證錢包需要簽署證明。";

const isUserRejectedSignature = (error: unknown): boolean => {
  const record = error && typeof error === "object" ? error as { code?: unknown; message?: unknown } : {};
  const code = typeof record.code === "number" || typeof record.code === "string" ? String(record.code) : "";
  const message = typeof record.message === "string" ? record.message : error instanceof Error ? error.message : "";
  return code === "4001" || /user rejected|user denied|rejected by user|denied by user|cancelled|canceled/i.test(message);
};

const readWalletVerificationErrorCode = async (response: Response): Promise<WalletVerificationErrorCode | null> => {
  const payload = await response.json().catch(() => null) as { code?: unknown } | null;
  return toWalletVerificationErrorCode(payload?.code);
};

const requestWalletVerificationSignature = async (input: {
  message: string;
  walletAddress: string;
  thirdwebSignMessage: ((message: string) => Promise<string>) | null;
}): Promise<string> => {
  if (input.thirdwebSignMessage) {
    try {
      const signature = await input.thirdwebSignMessage(input.message);
      if (typeof signature === "string" && signature.trim()) return signature;
    } catch (error) {
      if (isUserRejectedSignature(error)) throw new Error("user_rejected_signature");
    }
  }

  const provider = typeof window === "undefined" ? null : window.ethereum;
  if (!provider?.request) throw new Error("wallet_sign_unavailable");
  try {
    const signature = await provider.request({
      method: "personal_sign",
      params: [input.message, input.walletAddress],
    });
    if (typeof signature !== "string" || !signature.trim()) throw new Error("wallet_sign_unavailable");
    return signature;
  } catch (error) {
    if (isUserRejectedSignature(error)) throw new Error("user_rejected_signature");
    throw error;
  }
};

type WalletVerificationErrorState = {
  code: WalletVerificationErrorCode;
  message: string;
  walletAddress: string | null;
};

const toErrorState = (error: unknown, walletAddress: string | null): WalletVerificationErrorState => {
  const code = error instanceof WalletVerificationFlowError
    ? error.code
    : toWalletVerificationErrorCode(error instanceof Error ? error.message : null) ?? "signature_mismatch";
  return {
    code,
    message: walletVerificationMessages[code],
    walletAddress: error instanceof WalletVerificationFlowError ? error.walletAddress ?? walletAddress : walletAddress,
  };
};

export function AccountWalletVerificationCardView({
  activeWalletPresent,
  connectedAddress,
  verifiedAddress,
  loading,
  verifying,
  notice,
  error,
  onVerify,
}: {
  activeWalletPresent: boolean;
  connectedAddress: string | null;
  verifiedAddress: string | null;
  loading: boolean;
  verifying: boolean;
  notice: string | null;
  error: string | null;
  onVerify?: () => void;
}) {
  const currentWalletInvalid = activeWalletPresent && !connectedAddress;
  const matchesVerifiedWallet = Boolean(connectedAddress && verifiedAddress && connectedAddress === verifiedAddress);
  const hasMismatch = Boolean(connectedAddress && verifiedAddress && connectedAddress !== verifiedAddress);
  const canVerify = activeWalletPresent && !matchesVerifiedWallet;
  const serverWalletLabel = useMemo(() => {
    if (!verifiedAddress) return "待驗證";
    return shortAddress(verifiedAddress);
  }, [verifiedAddress]);
  const statusLabel = !activeWalletPresent
    ? "尚未連接錢包"
    : currentWalletInvalid
      ? "錢包地址格式無效"
      : matchesVerifiedWallet
        ? "已驗證"
        : hasMismatch
          ? "目前錢包與已驗證錢包不同，請重新驗證"
          : "已連接，尚未完成伺服器驗證";

  return (
    <section className="panel stack" data-testid="account-wallet-verification-card">
      <div className="section-heading-row">
        <strong>EVM 錢包驗證</strong>
        {matchesVerifiedWallet ? <span className="badge badge-success">已驗證</span> : null}
      </div>
      <div className="kv">
        <span className="kv-key">目前連接錢包</span>
        <span className="kv-value mono">
          {!activeWalletPresent ? "尚未連接錢包" : connectedAddress ? shortAddress(connectedAddress) : "錢包地址格式無效"}
        </span>
      </div>
      <div className="kv">
        <span className="kv-key">已驗證錢包</span>
        <span className="kv-value mono">{loading ? "載入中" : serverWalletLabel}</span>
      </div>
      <div className="kv">
        <span className="kv-key">狀態</span>
        <span className="kv-value">{statusLabel}</span>
      </div>
      {matchesVerifiedWallet && verifiedAddress ? <div className="banner banner-success">已驗證</div> : null}
      {hasMismatch ? <div className="banner banner-warning">目前錢包與已驗證錢包不同，請重新驗證</div> : null}
      {canVerify ? (
        <button type="button" onClick={onVerify} disabled={verifying}>
          {verifying ? "驗證中……" : walletVerificationTitle}
        </button>
      ) : null}
      {!activeWalletPresent ? <p className="muted">尚未連接錢包</p> : null}
      <p className="muted">{walletVerificationDisclosure}</p>
      {notice ? <div className="banner banner-success">{notice}</div> : null}
      {error ? <div className="status-bad">{error}</div> : null}
    </section>
  );
}

export function AccountWalletVerificationCard() {
  const thirdweb = useThirdwebWalletStatus();
  const [verifiedWallet, setVerifiedWallet] = useState<VerifiedWallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [pendingChallenge, setPendingChallenge] = useState<WalletVerificationChallengeContext | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<WalletVerificationErrorState | null>(null);
  const activeWalletPresent = hasWalletAddressValue(thirdweb.address);
  const connectedAddress = normalizeEvmAddress(thirdweb.address);
  const verifiedAddress = normalizeEvmAddress(verifiedWallet?.walletAddress);
  const activeAddressRef = useRef<string | null>(thirdweb.address);
  const signMessageRef = useRef<typeof thirdweb.signMessage>(thirdweb.signMessage);

  useEffect(() => {
    activeAddressRef.current = thirdweb.address;
    signMessageRef.current = thirdweb.signMessage;
  }, [thirdweb.address, thirdweb.signMessage]);

  useEffect(() => {
    setPendingChallenge(null);
    setError((current) => {
      if (!current?.walletAddress) return current;
      const activeAddress = normalizeEvmAddress(thirdweb.address);
      if ((current.code === "signature_mismatch" || current.code === "wallet_switched") && current.walletAddress !== activeAddress) {
        return null;
      }
      return current;
    });
  }, [thirdweb.address]);

  const refreshWallet = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/wallets/me", { cache: "no-store" });
      if (!response.ok) throw new Error("wallet_load_failed");
      const payload = await response.json() as WalletsMeResponse;
      setVerifiedWallet(getVerifiedWallet(payload));
      setError(null);
    } catch {
      setError({ code: "signature_mismatch", message: "已登入，但已驗證錢包暫時未能載入。請重新整理或稍後再試。", walletAddress: connectedAddress });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshWallet();
  }, []);

  const verifyWallet = async () => {
    setNotice(null);
    setError(null);
    setVerifying(true);
    try {
      const response = await runWalletVerificationFlow({
        chain,
        getActiveWalletAddress: () => activeAddressRef.current,
        onChallenge: setPendingChallenge,
        onAbort: () => setPendingChallenge(null),
        requestChallenge: async (payload) => {
          const challengeResponse = await fetch("/api/wallets/link/challenge", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!challengeResponse.ok) {
            throw new WalletVerificationFlowError((await readWalletVerificationErrorCode(challengeResponse)) ?? "signature_mismatch", payload.walletAddress);
          }
          return await challengeResponse.json() as ChallengeResponse;
        },
        signMessage: async (payload) => {
          const walletAddress = getActiveEvmAddressOrThrow(activeAddressRef.current);
          return requestWalletVerificationSignature({
            message: payload.message,
            walletAddress,
            thirdwebSignMessage: signMessageRef.current,
          });
        },
        submitVerification: async (payload) => {
          const verifyResponse = await fetch("/api/wallets/verify", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!verifyResponse.ok) {
            throw new WalletVerificationFlowError((await readWalletVerificationErrorCode(verifyResponse)) ?? "signature_mismatch", payload.walletAddress);
          }
          return await verifyResponse.json() as VerifyResponse;
        },
      });
      setVerifiedWallet(response.wallet ?? null);
      await refreshWallet();
      setNotice("已驗證");
    } catch (error) {
      setError(toErrorState(error, pendingChallenge?.walletAddress ?? connectedAddress));
    } finally {
      setPendingChallenge(null);
      setVerifying(false);
    }
  };

  return (
    <AccountWalletVerificationCardView
      activeWalletPresent={activeWalletPresent}
      connectedAddress={connectedAddress}
      verifiedAddress={verifiedAddress}
      loading={loading}
      verifying={verifying}
      notice={notice}
      error={error?.message ?? null}
      onVerify={verifyWallet}
    />
  );
}
