import { z } from "zod";

import { ClaimSchema, OrderSchema, PositionSchema } from "../schemas/core";

export const PrivateOrderUpdatedEventSchema = z.object({
  type: z.literal("private.order.updated"),
  order: OrderSchema,
  sequence: z.bigint(),
});

export const PrivatePositionUpdatedEventSchema = z.object({
  type: z.literal("private.position.updated"),
  position: PositionSchema,
  sequence: z.bigint(),
});

export const PrivateClaimUpdatedEventSchema = z.object({
  type: z.literal("private.claim.updated"),
  claim: ClaimSchema,
  sequence: z.bigint(),
});

export const PrivateBalanceUpdatedEventSchema = z.object({
  type: z.literal("private.balance.updated"),
  currency: z.string(),
  available: z.bigint(),
  reserved: z.bigint(),
  sequence: z.bigint(),
});

export const PrivateWebsocketEventSchema = z.discriminatedUnion("type", [
  PrivateOrderUpdatedEventSchema,
  PrivatePositionUpdatedEventSchema,
  PrivateClaimUpdatedEventSchema,
  PrivateBalanceUpdatedEventSchema,
]);

export type PrivateWebsocketEvent = z.infer<typeof PrivateWebsocketEventSchema>;
