"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createThirdwebClient, type ThirdwebClient } from "thirdweb";
import { ThirdwebProvider, useActiveAccount } from "thirdweb/react";

interface ThirdwebWalletStatus {
  client: ThirdwebClient | null;
  configured: boolean;
  connected: boolean;
  address: string | null;
}

const thirdwebClientId = process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID?.trim();
export const thirdwebClient = thirdwebClientId ? createThirdwebClient({ clientId: thirdwebClientId }) : null;

const defaultStatus: ThirdwebWalletStatus = {
  client: thirdwebClient,
  configured: Boolean(thirdwebClient),
  connected: false,
  address: null,
};

const ThirdwebWalletStatusContext = createContext<ThirdwebWalletStatus>(defaultStatus);

function ThirdwebWalletStatusBridge({ onStatus }: { onStatus: (status: Pick<ThirdwebWalletStatus, "connected" | "address">) => void }) {
  const account = useActiveAccount();

  useEffect(() => {
    onStatus({
      connected: Boolean(account?.address),
      address: account?.address ?? null,
    });
  }, [account?.address, onStatus]);

  return null;
}

function ThirdwebWalletStatusProvider({ children }: { children: React.ReactNode }) {
  const [wallet, setWallet] = useState<Pick<ThirdwebWalletStatus, "connected" | "address">>({
    connected: false,
    address: null,
  });
  const status = useMemo<ThirdwebWalletStatus>(
    () => ({
      client: thirdwebClient,
      configured: Boolean(thirdwebClient),
      connected: wallet.connected,
      address: wallet.address,
    }),
    [wallet.address, wallet.connected],
  );

  return (
    <ThirdwebWalletStatusContext.Provider value={status}>
      <ThirdwebWalletStatusBridge onStatus={setWallet} />
      {children}
    </ThirdwebWalletStatusContext.Provider>
  );
}

export function OptionalThirdwebProvider({ children }: { children: React.ReactNode }) {
  if (!thirdwebClient) {
    return <ThirdwebWalletStatusContext.Provider value={defaultStatus}>{children}</ThirdwebWalletStatusContext.Provider>;
  }

  return (
    <ThirdwebProvider>
      <ThirdwebWalletStatusProvider>{children}</ThirdwebWalletStatusProvider>
    </ThirdwebProvider>
  );
}

export function useThirdwebWalletStatus() {
  return useContext(ThirdwebWalletStatusContext);
}
