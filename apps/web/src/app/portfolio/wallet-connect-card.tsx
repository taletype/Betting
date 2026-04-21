"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { verifyMessage } from "ethers";

import { baseChainId, baseNetworkLabel, baseSettlementAsset } from "../../lib/base-network";

type WalletState = "disconnected" | "wrong-network" | "ready";

interface WalletConnectCardProps {
  linkedWalletAddress?: string;
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

export function WalletConnectCard({ linkedWalletAddress }: WalletConnectCardProps) {
  const router = useRouter();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [chainIdHex, setChainIdHex] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
    if (!provider) {
      setError("No wallet detected. Install Coinbase Wallet or MetaMask for Base Sepolia testing.");
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
        throw new Error("Wallet connection was cancelled.");
      }

      setWalletAddress(accounts[0] ?? null);
      const chainRaw = await provider.request({ method: "eth_chainId" });
      setChainIdHex(typeof chainRaw === "string" ? chainRaw.toLowerCase() : null);
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "Failed to connect wallet.");
    } finally {
      setBusy(false);
    }
  }, [provider]);

  const switchToBaseSepolia = useCallback(async () => {
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
      setError(switchError instanceof Error ? switchError.message : "Failed to switch network.");
    } finally {
      setBusy(false);
    }
  }, [provider, syncWalletState]);

  const linkWallet = useCallback(async () => {
    if (!provider || !walletAddress) {
      return;
    }

    if (walletState !== "ready") {
      setError(`Switch wallet network to ${baseNetworkLabel} before linking.`);
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
        throw new Error("Wallet did not return a valid signature.");
      }

      const recovered = verifyMessage(signedMessage, signatureRaw);
      if (normalizeAddress(recovered) !== normalizeAddress(walletAddress)) {
        throw new Error("Wallet signature does not match connected account.");
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

      setNotice("Wallet linked. Base deposit verification is now enabled for this account.");
      router.refresh();
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : "Failed to link wallet.");
    } finally {
      setBusy(false);
    }
  }, [provider, router, walletAddress, walletState]);

  return (
    <section className="panel stack">
      <h2 className="section-title">Base Wallet Connect</h2>
      <div className="badge badge-neutral">{baseNetworkLabel} · {baseSettlementAsset}</div>
      <p className="muted">v1 uses Base only. Connect your wallet on {baseNetworkLabel} to enable deposit verification and withdrawals.</p>

      <div className="stack">
        <div className="kv">
          <span className="kv-key">Connected wallet</span>
          <span className="kv-value">{walletAddress ? shortAddress(walletAddress) : "Not connected"}</span>
        </div>
        <div className="kv">
          <span className="kv-key">Wallet network</span>
          <span className="kv-value">{chainIdHex ? `${chainIdHex} (${chainIdHex === expectedChainIdHex ? baseNetworkLabel : "Wrong network"})` : "Unknown"}</span>
        </div>
        <div className="kv">
          <span className="kv-key">Linked wallet</span>
          <span className="kv-value">{linkedWalletAddress ? shortAddress(linkedWalletAddress) : "Not linked"}</span>
        </div>
      </div>

      {walletState === "wrong-network" ? <div className="badge badge-warning">Wrong network. Switch to {baseNetworkLabel}.</div> : null}
      {walletState === "disconnected" ? <div className="badge badge-neutral">Wallet disconnected.</div> : null}
      {walletState === "ready" ? <div className="badge badge-success">Wallet connected on {baseNetworkLabel}.</div> : null}

      <div className="cluster">
        <button type="button" onClick={() => void connectWallet()} disabled={busy}>
          {busy ? "Connecting…" : walletAddress ? "Reconnect Wallet" : "Connect Wallet"}
        </button>
        {walletState === "wrong-network" ? (
          <button type="button" onClick={() => void switchToBaseSepolia()} disabled={busy}>
            Switch to {baseNetworkLabel}
          </button>
        ) : null}
        {walletState === "ready" ? (
          <button type="button" onClick={() => void linkWallet()} disabled={busy || normalizeAddress(walletAddress ?? "") === normalizeAddress(linkedWalletAddress ?? "") }>
            {linkedWalletAddress ? "Relink Wallet" : "Link Wallet"}
          </button>
        ) : null}
      </div>

      {notice ? <div className="badge badge-success">{notice}</div> : null}
      {error ? <div className="badge badge-danger">{error}</div> : null}
    </section>
  );
}
