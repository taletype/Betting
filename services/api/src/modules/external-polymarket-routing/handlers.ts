import { readBooleanFlag } from "@bet/config";
import {
  attachBuilderCodeToOrder,
  getPolymarketBuilderCode,
  PolymarketBuilderConfigurationError,
} from "@bet/integrations";
import { incrementCounter, logger } from "@bet/observability";

export interface ExternalPolymarketOrderRouteInput {
  orderInput?: unknown;
  signedOrder?: unknown;
  orderType?: unknown;
}

export interface ExternalPolymarketOrderRoutePayload {
  orderInput: Record<string, unknown> & { builderCode: string };
  orderType: string | null;
}

export interface ExternalPolymarketOrderRouteResult {
  status: "submitted";
  attribution: {
    builderCodeAttached: true;
  };
  upstream: unknown;
}

export interface ExternalPolymarketOrderRouteDependencies {
  submitOrder?: (payload: ExternalPolymarketOrderRoutePayload) => Promise<unknown>;
}

export class ExternalPolymarketRoutingDisabledError extends Error {
  readonly status = 503;
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ExternalPolymarketRoutingDisabledError";
    this.code = code;
  }
}

export class ExternalPolymarketRoutingNotImplementedError extends Error {
  readonly status = 501;
  readonly code = "POLYMARKET_USER_SIGNING_NOT_WIRED";

  constructor() {
    super("external Polymarket order routing is scaffolded, but user signing/API credential flow is not wired");
    this.name = "ExternalPolymarketRoutingNotImplementedError";
  }
}

const toObject = (value: unknown, label: string): Record<string, unknown> => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  throw new ExternalPolymarketRoutingDisabledError(
    "POLYMARKET_ORDER_INPUT_REQUIRED",
    `${label} must be an object`,
  );
};

const isExternalPolymarketRoutingEnabled = (): boolean =>
  readBooleanFlag("POLYMARKET_ROUTED_TRADING_ENABLED", { defaultValue: false });

export const getExternalPolymarketRoutingReadiness = () => {
  const builderCode = getPolymarketBuilderCode();
  const builderCodeConfigured = builderCode !== null;
  const routedTradingEnabled = isExternalPolymarketRoutingEnabled();

  logger.info("polymarket_builder.configuration_checked", {
    builderCodeConfigured,
    routedTradingEnabled,
  });

  return {
    builderCodeConfigured,
    routedTradingEnabled,
  };
};

export const prepareExternalPolymarketOrderRoutePayload = (
  input: ExternalPolymarketOrderRouteInput,
): ExternalPolymarketOrderRoutePayload => {
  if (input.signedOrder !== undefined) {
    throw new ExternalPolymarketRoutingNotImplementedError();
  }

  const orderInput = toObject(input.orderInput, "orderInput");

  return {
    orderInput: attachBuilderCodeToOrder(orderInput),
    orderType: typeof input.orderType === "string" && input.orderType.trim() ? input.orderType.trim() : null,
  };
};

export const routeExternalPolymarketOrder = async (
  input: ExternalPolymarketOrderRouteInput,
  dependencies: ExternalPolymarketOrderRouteDependencies = {},
): Promise<ExternalPolymarketOrderRouteResult> => {
  try {
    const readiness = getExternalPolymarketRoutingReadiness();

    if (!readiness.builderCodeConfigured) {
      incrementCounter("polymarket_builder_order_attribution_total", {
        status: "missing_builder_code",
      });
      throw new PolymarketBuilderConfigurationError();
    }

    if (!readiness.routedTradingEnabled) {
      incrementCounter("polymarket_builder_order_attribution_total", {
        status: "routing_disabled",
      });
      throw new ExternalPolymarketRoutingDisabledError(
        "POLYMARKET_ROUTED_TRADING_DISABLED",
        "external Polymarket routed trading is disabled",
      );
    }

    logger.info("polymarket_builder.order_attribution_attempted", {
      orderType: typeof input.orderType === "string" ? input.orderType : "unspecified",
    });
    incrementCounter("polymarket_builder_order_attribution_total", { status: "attempted" });

    const payload = prepareExternalPolymarketOrderRoutePayload(input);

    if (!dependencies.submitOrder) {
      // TODO: Wire a user-owned Polymarket signer/API credential handoff before enabling submission.
      throw new ExternalPolymarketRoutingNotImplementedError();
    }

    const upstream = await dependencies.submitOrder(payload);

    logger.info("polymarket_builder.order_attribution_submitted", {
      orderType: payload.orderType ?? "unspecified",
    });
    incrementCounter("polymarket_builder_order_attribution_total", { status: "submitted" });

    return {
      status: "submitted",
      attribution: {
        builderCodeAttached: true,
      },
      upstream,
    };
  } catch (error) {
    const code = error instanceof PolymarketBuilderConfigurationError
      ? error.code
      : error instanceof ExternalPolymarketRoutingDisabledError
        ? error.code
        : error instanceof ExternalPolymarketRoutingNotImplementedError
          ? error.code
          : "POLYMARKET_ORDER_ATTRIBUTION_FAILED";

    logger.error("polymarket_builder.order_attribution_failed", {
      code,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    incrementCounter("polymarket_builder_order_attribution_total", { status: "failed" });
    throw error;
  }
};

export const mapExternalPolymarketRoutingError = (
  error: unknown,
): { status: number; payload: { error: string; code: string } } => {
  if (error instanceof PolymarketBuilderConfigurationError) {
    return {
      status: 503,
      payload: {
        error: "external Polymarket routed trading is disabled because POLY_BUILDER_CODE is not configured",
        code: error.code,
      },
    };
  }

  if (
    error instanceof ExternalPolymarketRoutingDisabledError ||
    error instanceof ExternalPolymarketRoutingNotImplementedError
  ) {
    return {
      status: error.status,
      payload: {
        error: error.message,
        code: error.code,
      },
    };
  }

  return {
    status: 500,
    payload: {
      error: "external Polymarket order routing failed",
      code: "POLYMARKET_ORDER_ATTRIBUTION_FAILED",
    },
  };
};
