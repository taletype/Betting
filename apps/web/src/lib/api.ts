import {
  MarketSnapshotSchema,
  MarketTradesSchema,
  OrderBookSchema,
  PortfolioSnapshotSchema,
  WithdrawalRecordSchema,
  CreateOrderRequestSchema,
  PostOrdersResponseSchema,
} from "@bet/contracts";

const getApiBaseUrl = (): string => {
  const configuredUrl = process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL;

  if (configuredUrl) {
    return configuredUrl.replace(/\/+$/, "");
  }

  return "";
};

const getAdminApiToken = (): string => {
  const configuredToken = process.env.ADMIN_API_TOKEN?.trim();

  if (configuredToken) {
    return configuredToken;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("ADMIN_API_TOKEN is required in production");
  }

  return "dev-admin-token";
};

const getAdminApiToken = (): string => {
  const configuredToken = process.env.ADMIN_API_TOKEN?.trim();

  if (configuredToken) {
    return configuredToken;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("ADMIN_API_TOKEN is required in production");
  }

  return "dev-admin-token";
};

export const apiRequest = async <T>(
  path: string,
  init?: RequestInit & { allowNotFound?: boolean },
): Promise<T | null> => {
  const base = getApiBaseUrl();
  const url = base ? `${base}${path}` : path;

  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (init?.allowNotFound && response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? `API request failed for ${path}: ${response.status}`);
  }

  return (await response.json()) as T;
};

const readApiJson = async (
  path: string,
  options?: { allowNotFound?: boolean; method?: string; body?: unknown; headers?: HeadersInit },
) =>
  apiRequest(path, {
    method: options?.method ?? "GET",
    headers: options?.headers,
    body: options?.body ? JSON.stringify(options.body) : undefined,
    allowNotFound: options?.allowNotFound,
  });

export const toBigInt = (value: string | number | bigint | null | undefined): bigint => {
  if (typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number") {
    return BigInt(value);
  }

  if (!value) {
    return 0n;
  }

  return BigInt(value);
};

export const listMarkets = async () => {
  const data = await readApiJson("/markets");
  if (!data || !Array.isArray(data)) {
    return [];
  }
  try {
    return MarketSnapshotSchema.array().parse(data);
  } catch {
    return data;
  }
};

export const getMarket = async (marketId: string) => {
  const payload = await readApiJson(`/markets/${marketId}`, { allowNotFound: true });

  if (payload === null) {
    return null;
  }

  return MarketSnapshotSchema.nullable().parse((payload as { market: unknown }).market);
};

export const getOrderBook = async (marketId: string) =>
  OrderBookSchema.parse(await readApiJson(`/markets/${marketId}/orderbook`));

export const getRecentTrades = async (marketId: string) =>
  MarketTradesSchema.parse(await readApiJson(`/markets/${marketId}/trades`));

export const getPortfolio = async () =>
  PortfolioSnapshotSchema.parse(await readApiJson("/portfolio"));

export const linkWallet = async (input: {
  walletAddress: string;
  signature: string;
  signedMessage: string;
}) => readApiJson("/wallets/link", { method: "POST", body: input });

export const verifyDepositTx = async (txHash: string) =>
  readApiJson("/deposits/verify", { method: "POST", body: { txHash } });

export const requestWithdrawal = async (input: {
  amountAtoms: bigint;
  destinationAddress: string;
}) =>
  readApiJson("/withdrawals", {
    method: "POST",
    body: { amountAtoms: input.amountAtoms.toString(), destinationAddress: input.destinationAddress },
  });

export const listWithdrawals = async () => {
  const payload = await readApiJson("/withdrawals");
  return WithdrawalRecordSchema.array().parse((payload as { withdrawals: unknown[] }).withdrawals);
};

export const listAdminRequestedWithdrawals = async () => {
  const payload = await readApiJson("/admin/withdrawals", {
    headers: {
      "x-admin-token": getAdminApiToken(),
    },
  });

  return WithdrawalRecordSchema.array().parse((payload as { withdrawals: unknown[] }).withdrawals);
};

export const executeAdminWithdrawal = async (withdrawalId: string, txHash: string) =>
  readApiJson(`/admin/withdrawals/${withdrawalId}/execute`, {
    method: "POST",
    headers: {
      "x-admin-token": getAdminApiToken(),
    },
    body: { txHash },
  });

export const failAdminWithdrawal = async (withdrawalId: string, reason: string) =>
  readApiJson(`/admin/withdrawals/${withdrawalId}/fail`, {
    method: "POST",
    headers: {
      "x-admin-token": getAdminApiToken(),
    },
    body: { reason },
  });

export const createOrder = async (input: {
  marketId: string;
  outcomeId: string;
  side: "buy" | "sell";
  orderType: "limit" | "market";
  price: string;
  quantity: string;
  clientOrderId?: string | null;
}) => {
  const validated = CreateOrderRequestSchema.parse({
    marketId: input.marketId,
    outcomeId: input.outcomeId,
    side: input.side,
    orderType: input.orderType,
    price: input.price,
    quantity: input.quantity,
    clientOrderId: input.clientOrderId ?? null,
  });
  return PostOrdersResponseSchema.parse(
    await readApiJson("/orders", {
      method: "POST",
      body: validated,
    }),
  );
};
