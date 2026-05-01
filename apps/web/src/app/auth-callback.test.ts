import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { GET, setAuthCallbackDependenciesForTests } from "./auth/callback/route";

const mockSupabaseFactory = (options: {
  exchanged?: string[];
  userId?: string | null;
  exchangeError?: Error | null;
  userError?: Error | null;
}) => () => ({
  auth: {
    exchangeCodeForSession: async (code: string) => {
      options.exchanged?.push(code);
      return { error: options.exchangeError ?? null };
    },
    getUser: async () => ({
      data: { user: options.userId ? { id: options.userId } : null },
      error: options.userError ?? null,
    }),
  },
});

test("auth callback exchanges code for session and redirects to safe next", async () => {
  const exchanged: string[] = [];
  setAuthCallbackDependenciesForTests({
    supabaseServerClientFactory: mockSupabaseFactory({ exchanged, userId: "user-1" }) as never,
    referralApplier: (async () => null) as never,
  });
  try {
    const response = await GET(new NextRequest("https://bet.example/auth/callback?code=abc&next=/polymarket/market-1"));

    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), "https://bet.example/polymarket/market-1");
    assert.deepEqual(exchanged, ["abc"]);
  } finally {
    setAuthCallbackDependenciesForTests({});
  }
});

test("auth callback rejects external next URL", async () => {
  setAuthCallbackDependenciesForTests({
    supabaseServerClientFactory: mockSupabaseFactory({ userId: "user-1" }) as never,
    referralApplier: (async () => null) as never,
  });
  try {
    const response = await GET(new NextRequest("https://bet.example/auth/callback?code=abc&next=https://evil.example/account"));

    assert.equal(response.headers.get("location"), "https://bet.example/account");
  } finally {
    setAuthCallbackDependenciesForTests({});
  }
});

test("auth callback applies pending referral only after session exists", async () => {
  const applied: Array<{ userId: string; code: string }> = [];
  setAuthCallbackDependenciesForTests({
    supabaseServerClientFactory: mockSupabaseFactory({ userId: "user-1" }) as never,
    referralApplier: (async (userId: string, code: string) => {
      applied.push({ userId, code });
      return null;
    }) as never,
  });
  try {
    const request = new NextRequest("https://bet.example/auth/callback?code=abc&next=/account", {
      headers: { cookie: "bet_pending_ref=FRIEND001" },
    });
    const response = await GET(request);

    assert.deepEqual(applied, [{ userId: "user-1", code: "FRIEND001" }]);
    assert.match(response.headers.get("set-cookie") ?? "", /bet_pending_ref=/);
  } finally {
    setAuthCallbackDependenciesForTests({});
  }
});

test("auth callback keeps pending referral when apply has non-terminal failure", async () => {
  setAuthCallbackDependenciesForTests({
    supabaseServerClientFactory: mockSupabaseFactory({ userId: "user-1" }) as never,
    referralApplier: (async () => {
      throw new Error("database temporarily unavailable");
    }) as never,
  });
  try {
    const response = await GET(new NextRequest("https://bet.example/auth/callback?code=abc", {
      headers: { cookie: "bet_pending_ref=FRIEND001" },
    }));

    assert.equal(response.headers.get("location"), "https://bet.example/account");
    assert.doesNotMatch(response.headers.get("set-cookie") ?? "", /Max-Age=0|Expires=Thu, 01 Jan 1970/i);
  } finally {
    setAuthCallbackDependenciesForTests({});
  }
});

test("auth callback clears malformed pending referral after session", async () => {
  let called = false;
  setAuthCallbackDependenciesForTests({
    supabaseServerClientFactory: mockSupabaseFactory({ userId: "user-1" }) as never,
    referralApplier: (async () => {
      called = true;
    }) as never,
  });
  try {
    const response = await GET(new NextRequest("https://bet.example/auth/callback?code=abc", {
      headers: { cookie: "bet_pending_ref=x" },
    }));

    assert.equal(called, false);
    assert.match(response.headers.get("set-cookie") ?? "", /bet_pending_ref=/);
  } finally {
    setAuthCallbackDependenciesForTests({});
  }
});

test("auth callback redirects failure to login with safe error", async () => {
  setAuthCallbackDependenciesForTests({
    supabaseServerClientFactory: mockSupabaseFactory({ userId: null, exchangeError: new Error("bad code") }) as never,
  });
  try {
    const response = await GET(new NextRequest("https://bet.example/auth/callback?code=abc&next=javascript:alert(1)"));
    const location = new URL(response.headers.get("location") ?? "");

    assert.equal(location.pathname, "/login");
    assert.equal(location.searchParams.get("auth"), "callback_failed");
    assert.equal(location.searchParams.get("next"), "/account");
  } finally {
    setAuthCallbackDependenciesForTests({});
  }
});
