import assert from "node:assert/strict";
import test from "node:test";

import { canUseDevHeaderOverride, getUserRole, isAdminRole, resolveAuthenticatedUser } from "./auth";

test("spoofed header cannot impersonate authenticated user", () => {
  const user = resolveAuthenticatedUser({
    sessionUser: { id: "session-user-id", role: "user" },
    requestHeaderUserId: "spoofed-user-id",
    requestHeaderRole: "admin",
    allowDevHeaderOverride: true,
  });

  assert.deepEqual(user, { id: "session-user-id", role: "user" });
});

test("missing session is rejected when dev override is disabled", () => {
  const user = resolveAuthenticatedUser({
    sessionUser: null,
    requestHeaderUserId: "header-user-id",
    requestHeaderRole: "admin",
    allowDevHeaderOverride: false,
  });

  assert.equal(user, null);
});

test("non-admin user fails admin gate", () => {
  assert.equal(isAdminRole("user"), false);
  assert.equal(isAdminRole("trader"), false);
  assert.equal(isAdminRole("admin"), true);
});

test("valid admin session is recognized", () => {
  assert.equal(getUserRole({ id: "admin-id", role: "admin" }), "admin");
  assert.equal(isAdminRole(getUserRole({ id: "admin-id", role: "admin" })), true);
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
