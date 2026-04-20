import { performance } from "node:perf_hooks";

interface HarnessConfig {
  apiBaseUrl: string;
  wsUrl: string;
  marketId?: string;
  outcomeId?: string;
  readRequests: number;
  readConcurrency: number;
  orderBurstCount: number;
  orderBurstConcurrency: number;
  wsClients: number;
  wsRuntimeMs: number;
  orderPrice: bigint;
  orderQuantity: bigint;
}

interface PhaseMetrics {
  phase: string;
  totalRequests: number;
  successCount: number;
  errorCount: number;
  minMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  averageMs: number;
  errorRate: number;
  thresholdBreached: boolean;
  thresholdMessage: string;
}

interface MarketSnapshot {
  id: string;
  status: string;
  outcomes: Array<{ id: string }>;
}

const defaults: HarnessConfig = {
  apiBaseUrl: process.env.LOAD_API_BASE_URL ?? "http://127.0.0.1:4000",
  wsUrl: process.env.LOAD_WS_URL ?? "ws://127.0.0.1:4001/ws",
  marketId: process.env.LOAD_MARKET_ID,
  outcomeId: process.env.LOAD_OUTCOME_ID,
  readRequests: Number(process.env.LOAD_READ_REQUESTS ?? "200"),
  readConcurrency: Number(process.env.LOAD_READ_CONCURRENCY ?? "20"),
  orderBurstCount: Number(process.env.LOAD_ORDER_BURST_COUNT ?? "50"),
  orderBurstConcurrency: Number(process.env.LOAD_ORDER_BURST_CONCURRENCY ?? "10"),
  wsClients: Number(process.env.LOAD_WS_CLIENTS ?? "25"),
  wsRuntimeMs: Number(process.env.LOAD_WS_RUNTIME_MS ?? "5000"),
  orderPrice: BigInt(process.env.LOAD_ORDER_PRICE ?? "50"),
  orderQuantity: BigInt(process.env.LOAD_ORDER_QUANTITY ?? "1"),
};

const readFlag = (name: string): string | undefined => {
  const prefix = `--${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
};

const hasFlag = (name: string): boolean => process.argv.includes(`--${name}`);

const parseIntegerFlag = (name: keyof HarnessConfig, fallback: number): number => {
  const value = readFlag(name);
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`invalid --${name} value: ${value}`);
  }

  return parsed;
};

const parseBigIntFlag = (name: keyof HarnessConfig, fallback: bigint): bigint => {
  const value = readFlag(name);
  if (!value) {
    return fallback;
  }

  try {
    const parsed = BigInt(value);
    if (parsed <= 0n) {
      throw new Error("must be greater than zero");
    }
    return parsed;
  } catch {
    throw new Error(`invalid --${name} value: ${value}`);
  }
};

const parseConfig = (): HarnessConfig => ({
  apiBaseUrl: readFlag("apiBaseUrl") ?? defaults.apiBaseUrl,
  wsUrl: readFlag("wsUrl") ?? defaults.wsUrl,
  marketId: readFlag("marketId") ?? defaults.marketId,
  outcomeId: readFlag("outcomeId") ?? defaults.outcomeId,
  readRequests: parseIntegerFlag("readRequests", defaults.readRequests),
  readConcurrency: parseIntegerFlag("readConcurrency", defaults.readConcurrency),
  orderBurstCount: parseIntegerFlag("orderBurstCount", defaults.orderBurstCount),
  orderBurstConcurrency: parseIntegerFlag("orderBurstConcurrency", defaults.orderBurstConcurrency),
  wsClients: parseIntegerFlag("wsClients", defaults.wsClients),
  wsRuntimeMs: parseIntegerFlag("wsRuntimeMs", defaults.wsRuntimeMs),
  orderPrice: parseBigIntFlag("orderPrice", defaults.orderPrice),
  orderQuantity: parseBigIntFlag("orderQuantity", defaults.orderQuantity),
});

const percentile = (sortedValues: number[], percentileValue: number): number => {
  if (sortedValues.length === 0) {
    return 0;
  }

  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil((percentileValue / 100) * sortedValues.length) - 1),
  );

  return sortedValues[index] ?? 0;
};

const summarizeMetrics = (
  phase: string,
  latenciesMs: number[],
  errorCount: number,
  threshold: { maxErrorRate: number; p95Ms: number },
): PhaseMetrics => {
  const sorted = [...latenciesMs].sort((left, right) => left - right);
  const totalRequests = latenciesMs.length + errorCount;
  const successCount = latenciesMs.length;
  const averageMs = latenciesMs.length === 0 ? 0 : latenciesMs.reduce((sum, value) => sum + value, 0) / latenciesMs.length;
  const errorRate = totalRequests === 0 ? 0 : errorCount / totalRequests;

  const p95Ms = percentile(sorted, 95);
  const thresholdBreached = errorRate > threshold.maxErrorRate || p95Ms > threshold.p95Ms;

  const thresholdMessage = thresholdBreached
    ? `breached (errorRate=${(errorRate * 100).toFixed(2)}%, p95=${p95Ms.toFixed(1)}ms)`
    : `ok (errorRate=${(errorRate * 100).toFixed(2)}%, p95=${p95Ms.toFixed(1)}ms)`;

  return {
    phase,
    totalRequests,
    successCount,
    errorCount,
    minMs: sorted[0] ?? 0,
    p50Ms: percentile(sorted, 50),
    p95Ms,
    maxMs: sorted[sorted.length - 1] ?? 0,
    averageMs,
    errorRate,
    thresholdBreached,
    thresholdMessage,
  };
};

const runConcurrent = async (
  total: number,
  concurrency: number,
  worker: () => Promise<void>,
): Promise<void> => {
  let index = 0;

  const runner = async () => {
    while (index < total) {
      index += 1;
      await worker();
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, () => runner()));
};

const fetchJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, init);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return (await response.json()) as T;
};

const resolveMarketTargets = async (
  config: HarnessConfig,
): Promise<{ marketId: string; outcomeId: string }> => {
  if (config.marketId && config.outcomeId) {
    return {
      marketId: config.marketId,
      outcomeId: config.outcomeId,
    };
  }

  const markets = await fetchJson<MarketSnapshot[]>(`${config.apiBaseUrl}/markets`);
  const selected = markets.find((market) => market.status === "open" && market.outcomes.length > 0) ?? markets[0];

  if (!selected || selected.outcomes.length === 0) {
    throw new Error("no seeded market with outcomes found; run local seed/reset first");
  }

  return {
    marketId: config.marketId ?? selected.id,
    outcomeId: config.outcomeId ?? selected.outcomes[0]!.id,
  };
};

const runHttpPhase = async (
  phase: string,
  totalRequests: number,
  concurrency: number,
  requestFactory: () => Promise<void>,
  threshold: { maxErrorRate: number; p95Ms: number },
): Promise<PhaseMetrics> => {
  const latenciesMs: number[] = [];
  let errorCount = 0;

  await runConcurrent(totalRequests, concurrency, async () => {
    const startedAt = performance.now();

    try {
      await requestFactory();
      latenciesMs.push(performance.now() - startedAt);
    } catch {
      errorCount += 1;
    }
  });

  return summarizeMetrics(phase, latenciesMs, errorCount, threshold);
};

const runWebsocketFanIn = async (
  config: HarnessConfig,
  marketId: string,
): Promise<PhaseMetrics> => {
  const WebSocketCtor = globalThis.WebSocket;

  if (!WebSocketCtor || config.wsClients === 0) {
    return {
      phase: "ws-fan-in",
      totalRequests: 0,
      successCount: 0,
      errorCount: 0,
      minMs: 0,
      p50Ms: 0,
      p95Ms: 0,
      maxMs: 0,
      averageMs: 0,
      errorRate: 0,
      thresholdBreached: false,
      thresholdMessage: "skipped (global WebSocket unavailable or wsClients=0)",
    };
  }

  const latenciesMs: number[] = [];
  let errorCount = 0;
  const sockets: WebSocket[] = [];
  const connectPromises = Array.from({ length: config.wsClients }, () =>
    new Promise<void>((resolve) => {
      const startedAt = performance.now();
      const socket = new WebSocketCtor(config.wsUrl);
      sockets.push(socket);

      socket.addEventListener("open", () => {
        latenciesMs.push(performance.now() - startedAt);
        socket.send(
          JSON.stringify({
            type: "market.subscribe",
            marketId,
            channels: ["orderbook", "trades"],
          }),
        );
        resolve();
      });

      socket.addEventListener("error", () => {
        errorCount += 1;
        resolve();
      });
    }),
  );

  await Promise.all(connectPromises);
  await new Promise((resolve) => setTimeout(resolve, config.wsRuntimeMs));

  sockets.forEach((socket) => {
    try {
      socket.close();
    } catch {
      // noop
    }
  });

  return summarizeMetrics("ws-fan-in", latenciesMs, errorCount, {
    maxErrorRate: 0.02,
    p95Ms: 500,
  });
};

const printMetrics = (metrics: PhaseMetrics): void => {
  const thresholdLabel = metrics.thresholdBreached ? "FAIL" : "PASS";

  console.log(`\n[${metrics.phase}] ${thresholdLabel}`);
  console.log(`requests=${metrics.totalRequests} success=${metrics.successCount} errors=${metrics.errorCount}`);
  console.log(
    `latency_ms min=${metrics.minMs.toFixed(1)} p50=${metrics.p50Ms.toFixed(1)} p95=${metrics.p95Ms.toFixed(1)} avg=${metrics.averageMs.toFixed(1)} max=${metrics.maxMs.toFixed(1)}`,
  );
  console.log(`threshold=${metrics.thresholdMessage}`);
};

const printUsage = (): void => {
  console.log(`Usage: node --import tsx infra/load/launch-load-harness.ts [flags]\n
Flags:
  --apiBaseUrl=http://127.0.0.1:4000
  --wsUrl=ws://127.0.0.1:4001/ws
  --marketId=<uuid>
  --outcomeId=<uuid>
  --readRequests=200
  --readConcurrency=20
  --orderBurstCount=50
  --orderBurstConcurrency=10
  --orderPrice=50
  --orderQuantity=1
  --wsClients=25
  --wsRuntimeMs=5000
  --help
`);
};

const main = async (): Promise<void> => {
  if (hasFlag("help")) {
    printUsage();
    return;
  }

  const config = parseConfig();
  const target = await resolveMarketTargets(config);

  console.log("Starting launch-path load harness with config:");
  console.log(
    JSON.stringify(
      {
        ...config,
        orderPrice: config.orderPrice.toString(),
        orderQuantity: config.orderQuantity.toString(),
        marketId: target.marketId,
        outcomeId: target.outcomeId,
      },
      null,
      2,
    ),
  );

  const phaseResults: PhaseMetrics[] = [];

  phaseResults.push(
    await runHttpPhase(
      "markets-list-read",
      config.readRequests,
      config.readConcurrency,
      async () => {
        await fetchJson(`${config.apiBaseUrl}/markets`);
      },
      { maxErrorRate: 0.01, p95Ms: 300 },
    ),
  );

  phaseResults.push(
    await runHttpPhase(
      "market-detail-read",
      config.readRequests,
      config.readConcurrency,
      async () => {
        await fetchJson(`${config.apiBaseUrl}/markets/${target.marketId}`);
      },
      { maxErrorRate: 0.01, p95Ms: 300 },
    ),
  );

  phaseResults.push(
    await runHttpPhase(
      "orderbook-read",
      config.readRequests,
      config.readConcurrency,
      async () => {
        await fetchJson(`${config.apiBaseUrl}/markets/${target.marketId}/orderbook`);
      },
      { maxErrorRate: 0.01, p95Ms: 300 },
    ),
  );

  phaseResults.push(
    await runHttpPhase(
      "recent-trades-read",
      config.readRequests,
      config.readConcurrency,
      async () => {
        await fetchJson(`${config.apiBaseUrl}/markets/${target.marketId}/trades`);
      },
      { maxErrorRate: 0.01, p95Ms: 300 },
    ),
  );

  phaseResults.push(
    await runHttpPhase(
      "order-placement-burst",
      config.orderBurstCount,
      config.orderBurstConcurrency,
      async () => {
        const side = Math.random() > 0.5 ? "buy" : "sell";
        await fetchJson(`${config.apiBaseUrl}/orders`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            marketId: target.marketId,
            outcomeId: target.outcomeId,
            side,
            orderType: "limit",
            price: config.orderPrice.toString(),
            quantity: config.orderQuantity.toString(),
            clientOrderId: `load-${crypto.randomUUID()}`,
          }),
        });
      },
      { maxErrorRate: 0.02, p95Ms: 500 },
    ),
  );

  phaseResults.push(await runWebsocketFanIn(config, target.marketId));

  phaseResults.forEach((result) => printMetrics(result));

  const failures = phaseResults.filter((result) => result.thresholdBreached);
  console.log(`\nSummary: ${phaseResults.length - failures.length}/${phaseResults.length} phases met thresholds.`);

  if (failures.length > 0) {
    process.exitCode = 1;
  }
};

main().catch((error: unknown) => {
  console.error("launch load harness failed", error);
  process.exitCode = 1;
});
