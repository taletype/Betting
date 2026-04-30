import assert from "node:assert/strict";
import test from "node:test";

import type { DatabaseExecutor } from "@bet/db";

import {
  getMarketSourceContentHash,
  runPolymarketMarketTranslationSyncJobWithDependencies,
  type MarketTranslator,
} from "./market-translation";

const withEnv = async (env: Record<string, string | undefined>, run: () => Promise<void>) => {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(env)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    await run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

const createDb = (existingHash?: string) => {
  const writes: unknown[][] = [];
  const db: DatabaseExecutor = {
    async query(statement, values = []) {
      if (statement.includes("public.orders") || statement.includes("public.positions") || statement.includes("public.ledger")) {
        throw new Error("internal trading tables must not be touched");
      }
      if (statement.includes("from public.external_market_cache")) {
        return [{
          source: "polymarket",
          external_id: "poly-1",
          title: "Will BTC hit $100,000 by Dec 31?",
          description: "Resolves according to Polymarket rules.",
          outcomes: [{ title: "Yes" }, { title: "No" }],
          last_synced_at: "2026-04-01T00:00:00.000Z",
        }] as never;
      }
      if (statement.includes("from public.external_market_translations")) {
        return existingHash ? [{
          source: "polymarket",
          external_id: "poly-1",
          locale: "zh-HK",
          source_content_hash: existingHash,
          status: "translated",
        }] as never : [];
      }
      if (statement.includes("insert into public.external_market_translations")) {
        writes.push([...values]);
        return [];
      }
      return [];
    },
  };
  return { db, writes };
};

test("translation worker skips safely when GROQ_API_KEY is missing", async () => {
  await withEnv({ GROQ_API_KEY: undefined, MARKET_TRANSLATION_LOCALES: "zh-HK" }, async () => {
    const { db, writes } = createDb();
    const result = await runPolymarketMarketTranslationSyncJobWithDependencies(db);
    assert.equal(result.skipped, 1);
    assert.equal(writes[0]?.[6], "skipped");
    assert.equal(writes[0]?.[10], "GROQ_API_KEY_MISSING");
  });
});

test("translation worker writes translated rows and preserves original source hash", async () => {
  const translator: MarketTranslator = {
    async translate(input) {
      assert.equal(input.title, "Will BTC hit $100,000 by Dec 31?");
      return {
        title: "BTC 會否在 12 月 31 日前達到 $100,000？",
        description: "根據 Polymarket 規則結算。",
        outcomes: ["會", "不會"],
      };
    },
  };
  await withEnv({ MARKET_TRANSLATION_LOCALES: "zh-HK", GROQ_TRANSLATION_MODEL: "qwen/qwen3-32b" }, async () => {
    const { db, writes } = createDb();
    const result = await runPolymarketMarketTranslationSyncJobWithDependencies(db, translator);
    assert.equal(result.translated, 1);
    assert.equal(writes[0]?.[3], "BTC 會否在 12 月 31 日前達到 $100,000？");
    assert.equal(writes[0]?.[6], "translated");
    assert.equal(writes[0]?.[7], "groq");
    assert.equal(writes[0]?.[8], "qwen/qwen3-32b");
  });
});

test("translation worker detects stale source hashes", async () => {
  const oldHash = getMarketSourceContentHash({ title: "Old", description: "", outcomes: ["Yes"] });
  const translator: MarketTranslator = {
    async translate() {
      return { title: "新標題", description: "新描述", outcomes: ["會", "不會"] };
    },
  };
  const { db } = createDb(oldHash);
  const result = await runPolymarketMarketTranslationSyncJobWithDependencies(db, translator);
  assert.equal(result.stale, 1);
  assert.equal(result.translated, 2);
});

test("malformed translator output is handled as a failed translation", async () => {
  const translator: MarketTranslator = {
    async translate() {
      throw new Error("MALFORMED_JSON_SHAPE");
    },
  };
  await withEnv({ MARKET_TRANSLATION_LOCALES: "zh-HK" }, async () => {
    const { db, writes } = createDb();
    const result = await runPolymarketMarketTranslationSyncJobWithDependencies(db, translator);
    assert.equal(result.failed, 1);
    assert.equal(writes[0]?.[6], "failed");
    assert.equal(writes[0]?.[10], "MALFORMED_JSON_SHAPE");
  });
});
