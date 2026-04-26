import {
  MarketSnapshotSchema,
  MarketTradesSchema,
  OrderBookSchema,
  PortfolioSnapshotSchema,
  WithdrawalRecordSchema,
  GetMlmDashboardResponseSchema,
  GetAdminMlmOverviewResponseSchema,
  ApiMlmCommissionPlanSchema,
  CreateOrderRequestSchema,
  PostOrdersResponseSchema,
} from "@bet/contracts";

const getServerCookieHeader = async (): Promise<string | null> => {
  if (typeof window !== "undefined") {
    return null;
  }

  try {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const cookieHeader = cookieStore
      .getAll()
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ");

    return cookieHeader || null;
  } catch {
    return null;
  }
};

const getOptionalProxyHeaders = async (): Promise<HeadersInit> => {
  const forwardedUserId = process.env.API_REQUEST_USER_ID?.trim();
  const forwardedAdminToken = process.env.API_REQUEST_ADMIN_TOKEN?.trim();
  const cookieHeader = await getServerCookieHeader();

  const headers: Record<string, string> = {};
  if (forwardedUserId) {
    headers["x-user-id"] = forwardedUserId;
  }
  if (forwardedAdminToken) {
    headers["x-admin-token"] = forwardedAdminToken;
  }
  if (cookieHeader) {
    headers.cookie = cookieHeader;
  }

  return headers;
};

const getConfiguredApiBaseUrl = (): string => {
  const configuredUrl = process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL;

  if (configuredUrl) {
    return configuredUrl.replace(/\/+$/, "");
  }

  return "";
};

const getLocalWebBaseUrl = (): string => {
  if (typeof window !== "undefined") {
    return "";
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (siteUrl?.trim()) {
    return siteUrl.startsWith("http") ? siteUrl.replace(/\/+$/, "") : `https://${siteUrl.replace(/\/+$/, "")}`;
  }

  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl?.trim()) {
    return `https://${vercelUrl.replace(/\/+$/, "")}`;
  }

  return `http://127.0.0.1:${process.env.PORT ?? "3000"}`;
};

const getLocalApiUrl = (path: string): string => {
  const localPath = path.startsWith("/api/") ? path : `/api${path}`;
  const localBase = getLocalWebBaseUrl();
  return localBase ? `${localBase}${localPath}` : localPath;
};

const isProductionRuntime = (): boolean =>
  process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";

const getApiUrl = (path: string, options?: { requireConfiguredBaseUrl?: boolean }): string => {
  const base = getConfiguredApiBaseUrl();
  if (base) {
    return `${base}${path}`;
  }

  if (options?.requireConfiguredBaseUrl && isProductionRuntime()) {
    throw new Error(
      `Missing API base URL for ${path}. Set API_BASE_URL (and NEXT_PUBLIC_API_BASE_URL if client calls are needed).`,
    );
  }

  return getLocalApiUrl(path);
};

class ApiResponseError extends Error {}

const executeApiRequest = async <T>(
  url: string,
  init?: RequestInit & { allowNotFound?: boolean },
): Promise<T | null> => {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(await getOptionalProxyHeaders()),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (init?.allowNotFound && response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new ApiResponseError(payload.error ?? `API request failed for ${url}: ${response.status}`);
  }

  return (await response.json()) as T;
};

export const apiRequest = async <T>(
  path: string,
  init?: RequestInit & {
    allowNotFound?: boolean;
    fallbackToLocal?: boolean;
    requireConfiguredBaseUrl?: boolean;
  },
): Promise<T | null> => {
  const url = getApiUrl(path, { requireConfiguredBaseUrl: init?.requireConfiguredBaseUrl });

  try {
    return await executeApiRequest<T>(url, init);
  } catch (error) {
    const configuredBase = getConfiguredApiBaseUrl();
    const fallbackUrl = getLocalApiUrl(path);

    if (!init?.fallbackToLocal || !configuredBase || fallbackUrl === url || error instanceof ApiResponseError) {
      throw error;
    }

    console.warn(`apiRequest fallback for ${path}: retrying via local Next API route`, error);
    return executeApiRequest<T>(fallbackUrl, init);
  }
};

const readApiJson = async (
  path: string,
  options?: {
    allowNotFound?: boolean;
    method?: string;
    body?: unknown;
    headers?: HeadersInit;
    fallbackToLocal?: boolean;
    requireConfiguredBaseUrl?: boolean;
  },
) =>
  apiRequest(path, {
    method: options?.method ?? "GET",
    headers: options?.headers,
    body: options?.body ? JSON.stringify(options.body) : undefined,
    allowNotFound: options?.allowNotFound,
    fallbackToLocal: options?.fallbackToLocal,
    requireConfiguredBaseUrl: options?.requireConfiguredBaseUrl,
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
  const payload = await readApiJson("/admin/withdrawals");

  return WithdrawalRecordSchema.array().parse((payload as { withdrawals: unknown[] }).withdrawals);
};

export const executeAdminWithdrawal = async (withdrawalId: string, txHash: string) =>
  readApiJson(`/admin/withdrawals/${withdrawalId}/execute`, {
    method: "POST",
    body: { txHash },
  });

export const failAdminWithdrawal = async (withdrawalId: string, reason: string) =>
  readApiJson(`/admin/withdrawals/${withdrawalId}/fail`, {
    method: "POST",
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

export const getMlmDashboard = async () =>
  GetMlmDashboardResponseSchema.parse(await readApiJson("/mlm/dashboard"));

export const joinReferralProgram = async (code: string) =>
  GetMlmDashboardResponseSchema.parse(
    await readApiJson("/mlm/join", {
      method: "POST",
      body: { code },
    }),
  );

export const getAdminMlmOverview = async () =>
  GetAdminMlmOverviewResponseSchema.parse(await readApiJson("/admin/mlm"));

export const createAdminMlmPlan = async (input: {
  name: string;
  levels: { levelDepth: number; rateBps: number }[];
  activate: boolean;
}) =>
  ApiMlmCommissionPlanSchema.parse(
    await readApiJson("/admin/mlm/plans", {
      method: "POST",
      body: input,
    }),
  );

export const activateAdminMlmPlan = async (planId: string) =>
  readApiJson(`/admin/mlm/plans/${planId}`, {
    method: "POST",
  });

export const overrideAdminReferralSponsor = async (input: {
  referredUserId: string;
  sponsorCode: string;
  reason: string;
}) =>
  readApiJson("/admin/mlm/relationships/override", {
    method: "POST",
    body: input,
  });


export interface ExternalMarketApiOutcome {
  externalOutcomeId: string;
  title: string;
  slug: string;
  index: number;
  yesNo: "yes" | "no" | null;
  bestBid: number | null;
  bestAsk: number | null;
  lastPrice: number | null;
  volume: number | null;
}

export interface ExternalMarketApiTrade {
  externalTradeId: string;
  externalOutcomeId: string | null;
  side: "buy" | "sell" | null;
  price: number | null;
  size: number | null;
  tradedAt: string;
}

export interface ExternalMarketApiRecord {
  id: string;
  source: "polymarket" | "kalshi";
  externalId: string;
  slug: string;
  title: string;
  description: string;
  status: "open" | "closed" | "resolved" | "cancelled";
  marketUrl: string | null;
  closeTime: string | null;
  endTime: string | null;
  resolvedAt: string | null;
  bestBid: number | null;
  bestAsk: number | null;
  lastTradePrice: number | null;
  volume24h: number | null;
  volumeTotal: number | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
  outcomes: ExternalMarketApiOutcome[];
  recentTrades: ExternalMarketApiTrade[];
}

export const listExternalMarkets = async (): Promise<ExternalMarketApiRecord[]> => {
  const payload = await readApiJson("/external/markets", {
    requireConfiguredBaseUrl: true,
  });
  return Array.isArray(payload) ? (payload as ExternalMarketApiRecord[]) : [];
};
