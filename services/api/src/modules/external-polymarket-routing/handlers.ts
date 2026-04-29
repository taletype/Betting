import { readBooleanFlag } from "@bet/config";
import {
  attachBuilderCodeToOrder,
  getPolymarketBuilderCode,
  PolymarketBuilderConfigurationError,
} from "@bet/integrations";
import { incrementCounter, logger } from "@bet/observability";

export type PolymarketL2CredentialStatus = "present" | "missing";

export interface ExternalPolymarketUserAuthBoundary {
  userWalletAddress: string;
  l2CredentialStatus: PolymarketL2CredentialStatus;
}

export interface ExternalPolymarketOrderSubmissionInput {
  signedOrder: Record<string, unknown>;
  orderType: string | null;
}

export interface ExternalPolymarketOrderRouteInput {
  userWalletAddress?: unknown;
  orderInput?: unknown;
  signedOrder?: unknown;
  orderType?: unknown;
  l2CredentialStatus?: unknown;
}

export interface ExternalPolymarketOrderRoutePayload {
  userWalletAddress: string;
  l2CredentialStatus: PolymarketL2CredentialStatus;
  orderInput: Record<string, unknown> & { builderCode: string };
  signedOrder: Record<string, unknown>;
  orderType: string | null;
}

export interface ExternalPolymarketOrderRouteResult {
  status: "submitted";
  attribution: {
    builderCodeAttached: true;
    builderCode: string;
  };
  upstream: unknown;
}

export interface PolymarketOrderSubmitter {
  submitOrder(payload: ExternalPolymarketOrderRoutePayload): Promise<unknown>;
}

export interface ExternalPolymarketOrderRouteDependencies {
  submitter?: PolymarketOrderSubmitter;
}

export class ExternalPolymarketRoutingError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ExternalPolymarketRoutingError";
    this.status = status;
    this.code = code;
  }
}

const toObject = (value: unknown, label: string): Record<string, unknown> => {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  throw new ExternalPolymarketRoutingError(400, "POLYMARKET_INVALID_PAYLOAD", `${label} must be an object`);
};

const toTrimmedString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new ExternalPolymarketRoutingError(400, "POLYMARKET_INVALID_PAYLOAD", `${label} must be a non-empty string`);
  }
  return value.trim();
};

const isExternalPolymarketRoutingEnabled = (): boolean =>
  readBooleanFlag("POLYMARKET_ROUTED_TRADING_ENABLED", { defaultValue: false });

export const getExternalPolymarketRoutingReadiness = () => ({
  builderCodeConfigured: getPolymarketBuilderCode() !== null,
  routedTradingEnabled: isExternalPolymarketRoutingEnabled(),
});

export const prepareExternalPolymarketOrderRoutePayload = (
  input: ExternalPolymarketOrderRouteInput,
): ExternalPolymarketOrderRoutePayload => {
  const userWalletAddress = toTrimmedString(input.userWalletAddress, "userWalletAddress");

  if (input.l2CredentialStatus !== "present") {
    throw new ExternalPolymarketRoutingError(
      400,
      "POLYMARKET_CREDENTIALS_MISSING",
      "Polymarket credentials required",
    );
  }

  if (input.signedOrder === undefined) {
    throw new ExternalPolymarketRoutingError(400, "POLYMARKET_USER_SIGNING_MISSING", "user-signed order is required");
  }

  const signedOrder = toObject(input.signedOrder, "signedOrder");
  const orderInput = toObject(input.orderInput, "orderInput");
  const attributedOrderInput = attachBuilderCodeToOrder(orderInput);

  return {
    userWalletAddress,
    l2CredentialStatus: "present",
    signedOrder,
    orderInput: attributedOrderInput,
    orderType: typeof input.orderType === "string" && input.orderType.trim() ? input.orderType.trim() : null,
  };
};

export const routeExternalPolymarketOrder = async (
  input: ExternalPolymarketOrderRouteInput,
  dependencies: ExternalPolymarketOrderRouteDependencies = {},
): Promise<ExternalPolymarketOrderRouteResult> => {
  try {
    const readiness = getExternalPolymarketRoutingReadiness();
    if (!readiness.builderCodeConfigured) throw new PolymarketBuilderConfigurationError();
    if (!readiness.routedTradingEnabled) {
      throw new ExternalPolymarketRoutingError(503, "POLYMARKET_ROUTED_TRADING_DISABLED", "external Polymarket routed trading is disabled");
    }

    if (!dependencies.submitter) {
      throw new ExternalPolymarketRoutingError(503, "POLYMARKET_SUBMITTER_UNAVAILABLE", "Polymarket submitter unavailable");
    }

    const payload = prepareExternalPolymarketOrderRoutePayload(input);
    const upstream = await dependencies.submitter.submitOrder(payload);

    incrementCounter("polymarket_builder_order_attribution_total", { status: "submitted" });
    return {
      status: "submitted",
      attribution: { builderCodeAttached: true, builderCode: payload.orderInput.builderCode },
      upstream,
    };
  } catch (error) {
    logger.error("polymarket_builder.order_attribution_failed", {
      code: error instanceof Error && "code" in error ? String((error as { code: string }).code) : "POLYMARKET_ORDER_ATTRIBUTION_FAILED",
    });
    throw error;
  }
};

export const mapExternalPolymarketRoutingError = (error: unknown): { status: number; payload: { error: string; code: string } } => {
  if (error instanceof PolymarketBuilderConfigurationError) {
    return { status: 503, payload: { error: "external Polymarket routed trading is disabled because POLY_BUILDER_CODE is not configured", code: error.code } };
  }
  if (error instanceof ExternalPolymarketRoutingError) {
    return { status: error.status, payload: { error: error.message, code: error.code } };
  }
  return { status: 500, payload: { error: "external Polymarket order routing failed", code: "POLYMARKET_ORDER_ATTRIBUTION_FAILED" } };
};
