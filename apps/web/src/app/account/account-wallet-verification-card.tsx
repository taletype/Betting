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

const normalizeAddress = (address: string | null | undefined): string | null => {
  const normalized = address?.trim().toLowerCase();
  return normalized && /^0x[0-9a-f]{40}$/.test(normalized) ? normalized : null;
};

const shortAddress = (address: string): string => `${address.slice(0, 6)}...${address.slice(-4)}`;

const getVerifiedWallet = (payload: WalletsMeResponse): VerifiedWallet | null =>
  payload.wallet ?? payload.wallets?.find((wallet) => wallet.verifiedAt) ?? payload.wallets?.[0] ?? null;

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
  const buttonLabel = hasMismatch ? "重新驗證此錢包" : "驗證此錢包";

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
    const provider = window.ethereum;
    if (!provider?.request) {
      setError("找不到可簽署訊息的錢包。請在瀏覽器錢包中重新連接。");
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

      const signature = await provider.request({
        method: "personal_sign",
        params: [challengePayload.signedMessage, connectedAddress],
      });
      if (typeof signature !== "string") throw new Error("signature_missing");

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
      if (!verifyResponse.ok) throw new Error("verify_failed");
      const verifyPayload = await verifyResponse.json() as VerifyResponse;
      setVerifiedWallet(verifyPayload.wallet ?? null);
      await refreshWallet();
      setNotice("錢包已完成驗證。");
    } catch {
      setError("錢包驗證未能完成。請確認錢包簽署訊息後再試。");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <section className="panel stack" data-testid="account-wallet-verification-card">
      <div className="section-heading-row">
        <strong>錢包驗證</strong>
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
      <p className="muted">瀏覽器錢包連接只代表你可使用該錢包；伺服器已驗證錢包需要簽署證明，才會用於帳戶綁定。</p>
      {notice ? <div className="banner banner-success">{notice}</div> : null}
      {error ? <div className="status-bad">{error}</div> : null}
    </section>
  );
}
