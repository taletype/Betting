import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { NextRequest, NextResponse } from "next/server";

import { protectRoute, updateSession } from "./middleware";

const supabaseEnvKeys = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;

const withoutSupabaseEnv = async (test: () => Promise<void>) => {
  const previous = new Map<string, string | undefined>();
  for (const key of supabaseEnvKeys) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }

  try {
    await test();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

describe("supabase middleware", () => {
  it("leaves public routes available when Supabase env is missing", async () => {
    await withoutSupabaseEnv(async () => {
      const request = new NextRequest("https://example.test/markets");
      const response = await updateSession(request, NextResponse.next());

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("location"), null);
    });
  });

  it("lets account render its login CTA when Supabase env is missing", async () => {
    await withoutSupabaseEnv(async () => {
      const request = new NextRequest("https://example.test/account?tab=wallet");
      const response = await protectRoute(request, NextResponse.next());

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("location"), null);
    });
  });

  it("fails admin routes closed when Supabase env is missing", async () => {
    await withoutSupabaseEnv(async () => {
      const request = new NextRequest("https://example.test/admin/ambassadors");
      const response = await protectRoute(request, NextResponse.next());
      const location = response.headers.get("location");

      assert.equal(response.status, 307);
      assert.ok(location);
      const redirectUrl = new URL(location);
      assert.equal(redirectUrl.pathname, "/login");
      assert.equal(redirectUrl.searchParams.get("next"), "/admin/ambassadors");
      assert.equal(redirectUrl.searchParams.get("auth"), "unavailable");
    });
  });
});
