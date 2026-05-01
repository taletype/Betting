import assert from "node:assert/strict";
import test from "node:test";

import { buildMagicLinkRedirectTo, getMagicLinkSiteUrl, normalizeAuthNextPath } from "./auth-redirect";

const withEnv = async (values: Record<string, string | undefined>, run: () => Promise<void> | void) => {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
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

test("auth next path accepts only same-origin relative paths", () => {
  assert.equal(normalizeAuthNextPath("/account"), "/account");
  assert.equal(normalizeAuthNextPath("/account?tab=rewards#summary"), "/account?tab=rewards#summary");
  assert.equal(normalizeAuthNextPath("https://evil.example/account"), "/account");
  assert.equal(normalizeAuthNextPath("//evil.example/account"), "/account");
  assert.equal(normalizeAuthNextPath("javascript:alert(1)"), "/account");
  assert.equal(normalizeAuthNextPath("/\\evil.example/account"), "/account");
  assert.equal(normalizeAuthNextPath("/guides/invite-rewards"), "/account");
  assert.equal(normalizeAuthNextPath("/polymarket"), "/polymarket");
  assert.equal(normalizeAuthNextPath("/polymarket/market-1"), "/polymarket/market-1");
  assert.equal(normalizeAuthNextPath("/account\nSet-Cookie:bad=1"), "/account");
});

test("magic link redirectTo points at local callback with sanitized next", () => {
  const redirectTo = buildMagicLinkRedirectTo("https://bet.example/", "//evil.example/account");
  assert.equal(redirectTo, "https://bet.example/auth/callback?next=%2Faccount");
});

test("magic link redirectTo preserves safe referral code", () => {
  const redirectTo = buildMagicLinkRedirectTo("https://bet.example/", "/polymarket", "friend001");
  assert.equal(redirectTo, "https://bet.example/auth/callback?next=%2Fpolymarket&ref=FRIEND001");
});

test("magic link site URL prefers production URL envs and never falls back to localhost in production", async () => {
  await withEnv({
    NEXT_PUBLIC_SITE_URL: undefined,
    VERCEL_PROJECT_PRODUCTION_URL: "betting-web-ten.vercel.app",
    VERCEL_URL: "preview-bet.vercel.app",
    NODE_ENV: "production",
  }, () => {
    assert.equal(getMagicLinkSiteUrl(), "https://betting-web-ten.vercel.app");
  });

  await withEnv({
    NEXT_PUBLIC_SITE_URL: undefined,
    VERCEL_PROJECT_PRODUCTION_URL: undefined,
    VERCEL_URL: undefined,
    NODE_ENV: "production",
    VERCEL: "1",
  }, () => {
    assert.throws(() => getMagicLinkSiteUrl(), /AUTH_SITE_URL_REQUIRED/);
  });
});
