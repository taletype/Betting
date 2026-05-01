import assert from "node:assert/strict";
import test from "node:test";

import { buildMagicLinkRedirectTo, normalizeAuthNextPath } from "./auth-redirect";

test("auth next path accepts only same-origin relative paths", () => {
  assert.equal(normalizeAuthNextPath("/account"), "/account");
  assert.equal(normalizeAuthNextPath("/account?tab=rewards#summary"), "/account?tab=rewards#summary");
  assert.equal(normalizeAuthNextPath("https://evil.example/account"), "/account");
  assert.equal(normalizeAuthNextPath("//evil.example/account"), "/account");
  assert.equal(normalizeAuthNextPath("/\\evil.example/account"), "/account");
  assert.equal(normalizeAuthNextPath("/account\nSet-Cookie:bad=1"), "/account");
});

test("magic link redirectTo points at local callback with sanitized next", () => {
  const redirectTo = buildMagicLinkRedirectTo("https://bet.example/", "//evil.example/account");
  assert.equal(redirectTo, "https://bet.example/auth/callback?next=%2Faccount");
});
