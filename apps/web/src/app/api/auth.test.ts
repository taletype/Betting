import assert from "node:assert/strict";
import test from "node:test";

import { canUseDevHeaderOverride, isAdminRole, resolveUserId } from "./auth";

test("spoofed header cannot override authenticated user", () => {
  const userId = resolveUserId({
    sessionUserId: "session-user-id",
    requestHeaderUserId: "spoofed-user-id",
    allowDevHeaderOverride: true,
  });

  assert.equal(userId, "session-user-id");
});

test("unauthenticated user without explicit dev override is rejected", () => {
  const userId = resolveUserId({
    sessionUserId: null,
    requestHeaderUserId: "header-user-id",
    allowDevHeaderOverride: false,
  });

  assert.equal(userId, null);
});

test("non-admin role fails admin gate", () => {
  assert.equal(isAdminRole("user"), false);
  assert.equal(isAdminRole("trader"), false);
  assert.equal(isAdminRole("admin"), true);
});

test("dev header override is only enabled when explicitly gated", () => {
  assert.equal(
    canUseDevHeaderOverride({ nodeEnv: "development", allowDevIdentityHeader: "true" }),
    true,
  );
  assert.equal(
    canUseDevHeaderOverride({ nodeEnv: "development", allowDevIdentityHeader: undefined }),
    false,
  );
  assert.equal(
    canUseDevHeaderOverride({ nodeEnv: "production", allowDevIdentityHeader: "true" }),
    false,
  );
});
