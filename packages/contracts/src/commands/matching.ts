import { z } from "zod";

import { TimestampSchema, UuidSchema } from "../schemas/core";

export const OrderSubmittedForMatchingCommandSchema = z.object({
  type: z.literal("order.submitted_for_matching"),
  orderId: UuidSchema,
  marketId: UuidSchema,
  orderCreatedAt: TimestampSchema,
  enqueuedAt: TimestampSchema,
});

export type OrderSubmittedForMatchingCommand = z.infer<
  typeof OrderSubmittedForMatchingCommandSchema
>;
