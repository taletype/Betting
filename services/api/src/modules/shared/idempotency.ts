import { createHash } from "node:crypto";

import type { DatabaseTransaction } from "@bet/db";

interface IdempotencyRow {
  idempotency_key: string;
  request_hash: string;
  response_status: number;
  response_body: string;
  replay_count: number;
}

export interface IdempotentResponse {
  status: number;
  body: string;
  replayCount: number;
}

export interface IdempotencyReservation {
  isReplay: boolean;
  response?: IdempotentResponse;
}

const toStableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => toStableValue(entry));
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sortedEntries = Object.entries(record).sort(([left], [right]) => left.localeCompare(right));
    return Object.fromEntries(sortedEntries.map(([key, child]) => [key, toStableValue(child)]));
  }

  return value;
};

export const hashRequestPayload = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(toStableValue(value))).digest("hex");

export const reserveIdempotencyKey = async (
  transaction: DatabaseTransaction,
  input: {
    scope: string;
    key: string;
    requestHash: string;
  },
): Promise<IdempotencyReservation> => {
  const [existing] = await transaction.query<IdempotencyRow>(
    `
      select
        idempotency_key,
        request_hash,
        response_status,
        response_body,
        replay_count
      from public.idempotency_requests
      where scope = $1
        and idempotency_key = $2
      limit 1
      for update
    `,
    [input.scope, input.key],
  );

  if (!existing) {
    await transaction.query(
      `
        insert into public.idempotency_requests (
          scope,
          idempotency_key,
          request_hash,
          response_status,
          response_body,
          replay_count,
          created_at,
          updated_at
        )
        values (
          $1,
          $2,
          $3,
          0,
          '{}'::jsonb,
          0,
          now(),
          now()
        )
      `,
      [input.scope, input.key, input.requestHash],
    );

    return {
      isReplay: false,
    };
  }

  if (existing.request_hash !== input.requestHash) {
    throw new Error("idempotency key already used with a different request payload");
  }

  if (existing.response_status <= 0) {
    return {
      isReplay: false,
    };
  }

  return {
    isReplay: true,
    response: {
      status: existing.response_status,
      body: existing.response_body,
      replayCount: existing.replay_count + 1,
    },
  };
};

export const persistIdempotencyResponse = async (
  transaction: DatabaseTransaction,
  input: {
    scope: string;
    key: string;
    responseStatus: number;
    responseBody: string;
  },
): Promise<void> => {
  await transaction.query(
    `
      update public.idempotency_requests
      set
        response_status = $3,
        response_body = $4::jsonb,
        updated_at = now()
      where scope = $1
        and idempotency_key = $2
    `,
    [input.scope, input.key, input.responseStatus, input.responseBody],
  );
};

export const markIdempotencyReplay = async (
  transaction: DatabaseTransaction,
  input: {
    scope: string;
    key: string;
  },
): Promise<void> => {
  await transaction.query(
    `
      update public.idempotency_requests
      set
        replay_count = replay_count + 1,
        updated_at = now()
      where scope = $1
        and idempotency_key = $2
    `,
    [input.scope, input.key],
  );
};
