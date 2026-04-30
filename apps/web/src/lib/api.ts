import {
  MarketSnapshotSchema,
  MarketTradesSchema,
  OrderBookSchema,
  PortfolioSnapshotSchema,
  WithdrawalRecordSchema,
  GetAmbassadorDashboardResponseSchema,
  GetAdminAmbassadorOverviewResponseSchema,
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

const getServerSupabaseAccessToken = async (): Promise<string | null> => {
  if (typeof window !== "undefined") {
    return null;
  }

  try {
    const [{ cookies }, { createSupabaseServerClient }] = await Promise.all([
      import("next/headers"),
      import("@bet/supabase"),
    ]);
    const cookieStore = await cookies();
    const supabase = createSupabaseServerClient({
      get: (name) => cookieStore.get(name)?.value,
    });
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
};

const getOptionalProxyHeaders = async (): Promise<HeadersInit> => {
  const cookieHeader = await getServerCookieHeader();
  const accessToken = await getServerSupabaseAccessToken();

  const headers: Record<string, string> = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
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

const getPublicRouteUrl = (path: string): string => {
  const base = getConfiguredApiBaseUrl();
  if (base && !hasUnreachableProductionApiBaseUrl()) {
    return `${base}${path}`;
  }

  const localBase = getLocalWebBaseUrl();
  const localPath = path.startsWith("/api/") ? path : `/api${path}`;
  return localBase ? `${localBase}${localPath}` : localPath;
};

const isProductionRuntime = (): boolean =>
  process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";

const isLocalhostApiBaseUrl = (base: string): boolean => {
  try {
    const url = new URL(base);
    return ["localhost", "127.0.0.1", "0.0.0.0"].includes(url.hostname);
  } catch {
    return /\b(localhost|127\.0\.0\.1|0\.0\.0\.0)\b/i.test(base);
  }
};

let warnedAboutProductionLocalApiBase = false;

const hasUnreachableProductionApiBaseUrl = (): boolean => {
  const base = getConfiguredApiBaseUrl();
  if (!base || !isProductionRuntime() || !isLocalhostApiBaseUrl(base)) {
    return false;
  }

  if (typeof window === "undefined" && !warnedAboutProductionLocalApiBase) {
    warnedAboutProductionLocalApiBase = true;
    console.warn(
      "Ignoring configured API base for public market reads: localhost-style API base is unreachable in production. Check Vercel API_BASE_URL / NEXT_PUBLIC_API_BASE_URL.",
    );
  }

  return true;
};

const getApiRequestTimeoutMs = (): number => {
  const parsed = Number(process.env.NEXT_PUBLIC_API_REQUEST_TIMEOUT_MS ?? process.env.API_REQUEST_TIMEOUT_MS ?? 4_500);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 4_500;
};

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

class ApiResponseError extends Error {
  readonly status: number;
  readonly url: string;
  readonly code: string | null;

  constructor(input: { message: string; status: number; url: string; code?: string | null }) {
    super(input.message);
    this.name = "ApiResponseError";
    this.status = input.status;
    this.url = input.url;
    this.code = input.code ?? null;
  }
}

export type ExternalMarketsLoadErrorCode =
  | "missing_api_base_url"
  | "configured_api_base_unreachable"
  | "api_unreachable"
  | "backend_500"
  | "external_markets_not_implemented"
  | "supabase_env_missing"
  | "unknown";

export class ExternalMarketsLoadError extends Error {
  readonly diagnostics: ExternalMarketsLoadErrorCode[];

  constructor(message: string, diagnostics: ExternalMarketsLoadErrorCode[]) {
    super(message);
    this.name = "ExternalMarketsLoadError";
    this.diagnostics = [...new Set(diagnostics)];
  }
}

const executeApiRequest = async <T>(
  url: string,
  init?: RequestInit & { allowNotFound?: boolean },
): Promise<T | null> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getApiRequestTimeoutMs());

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(await getOptionalProxyHeaders()),
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
      signal: init?.signal ?? controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (init?.allowNotFound && response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { code?: string; error?: string };
    throw new ApiResponseError({
      message: payload.error ?? `API request failed for ${url}: ${response.status}`,
      status: response.status,
      url,
      code: payload.code ?? null,
    });
  }

  return (await response.json()) as T;
};

const shouldRetryViaLocalRoute = (error: unknown): boolean => {
  if (error instanceof ApiResponseError) {
    return error.status >= 500;
  }

  return (
    error instanceof Error &&
    (error.name === "AbortError" || /ECONNREFUSED|ENOTFOUND|fetch failed|network|aborted/i.test(error.message))
  );
};

const executePublicRouteRequest = async <T>(
  path: string,
  init?: RequestInit & { allowNotFound?: boolean },
): Promise<T | null> => {
  const primaryUrl = getPublicRouteUrl(path);

  try {
    return await executeApiRequest<T>(primaryUrl, init);
  } catch (error) {
    const fallbackUrl = getLocalApiUrl(path);
    if (!getConfiguredApiBaseUrl() || fallbackUrl === primaryUrl || !shouldRetryViaLocalRoute(error)) {
      throw error;
    }

    console.warn(`public API fallback for ${path}: retrying via same-site Next API route`, error);
    return executeApiRequest<T>(fallbackUrl, init);
  }
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

    if (!init?.fallbackToLocal || !configuredBase || fallbackUrl === url || !shouldRetryViaLocalRoute(error)) {
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

export const getAmbassadorDashboard = async () =>
  GetAmbassadorDashboardResponseSchema.parse(await readApiJson("/ambassador/dashboard"));

export const captureAmbassadorReferral = async (code: string) =>
  GetAmbassadorDashboardResponseSchema.parse(
    await readApiJson("/ambassador/capture", {
      method: "POST",
      body: { code },
    }),
  );

export const getAdminAmbassadorOverview = async () =>
  GetAdminAmbassadorOverviewResponseSchema.parse(await readApiJson("/admin/ambassador"));

export const overrideAdminReferralAttribution = async (input: {
  referredUserId: string;
  ambassadorCode: string;
  reason: string;
}) =>
  readApiJson("/admin/ambassador/referral-attributions/override", {
    method: "POST",
    body: input,
  });

export const recordAdminMockBuilderTradeAttribution = async (input: {
  userId: string;
  notionalUsdcAtoms: string;
  builderFeeUsdcAtoms: string;
  status: "pending" | "confirmed" | "void";
  conditionId?: string | null;
  marketSlug?: string | null;
  polymarketOrderId?: string | null;
  polymarketTradeId?: string | null;
}) =>
  readApiJson("/admin/ambassador/trade-attributions/mock", {
    method: "POST",
    body: input,
  });

export const createAdminAmbassadorCode = async (input: { ownerUserId: string; code?: string | null }) =>
  readApiJson("/admin/ambassador/codes", {
    method: "POST",
    body: input,
  });

export const disableAdminAmbassadorCode = async (codeId: string, reason: string) =>
  readApiJson(`/admin/ambassador/codes/${codeId}/disable`, {
    method: "POST",
    body: { reason },
  });

export const markAdminRewardsPayable = async (tradeAttributionId: string) =>
  readApiJson(`/admin/ambassador/trade-attributions/${tradeAttributionId}/payable`, {
    method: "POST",
  });

export const voidAdminTradeAttributionRewards = async (tradeAttributionId: string, reason: string) =>
  readApiJson(`/admin/ambassador/trade-attributions/${tradeAttributionId}/void`, {
    method: "POST",
    body: { reason },
  });

export const requestAmbassadorPayout = async (input: { destinationType: "wallet" | "manual"; destinationValue: string }) =>
  readApiJson("/ambassador/payouts", {
    method: "POST",
    body: input,
  });

export const approveAdminRewardPayout = async (payoutId: string, notes?: string | null) =>
  readApiJson(`/admin/ambassador/payouts/${payoutId}/approve`, {
    method: "POST",
    body: { notes },
  });

export const markAdminRewardPayoutPaid = async (payoutId: string, input: { txHash?: string | null; notes?: string | null }) =>
  readApiJson(`/admin/ambassador/payouts/${payoutId}/paid`, {
    method: "POST",
    body: input,
  });

export const failAdminRewardPayout = async (payoutId: string, notes: string) =>
  readApiJson(`/admin/ambassador/payouts/${payoutId}/failed`, {
    method: "POST",
    body: { notes },
  });

export const cancelAdminRewardPayout = async (payoutId: string, notes: string) =>
  readApiJson(`/admin/ambassador/payouts/${payoutId}/cancelled`, {
    method: "POST",
    body: { notes },
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

export interface ExternalMarketApiOrderbookSnapshot {
  externalOutcomeId: string;
  bids: unknown;
  asks: unknown;
  capturedAt: string;
  lastTradePrice: number | null;
  bestBid: number | null;
  bestAsk: number | null;
}

export interface ExternalMarketApiHistoryPoint {
  timestamp: string;
  outcome: string | null;
  price: number | null;
  volume: number | null;
  liquidity: number | null;
  source: "polymarket" | "kalshi";
  provenance?: unknown;
}

export interface ExternalMarketApiDepthPoint {
  side: "bid" | "ask";
  price: number | null;
  size: number | null;
  cumulativeSize: number | null;
}

export interface ExternalMarketApiStats {
  source: string;
  externalId: string;
  volume24h: number | null;
  liquidity: number | null;
  spread: number | null;
  closeTime: string | null;
  lastUpdatedAt: string | null;
  stale: boolean;
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
  liquidity?: number | null;
  provenance?: unknown;
  sourceProvenance?: unknown;
  lastSyncedAt: string | null;
  lastUpdatedAt?: string;
  createdAt: string;
  updatedAt: string;
  outcomes: ExternalMarketApiOutcome[];
  recentTrades: ExternalMarketApiTrade[];
  latestOrderbook?: ExternalMarketApiOrderbookSnapshot[];
}

export const listExternalMarkets = async (): Promise<ExternalMarketApiRecord[]> => {
  const diagnostics: ExternalMarketsLoadErrorCode[] = [];
  if (!getConfiguredApiBaseUrl()) {
    diagnostics.push("missing_api_base_url");
  }
  if (hasUnreachableProductionApiBaseUrl()) {
    throw new ExternalMarketsLoadError(
      "Configured API base is unreachable in production",
      ["configured_api_base_unreachable"],
    );
  }

  try {
    const payload = await executePublicRouteRequest<unknown>("/external/markets");
    return Array.isArray(payload) ? (payload as ExternalMarketApiRecord[]) : [];
  } catch (error) {
    if (error instanceof ApiResponseError) {
      if (error.status === 404) {
        diagnostics.push("external_markets_not_implemented");
      } else if (error.status >= 500) {
        diagnostics.push("backend_500");
      }

      if (error.code === "SUPABASE_ENV_MISSING" || /SUPABASE_/.test(error.message)) {
        diagnostics.push("supabase_env_missing");
      }
    } else if (
      error instanceof Error &&
      (error.name === "AbortError" || /ECONNREFUSED|ENOTFOUND|fetch failed|network|aborted/i.test(error.message))
    ) {
      diagnostics.push("api_unreachable");
    }

    if (diagnostics.length === 0) {
      diagnostics.push("unknown");
    }

    throw new ExternalMarketsLoadError(
      error instanceof Error ? error.message : "Unable to load external markets",
      diagnostics,
    );
  }
};

export const getExternalMarket = async (
  source: string,
  externalId: string,
): Promise<ExternalMarketApiRecord | null> => {
  const payload = await executePublicRouteRequest<{ market: ExternalMarketApiRecord | null }>(
    `/external/markets/${encodeURIComponent(source)}/${encodeURIComponent(externalId)}`,
    { allowNotFound: true },
  );

  return payload?.market ?? null;
};

export const getExternalMarketOrderbook = async (
  source: string,
  externalId: string,
): Promise<{ orderbook: ExternalMarketApiOrderbookSnapshot[]; depth: ExternalMarketApiDepthPoint[] }> => {
  const payload = await executePublicRouteRequest<{ orderbook: ExternalMarketApiOrderbookSnapshot[]; depth?: ExternalMarketApiDepthPoint[] }>(
    `/external/markets/${encodeURIComponent(source)}/${encodeURIComponent(externalId)}/orderbook`,
    { allowNotFound: true },
  );

  return { orderbook: payload?.orderbook ?? [], depth: payload?.depth ?? [] };
};

export const getExternalMarketTrades = async (
  source: string,
  externalId: string,
): Promise<ExternalMarketApiTrade[]> => {
  const payload = await executePublicRouteRequest<{ trades: ExternalMarketApiTrade[] }>(
    `/external/markets/${encodeURIComponent(source)}/${encodeURIComponent(externalId)}/trades`,
    { allowNotFound: true },
  );

  return payload?.trades ?? [];
};

export const getExternalMarketHistory = async (
  source: string,
  externalId: string,
): Promise<ExternalMarketApiHistoryPoint[]> => {
  const payload = await executePublicRouteRequest<{ history: ExternalMarketApiHistoryPoint[] }>(
    `/external/markets/${encodeURIComponent(source)}/${encodeURIComponent(externalId)}/history`,
    { allowNotFound: true },
  );

  return payload?.history ?? [];
};

export const getExternalMarketStats = async (
  source: string,
  externalId: string,
): Promise<ExternalMarketApiStats | null> =>
  executePublicRouteRequest<ExternalMarketApiStats>(
    `/external/markets/${encodeURIComponent(source)}/${encodeURIComponent(externalId)}/stats`,
    { allowNotFound: true },
  );
