import {
  ApiError,
  AssetType,
  Chain,
  ClobClient,
  OrderType,
  SignatureTypeV2,
  type ApiKeyCreds,
  createL2Headers,
  orderToJsonV2,
  type ClobClientOptions,
  type TickSize,
} from "@polymarket/clob-client-v2";
import { BuilderConfig, type BuilderApiKeyCreds, type BuilderHeaderPayload } from "@polymarket/builder-signing-sdk";

import type { ExternalPolymarketOrderRoutePayload, PolymarketOrderSubmitter } from "./handlers";

export interface PolymarketL2Credentials {
  key: string;
  secret: string;
  passphrase: string;
}

export interface PolymarketMarketConstraints {
  conditionId: string;
  tokenId: string;
  tickSize: TickSize;
  negRisk: boolean;
  minOrderSize: string;
}

export interface PolymarketOrderSubmitterResponse {
  success: boolean;
  orderId: string | null;
  status: string;
  error: string | null;
  transactionHashes: string[];
  takingAmount: string | null;
  makingAmount: string | null;
}

export interface PolymarketBalanceAllowanceCheck {
  balanceSufficient: boolean;
  allowanceSufficient: boolean;
  balance: string;
  allowance: string;
  required: string;
  assetType: "COLLATERAL" | "CONDITIONAL";
}

export class PolymarketSubmitterError extends Error {
  readonly status: number;
  readonly code: string;
  readonly safeMessage: string;

  constructor(status: number, code: string, safeMessage: string) {
    super(safeMessage);
    this.name = "PolymarketSubmitterError";
    this.status = status;
    this.code = code;
    this.safeMessage = safeMessage;
  }
}

const DEFAULT_CLOB_HOST = "https://clob.polymarket.com";

const toApiCreds = (credentials: PolymarketL2Credentials): ApiKeyCreds => ({
  key: credentials.key,
  secret: credentials.secret,
  passphrase: credentials.passphrase,
});

type ClobSigner = NonNullable<ClobClientOptions["signer"]>;

const createAddressOnlySigner = (address: string): ClobSigner => ({
  getAddress: async () => address,
  _signTypedData: async () => {
    throw new Error("server-side routed submitter must not sign user orders");
  },
});

const toOrderType = (orderType: ExternalPolymarketOrderRoutePayload["orderType"]): OrderType => {
  switch (orderType) {
    case "GTD":
      return OrderType.GTD;
    case "FOK":
      return OrderType.FOK;
    case "FAK":
      return OrderType.FAK;
    case "GTC":
    default:
      return OrderType.GTC;
  }
};

const getBuilderApiCreds = (): BuilderApiKeyCreds => {
  const key = process.env.POLY_BUILDER_API_KEY?.trim();
  const secret = process.env.POLY_BUILDER_SECRET?.trim();
  const passphrase = process.env.POLY_BUILDER_PASSPHRASE?.trim();
  if (!key || !secret || !passphrase) {
    throw new PolymarketSubmitterError(503, "POLYMARKET_BUILDER_AUTH_UNAVAILABLE", "Polymarket builder attribution is not configured");
  }
  return { key, secret, passphrase };
};

const createBuilderHeaders = async (method: string, path: string, body: string): Promise<BuilderHeaderPayload | null> => {
  const creds = getBuilderApiCreds();
  const config = new BuilderConfig({ localBuilderCreds: creds });
  const headers = await config.generateBuilderHeaders(method, path, body);
  if (!headers) {
    throw new PolymarketSubmitterError(503, "POLYMARKET_BUILDER_AUTH_UNAVAILABLE", "Polymarket builder attribution is not configured");
  }
  return headers;
};

const normalizeResponse = (response: unknown): PolymarketOrderSubmitterResponse => {
  if (!response || typeof response !== "object") {
    return {
      success: false,
      orderId: null,
      status: "unknown",
      error: "Polymarket returned an empty response",
      transactionHashes: [],
      takingAmount: null,
      makingAmount: null,
    };
  }

  const record = response as Record<string, unknown>;
  const error = typeof record.errorMsg === "string" && record.errorMsg ? record.errorMsg : null;
  return {
    success: record.success === true,
    orderId: typeof record.orderID === "string" ? record.orderID : typeof record.orderId === "string" ? record.orderId : null,
    status: typeof record.status === "string" ? record.status : record.success === true ? "submitted" : "unknown",
    error,
    transactionHashes: Array.isArray(record.transactionsHashes)
      ? record.transactionsHashes.filter((value): value is string => typeof value === "string")
      : [],
    takingAmount: typeof record.takingAmount === "string" ? record.takingAmount : null,
    makingAmount: typeof record.makingAmount === "string" ? record.makingAmount : null,
  };
};

const mapUnknownSubmitterError = (error: unknown): PolymarketSubmitterError => {
  if (error instanceof PolymarketSubmitterError) return error;
  if (error instanceof ApiError) {
    const status = error.status && error.status >= 400 && error.status < 600 ? error.status : 502;
    return new PolymarketSubmitterError(status, "POLYMARKET_UPSTREAM_ERROR", "Polymarket rejected the routed order");
  }
  return new PolymarketSubmitterError(502, "POLYMARKET_UPSTREAM_ERROR", "Polymarket order submission failed");
};

export class DisabledPolymarketClobClientV2Submitter implements PolymarketOrderSubmitter {
  readonly mode = "disabled" as const;

  async healthCheck(): Promise<{ ok: boolean; reason: string }> {
    return { ok: false, reason: "disabled" };
  }

  async getMarketConstraints(): Promise<PolymarketMarketConstraints> {
    throw new PolymarketSubmitterError(503, "POLYMARKET_SUBMITTER_UNAVAILABLE", "Polymarket submitter unavailable");
  }

  async submitOrder(): Promise<PolymarketOrderSubmitterResponse> {
    throw new PolymarketSubmitterError(503, "POLYMARKET_SUBMITTER_UNAVAILABLE", "Polymarket submitter unavailable");
  }
}

export class PolymarketClobClientV2Submitter implements PolymarketOrderSubmitter {
  readonly mode = "real" as const;
  private readonly host: string;
  private readonly chain: Chain;

  constructor(input: { host?: string; chain?: Chain } = {}) {
    this.host = input.host ?? DEFAULT_CLOB_HOST;
    this.chain = input.chain ?? Chain.POLYGON;
  }

  private createPublicClient(): ClobClient {
    return new ClobClient({
      host: this.host,
      chain: this.chain,
      throwOnError: true,
    });
  }

  private createAuthenticatedClient(payload: ExternalPolymarketOrderRoutePayload): ClobClient {
    return new ClobClient({
      host: this.host,
      chain: this.chain,
      signer: createAddressOnlySigner(payload.linkedWalletAddress),
      creds: toApiCreds(payload.l2Credentials),
      builderConfig: { builderCode: payload.orderInput.builderCode },
      signatureType: payload.signedOrder.signatureType as SignatureTypeV2,
      funderAddress: payload.signedOrder.maker,
      useServerTime: true,
      throwOnError: true,
    });
  }

  async checkBalanceAllowance(payload: ExternalPolymarketOrderRoutePayload): Promise<PolymarketBalanceAllowanceCheck> {
    const client = this.createAuthenticatedClient(payload);
    const assetType = payload.userConfirmation.side === "BUY" ? AssetType.COLLATERAL : AssetType.CONDITIONAL;
    const response = await client.getBalanceAllowance({
      asset_type: assetType,
      ...(assetType === AssetType.CONDITIONAL ? { token_id: payload.userConfirmation.tokenID } : {}),
    });
    const required = payload.userConfirmation.side === "BUY"
      ? BigInt(Math.ceil(payload.userConfirmation.price * (payload.userConfirmation.size ?? payload.userConfirmation.amount ?? 0) * 1_000_000))
      : BigInt(Math.ceil((payload.userConfirmation.size ?? payload.userConfirmation.amount ?? 0) * 1_000_000));
    const balance = BigInt(response.balance || "0");
    const allowance = BigInt(response.allowance || "0");
    return {
      balanceSufficient: balance >= required,
      allowanceSufficient: allowance >= required,
      balance: response.balance,
      allowance: response.allowance,
      required: required.toString(),
      assetType,
    };
  }

  async healthCheck(): Promise<{ ok: boolean; reason?: string }> {
    try {
      await this.createPublicClient().getOk();
      return { ok: true };
    } catch {
      return { ok: false, reason: "clob_unreachable" };
    }
  }

  async getMarketConstraints(conditionId: string, tokenId: string): Promise<PolymarketMarketConstraints> {
    try {
      const client = this.createPublicClient();
      const [marketInfo, orderBook] = await Promise.all([
        client.getClobMarketInfo(conditionId),
        client.getOrderBook(tokenId),
      ]);

      return {
        conditionId,
        tokenId,
        tickSize: orderBook.tick_size as TickSize,
        negRisk: marketInfo.nr,
        minOrderSize: orderBook.min_order_size,
      };
    } catch (error) {
      throw mapUnknownSubmitterError(error);
    }
  }

  async submitOrder(payload: ExternalPolymarketOrderRoutePayload): Promise<PolymarketOrderSubmitterResponse> {
    if (payload.orderInput.builderCode !== payload.signedOrder.builder) {
      throw new PolymarketSubmitterError(
        400,
        "POLYMARKET_BUILDER_CODE_NOT_SIGNED",
        "builderCode must match the signed Polymarket order",
      );
    }

    try {
      const orderType = toOrderType(payload.orderType);
      const orderPayload = orderToJsonV2(payload.signedOrder as unknown as Parameters<typeof orderToJsonV2>[0], payload.l2Credentials.key, orderType);
      const body = JSON.stringify(orderPayload);
      const l2Headers = await createL2Headers(
        createAddressOnlySigner(payload.linkedWalletAddress),
        toApiCreds(payload.l2Credentials),
        { method: "POST", requestPath: "/order", body },
      );
      const builderHeaders = await createBuilderHeaders("POST", "/order", body);
      const response = await fetch(`${this.host}/order`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...Object.fromEntries(Object.entries(l2Headers).map(([key, value]) => [key, String(value)])),
          ...(builderHeaders ?? {}),
        },
        body,
      });
      const responsePayload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new PolymarketSubmitterError(response.status, "POLYMARKET_UPSTREAM_ERROR", "Polymarket rejected the routed order");
      }
      return normalizeResponse(responsePayload);
    } catch (error) {
      throw mapUnknownSubmitterError(error);
    }
  }
}

export const createPolymarketOrderSubmitterFromEnv = (): PolymarketOrderSubmitter => {
  if (process.env.POLYMARKET_CLOB_SUBMITTER !== "real") {
    return new DisabledPolymarketClobClientV2Submitter();
  }

  return new PolymarketClobClientV2Submitter({
    host: process.env.POLYMARKET_CLOB_URL || DEFAULT_CLOB_HOST,
  });
};
