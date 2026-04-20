import type { OrderState } from "./state";
import { ACTIVE_ORDER_STATES } from "./state";
import { assertNonNegative, assertPositive } from "../trade/money";
import { invariant } from "../errors/invariant";

import type { PriceTicks, QuantityAtoms, ReservedAmountAtoms } from "../trade/money";

export const assertOrderCanReserve = (orderState: OrderState): void => {
  invariant(orderState === "open", "order must be open to reserve");
};

export const assertOrderCanCancel = (orderState: OrderState): void => {
  invariant(ACTIVE_ORDER_STATES.has(orderState), "order must be open or partially_filled to cancel");
};

export const assertCancelReleaseWithinReserved = (
  releaseAmount: ReservedAmountAtoms,
  remainingReservedAmount: ReservedAmountAtoms,
): void => {
  assertNonNegative(releaseAmount, "release amount");
  assertNonNegative(remainingReservedAmount, "remaining reserved amount");
  invariant(
    releaseAmount <= remainingReservedAmount,
    "cancel cannot release more than remaining reserved amount",
  );
};

export const assertValidLimitOrderInputs = (
  price: PriceTicks,
  quantity: QuantityAtoms,
): void => {
  assertPositive(price, "price");
  assertPositive(quantity, "quantity");
};
