"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { verifyMessage } from "ethers";

import { baseChainId, baseNetworkLabel, baseSettlementAsset } from "../../lib/base-network";
import { getLocaleCopy, interpolate, type AppLocale } from "../../lib/locale";
import { trackFunnelEvent } from "../funnel-analytics";

type WalletState = "disconnected" | "wrong-network" | "ready";

interface WalletConnectCardProps {
  linkedWalletAddress?: string;
  locale: AppLocale;
}

type EthereumProvider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, callback: (...args: unknown[]) => void): void;
  removeListener?(event: string, callback: (...args: unknown[]) => void): void;
};

const expectedChainIdHex = `0x${baseChainId.toString(16)}`;

const normalizeAddress = (value: string): string => value.trim().toLowerCase();

const shortAddress = (value: string): string => `${value.slice(0, 6)}…${value.slice(-4)}`;

const readProvider = (): EthereumProvider | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const candidate = (window as Window & { ethereum?: EthereumProvider }).ethereum;
  return candidate ?? null;
};

const toWalletState = (connected: boolean, correctChain: boolean): WalletState => {
  if (!connected) {
    return "disconnected";
  }

  if (!correctChain) {
    return "wrong-network";
  }

  return "ready";
};

export function WalletConnectCard({ linkedWalletAddress, locale }: WalletConnectCardProps) {
  const router = useRouter();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [chainIdHex, setChainIdHex] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const copy = getLocaleCopy(locale).wallet;
  const provider = useMemo(() => readProvider(), []);

  const syncWalletState = useCallback(async () => {
    if (!provider) {
      setWalletAddress(null);
      setChainIdHex(null);
      return;
    }

    const [accountsRaw, chainRaw] = await Promise.all([
      provider.request({ method: "eth_accounts" }),
      provider.request({ method: "eth_chainId" }),
    ]);

    const accounts = Array.isArray(accountsRaw)
      ? accountsRaw.filter((value): value is string => typeof value === "string")
      : [];

    setWalletAddress(accounts[0] ?? null);
    setChainIdHex(typeof chainRaw === "string" ? chainRaw.toLowerCase() : null);
  }, [provider]);

  useEffect(() => {
    void syncWalletState();
  }, [syncWalletState]);

  useEffect(() => {
    if (!provider?.on || !provider.removeListener) {
      return;
    }

    const onAccountsChanged = (accountsRaw: unknown) => {
      const accounts = Array.isArray(accountsRaw)
        ? accountsRaw.filter((value): value is string => typeof value === "string")
        : [];
      setWalletAddress(accounts[0] ?? null);
    };

    const onChainChanged = (nextChainId: unknown) => {
      setChainIdHex(typeof nextChainId === "string" ? nextChainId.toLowerCase() : null);
    };

    provider.on("accountsChanged", onAccountsChanged);
    provider.on("chainChanged", onChainChanged);

    return () => {
      provider.removeListener?.("accountsChanged", onAccountsChanged);
      provider.removeListener?.("chainChanged", onChainChanged);
    };
  }, [provider]);

  const walletState = toWalletState(Boolean(walletAddress), chainIdHex === expectedChainIdHex);

  const connectWallet = useCallback(async () => {
    trackFunnelEvent("wallet_connect_clicked", { surface: "portfolio" });
    if (!provider) {
      setError(copy.noWalletDetected);
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const accountsRaw = await provider.request({ method: "eth_requestAccounts" });
      const accounts = Array.isArray(accountsRaw)
        ? accountsRaw.filter((value): value is string => typeof value === "string")
        : [];

      if (accounts.length === 0) {
        throw new Error(copy.walletConnectionCancelled);
      }

      setWalletAddress(accounts[0] ?? null);
      const chainRaw = await provider.request({ method: "eth_chainId" });
      setChainIdHex(typeof chainRaw === "string" ? chainRaw.toLowerCase() : null);
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : copy.failedToConnectWallet);
    } finally {
      setBusy(false);
    }
  }, [copy.failedToConnectWallet, copy.noWalletDetected, copy.walletConnectionCancelled, provider]);

  const switchToBaseNetwork = useCallback(async () => {
    if (!provider) {
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: expectedChainIdHex }] });
      await syncWalletState();
    } catch (switchError) {
      setError(switchError instanceof Error ? switchError.message : copy.failedToSwitchNetwork);
    } finally {
      setBusy(false);
    }
  }, [copy.failedToSwitchNetwork, provider, syncWalletState]);

  const linkWallet = useCallback(async () => {
    if (!provider || !walletAddress) {
      return;
    }

    if (walletState !== "ready") {
      setError(interpolate(copy.switchBeforeLink, { network: baseNetworkLabel }));
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const nonce = crypto.randomUUID();
      const signedMessage = `Bet wallet link\nuser:self\nnonce:${nonce}`;
      const signatureRaw = await provider.request({ method: "personal_sign", params: [signedMessage, walletAddress] });

      if (typeof signatureRaw !== "string") {
        throw new Error(copy.invalidSignature);
      }

      const recovered = verifyMessage(signedMessage, signatureRaw);
      if (normalizeAddress(recovered) !== normalizeAddress(walletAddress)) {
        throw new Error(copy.signatureMismatch);
      }

      const response = await fetch("/api/wallets/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          walletAddress,
          signedMessage,
          signature: signatureRaw,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? `Failed to link wallet (${response.status})`);
      }

      setNotice(copy.walletLinkedNotice);
      router.refresh();
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : copy.failedToLinkWallet);
    } finally {
      setBusy(false);
    }
  }, [
    copy.failedToLinkWallet,
    copy.invalidSignature,
    copy.signatureMismatch,
    copy.switchBeforeLink,
    copy.walletLinkedNotice,
    provider,
    router,
    walletAddress,
    walletState,
  ]);

  return (
    <section className="panel stack">
      <h2 className="section-title">{copy.title}</h2>
      <div className="badge badge-neutral">{baseNetworkLabel} · {baseSettlementAsset}</div>
      <p className="muted">{interpolate(copy.subtitle, { network: baseNetworkLabel })}</p>

      <div className="stack">
        <div className="kv">
          <span className="kv-key">{copy.connectedWallet}</span>
          <span className="kv-value">{walletAddress ? shortAddress(walletAddress) : copy.notConnected}</span>
        </div>
        <div className="kv">
          <span className="kv-key">{copy.walletNetwork}</span>
          <span className="kv-value">{chainIdHex ? `${chainIdHex} (${chainIdHex === expectedChainIdHex ? baseNetworkLabel : copy.wrongNetwork})` : copy.unknown}</span>
        </div>
        <div className="kv">
          <span className="kv-key">{copy.linkedWallet}</span>
          <span className="kv-value">{linkedWalletAddress ? shortAddress(linkedWalletAddress) : copy.notLinked}</span>
        </div>
      </div>

      {walletState === "wrong-network" ? <div className="badge badge-warning">{interpolate(copy.wrongNetworkBadge, { network: baseNetworkLabel })}</div> : null}
      {walletState === "disconnected" ? <div className="badge badge-neutral">{copy.disconnectedBadge}</div> : null}
      {walletState === "ready" ? <div className="badge badge-success">{interpolate(copy.connectedBadge, { network: baseNetworkLabel })}</div> : null}

      <div className="cluster">
        <button type="button" onClick={() => void connectWallet()} disabled={busy}>
          {busy ? copy.connecting : walletAddress ? copy.reconnectWallet : copy.connectWallet}
        </button>
        {walletState === "wrong-network" ? (
          <button type="button" onClick={() => void switchToBaseNetwork()} disabled={busy}>
            {interpolate(copy.switchToNetwork, { network: baseNetworkLabel })}
          </button>
        ) : null}
        {walletState === "ready" ? (
          <button type="button" onClick={() => void linkWallet()} disabled={busy || normalizeAddress(walletAddress ?? "") === normalizeAddress(linkedWalletAddress ?? "") }>
            {linkedWalletAddress ? copy.relinkWallet : copy.linkWallet}
          </button>
        ) : null}
      </div>

      {notice ? <div className="badge badge-success">{notice}</div> : null}
      {error ? <div className="badge badge-danger">{error}</div> : null}
    </section>
  );
}
