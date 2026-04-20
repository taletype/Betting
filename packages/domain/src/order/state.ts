export const ORDER_STATES = [
  "pending",
  "open",
  "partially_filled",
  "filled",
  "cancelled",
  "rejected",
] as const;

export type OrderState = (typeof ORDER_STATES)[number];

export const ACTIVE_ORDER_STATES: ReadonlySet<OrderState> = new Set(["open", "partially_filled"]);
