interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

interface RateLimitState {
  windowStartedAtMs: number;
  count: number;
}

const parsePositiveNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value ?? "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const defaultWindowMs = parsePositiveNumber(process.env.RATE_LIMIT_WINDOW_MS, 60_000);

export const rateLimitConfig = {
  orderPlacement: {
    windowMs: defaultWindowMs,
    maxRequests: parsePositiveNumber(process.env.RATE_LIMIT_ORDER_MAX, 60),
  },
  orderCancel: {
    windowMs: defaultWindowMs,
    maxRequests: parsePositiveNumber(process.env.RATE_LIMIT_CANCEL_MAX, 60),
  },
  claims: {
    windowMs: defaultWindowMs,
    maxRequests: parsePositiveNumber(process.env.RATE_LIMIT_CLAIM_MAX, 30),
  },
  adminResolution: {
    windowMs: defaultWindowMs,
    maxRequests: parsePositiveNumber(process.env.RATE_LIMIT_ADMIN_RESOLUTION_MAX, 20),
  },
} satisfies Record<string, RateLimitConfig>;

const state = new Map<string, RateLimitState>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export const checkRateLimit = (
  scope: keyof typeof rateLimitConfig,
  identity: string,
): RateLimitResult => {
  const config = rateLimitConfig[scope];
  const key = `${scope}:${identity}`;
  const now = Date.now();

  const existing = state.get(key);
  if (!existing || now - existing.windowStartedAtMs >= config.windowMs) {
    state.set(key, {
      windowStartedAtMs: now,
      count: 1,
    });

    return {
      allowed: true,
      remaining: Math.max(config.maxRequests - 1, 0),
      retryAfterSeconds: Math.ceil(config.windowMs / 1000),
    };
  }

  if (existing.count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(
        Math.ceil((config.windowMs - (now - existing.windowStartedAtMs)) / 1000),
        1,
      ),
    };
  }

  existing.count += 1;

  return {
    allowed: true,
    remaining: Math.max(config.maxRequests - existing.count, 0),
    retryAfterSeconds: Math.max(
      Math.ceil((config.windowMs - (now - existing.windowStartedAtMs)) / 1000),
      1,
    ),
  };
};
