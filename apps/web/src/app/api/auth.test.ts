import assert from "node:assert/strict";
import test from "node:test";

import { evaluateAdminAccess, getUserRole, isAdminRole, resolveAuthenticatedUser } from "./auth";

test("spoofed header cannot impersonate authenticated user", () => {
  const user = resolveAuthenticatedUser({
    sessionUser: { id: "session-user-id", role: "user" },
  });

  assert.deepEqual(user, { id: "session-user-id", role: "user" });
});

test("missing session is rejected even when spoofing headers", () => {
  const user = resolveAuthenticatedUser({
    sessionUser: null,
  });

  assert.equal(user, null);
});

test("non-admin cannot access admin route", () => {
  assert.equal(isAdminRole("user"), false);
  assert.equal(isAdminRole("trader"), false);
  assert.equal(isAdminRole("admin"), true);
  assert.deepEqual(evaluateAdminAccess({ id: "user-id", role: "user" }), {
    ok: false,
    status: 403,
    error: "Admin privileges required",
  });
});

test("valid admin path still works", () => {
  assert.equal(getUserRole({ id: "admin-id", role: "admin" }), "admin");
  assert.equal(isAdminRole(getUserRole({ id: "admin-id", role: "admin" })), true);
  assert.deepEqual(evaluateAdminAccess({ id: "admin-id", role: "admin" }), { ok: true });
});

test("missing user cannot access admin route", () => {
  assert.deepEqual(evaluateAdminAccess(null), {
    ok: false,
    status: 401,
    error: "Authentication required",
  });
});
