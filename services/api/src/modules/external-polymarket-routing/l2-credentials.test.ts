import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import type { DatabaseExecutor } from "@bet/db";

import {
  lookupUserPolymarketL2Credentials,
  storeUserPolymarketL2Credentials,
} from "./l2-credentials";

const userId = "11111111-1111-4111-8111-111111111111";
const otherUserId = "22222222-2222-4222-8222-222222222222";
const walletAddress = "0x1111111111111111111111111111111111111111";
const otherWalletAddress = "0x2222222222222222222222222222222222222222";
const credentials = {
  key: "user-owned-key",
  secret: "user-owned-secret",
  passphrase: "user-owned-passphrase",
};

const withEncryptionKey = async (run: () => Promise<void>) => {
  const previous = process.env.POLYMARKET_L2_CREDENTIAL_ENCRYPTION_KEY;
  process.env.POLYMARKET_L2_CREDENTIAL_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  try {
    await run();
  } finally {
    if (previous === undefined) delete process.env.POLYMARKET_L2_CREDENTIAL_ENCRYPTION_KEY;
    else process.env.POLYMARKET_L2_CREDENTIAL_ENCRYPTION_KEY = previous;
  }
};

test("L2 credential storage encrypts secrets and lookup is scoped to user and wallet", async () => {
  await withEncryptionKey(async () => {
    let encryptedPayload: unknown = null;
    const queries: string[] = [];
    const executor = {
      query: async <T>(statement: string, params?: unknown[]) => {
        queries.push(statement);
        if (/insert into public\.polymarket_l2_credentials/.test(statement)) {
          encryptedPayload = JSON.parse(String(params?.[2] ?? "{}"));
          return [] as T[];
        }
        if (/select encrypted_credentials/.test(statement)) {
          assert.match(statement, /where user_id = \$1::uuid/);
          assert.match(statement, /lower\(wallet_address\) = lower\(\$2\)/);
          assert.match(statement, /status = 'active'/);
          if (params?.[0] === userId && params?.[1] === walletAddress) {
            return [{ encrypted_credentials: encryptedPayload }] as T[];
          }
          return [] as T[];
        }
        return [] as T[];
      },
    } satisfies DatabaseExecutor;

    await storeUserPolymarketL2Credentials({
      userId,
      walletAddress,
      credentials,
      executor,
    });

    const serializedEncryptedPayload = JSON.stringify(encryptedPayload);
    assert.doesNotMatch(serializedEncryptedPayload, /user-owned-key|user-owned-secret|user-owned-passphrase/);

    const ownLookup = await lookupUserPolymarketL2Credentials(userId, walletAddress, executor);
    assert.equal(ownLookup.status, "present");
    assert.deepEqual(ownLookup.credentials, credentials);

    const otherUserLookup = await lookupUserPolymarketL2Credentials(otherUserId, walletAddress, executor);
    assert.equal(otherUserLookup.status, "missing");

    const otherWalletLookup = await lookupUserPolymarketL2Credentials(userId, otherWalletAddress, executor);
    assert.equal(otherWalletLookup.status, "missing");
    assert.equal(queries.some((query) => /revoked_at = null/.test(query)), true);
  });
});

test("L2 credential module does not log or return raw credentials from HTTP handlers", () => {
  const l2Source = readFileSync(resolve(process.cwd(), "src/modules/external-polymarket-routing/l2-credentials.ts"), "utf8");
  const handlersSource = readFileSync(resolve(process.cwd(), "src/modules/external-polymarket-routing/handlers.ts"), "utf8");

  assert.doesNotMatch(l2Source, /logger\.|console\./);
  assert.doesNotMatch(handlersSource, /Response\.json\([^)]*(l2Credentials|secret|passphrase|key)/is);
});
