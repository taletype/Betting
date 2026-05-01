"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useThirdwebWalletStatus } from "../thirdweb-provider";

type VerifiedWallet = {
  id: string;
  chain: string;
  walletAddress: string;
  verifiedAt: string | null;
};

type WalletsMeResponse = {
  wallets?: VerifiedWallet[];
  wallet?: VerifiedWallet | null;
};

type ChallengeResponse = {
  challenge?: { id?: string; chain?: string };
  challengeId?: string;
  signedMessage: string;
};

type VerifyResponse = {
  wallet?: VerifiedWallet;
};

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

type WalletVerificationErrorCode =
  | "wallet_sign_unavailable"
  | "user_rejected_signature"
  | "signature_mismatch"
  | "challenge_expired"
  | "challenge_reused";

const walletVerificationErrorMessage: Record<WalletVerificationErrorCode, string> = {
  wallet_sign_unavailable: "wallet_sign_unavailable：找不到可簽署訊息的錢包。",
  user_rejected_signature: "user_rejected_signature：你已取消錢包簽署。",
  signature_mismatch: "signature_mismatch：簽署錢包與驗證錢包不一致。",
  challenge_expired: "challenge_expired：驗證挑戰已過期，請重新開始。",
  challenge_reused: "challenge_reused：驗證挑戰已使用，請重新開始。",
};

const normalizeAddress = (address: string | null | undefined): string | null => {
  const normalized = address?.trim().toLowerCase();
  return normalized && /^0x[0-9a-f]{40}$/.test(normalized) ? normalized : null;
};

const shortAddress = (address: string): string => `${address.slice(0, 6)}...${address.slice(-4)}`;

const getVerifiedWallet = (payload: WalletsMeResponse): VerifiedWallet | null =>
  payload.wallet ?? payload.wallets?.find((wallet) => wallet.verifiedAt) ?? payload.wallets?.[0] ?? null;

const isUserRejectedSignature = (error: unknown): boolean => {
  const record = error && typeof error === "object" ? error as { code?: unknown; message?: unknown } : {};
  const code = typeof record.code === "number" || typeof record.code === "string" ? String(record.code) : "";
  const message = typeof record.message === "string" ? record.message : error instanceof Error ? error.message : "";
  return code === "4001" || /user rejected|user denied|rejected by user|denied by user|cancelled|canceled/i.test(message);
};

const toWalletVerificationErrorCode = (code: unknown): WalletVerificationErrorCode | null => {
  if (code === "wallet_sign_unavailable" || code === "user_rejected_signature" || code === "signature_mismatch" || code === "challenge_expired" || code === "challenge_reused") return code;
  if (code === "WALLET_SIGNATURE_MISMATCH" || code === "POLYMARKET_WALLET_SIGNATURE_MISMATCH") return "signature_mismatch";
  if (code === "WALLET_CHALLENGE_EXPIRED") return "challenge_expired";
  if (code === "WALLET_CHALLENGE_REUSED") return "challenge_reused";
  return null;
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

export function AccountWalletVerificationCard() {
  const thirdweb = useThirdwebWalletStatus();
  const [verifiedWallet, setVerifiedWallet] = useState<VerifiedWallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const connectedAddress = normalizeAddress(thirdweb.address);
  const verifiedAddress = normalizeAddress(verifiedWallet?.walletAddress);
  const matchesVerifiedWallet = Boolean(connectedAddress && verifiedAddress && connectedAddress === verifiedAddress);
  const hasMismatch = Boolean(connectedAddress && verifiedAddress && connectedAddress !== verifiedAddress);
  const buttonLabel = hasMismatch ? "重新驗證此 EVM 錢包" : walletVerificationTitle;

  const serverWalletLabel = useMemo(() => {
    if (!verifiedAddress) return "待驗證";
    return shortAddress(verifiedAddress);
  }, [verifiedAddress]);

  const refreshWallet = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/wallets/me", { cache: "no-store" });
      if (!response.ok) throw new Error("wallet_load_failed");
      const payload = await response.json() as WalletsMeResponse;
      setVerifiedWallet(getVerifiedWallet(payload));
      setError(null);
    } catch {
      setError("已登入，但已驗證錢包暫時未能載入。請重新整理或稍後再試。");
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
    if (!connectedAddress) {
      setError("請先連接錢包。");
      return;
    }
    setVerifying(true);
    try {
      const challengeResponse = await fetch("/api/wallets/link/challenge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ walletAddress: connectedAddress, chain }),
      });
      if (!challengeResponse.ok) throw new Error("challenge_failed");
      const challengePayload = await challengeResponse.json() as ChallengeResponse;
      const challengeId = challengePayload.challenge?.id ?? challengePayload.challengeId;
      if (!challengeId || !challengePayload.signedMessage) throw new Error("challenge_invalid");

      const signature = await requestWalletVerificationSignature({
        message: challengePayload.signedMessage,
        walletAddress: connectedAddress,
        thirdwebSignMessage: thirdweb.signMessage,
      });

      const verifyResponse = await fetch("/api/wallets/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          walletAddress: connectedAddress,
          chain,
          challengeId,
          signedMessage: challengePayload.signedMessage,
          signature,
        }),
      });
      if (!verifyResponse.ok) {
        throw new Error((await readWalletVerificationErrorCode(verifyResponse)) ?? "signature_mismatch");
      }
      const verifyPayload = await verifyResponse.json() as VerifyResponse;
      setVerifiedWallet(verifyPayload.wallet ?? null);
      await refreshWallet();
      setNotice("錢包已完成驗證。");
    } catch (error) {
      const code = toWalletVerificationErrorCode(error instanceof Error ? error.message : null) ?? "signature_mismatch";
      setError(walletVerificationErrorMessage[code]);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <section className="panel stack" data-testid="account-wallet-verification-card">
      <div className="section-heading-row">
        <strong>EVM 錢包驗證</strong>
        {matchesVerifiedWallet ? <span className="badge badge-success">已驗證</span> : null}
      </div>
      <div className="kv">
        <span className="kv-key">目前連接錢包</span>
        <span className="kv-value mono">{connectedAddress ? shortAddress(connectedAddress) : "尚未連接錢包"}</span>
      </div>
      <div className="kv">
        <span className="kv-key">已驗證錢包</span>
        <span className="kv-value mono">{loading ? "載入中" : serverWalletLabel}</span>
      </div>
      {matchesVerifiedWallet && verifiedAddress ? <div className="banner banner-success">已驗證錢包：{shortAddress(verifiedAddress)}</div> : null}
      {hasMismatch ? <div className="banner banner-warning">目前連接錢包與已驗證錢包不同。</div> : null}
      {connectedAddress && !matchesVerifiedWallet ? (
        <button type="button" onClick={verifyWallet} disabled={verifying}>
          {verifying ? "驗證中..." : buttonLabel}
        </button>
      ) : null}
      {!connectedAddress ? <p className="muted">請先在下方連接錢包；連接後仍需簽署訊息才會成為已驗證錢包。</p> : null}
      <p className="muted">{walletVerificationDisclosure}</p>
      {notice ? <div className="banner banner-success">{notice}</div> : null}
      {error ? <div className="status-bad">{error}</div> : null}
    </section>
  );
}
