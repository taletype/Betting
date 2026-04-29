import { readOptionalBytes32Hex } from "@bet/config";

export const POLYMARKET_BUILDER_CODE_ENV = "POLY_BUILDER_CODE";

export class PolymarketBuilderConfigurationError extends Error {
  readonly code = "POLYMARKET_BUILDER_CODE_MISSING";

  constructor() {
    super(`${POLYMARKET_BUILDER_CODE_ENV} is required for external Polymarket order routing`);
    this.name = "PolymarketBuilderConfigurationError";
  }
}

export const getPolymarketBuilderCode = (): string | null =>
  readOptionalBytes32Hex(POLYMARKET_BUILDER_CODE_ENV);

export const assertPolymarketBuilderConfigured = (): string => {
  const builderCode = getPolymarketBuilderCode();

  if (!builderCode) {
    throw new PolymarketBuilderConfigurationError();
  }

  return builderCode;
};

export const attachBuilderCodeToOrder = <OrderInput extends Record<string, unknown>>(
  orderInput: OrderInput,
): OrderInput & { builderCode: string } => ({
  ...orderInput,
  builderCode: assertPolymarketBuilderConfigured(),
});
