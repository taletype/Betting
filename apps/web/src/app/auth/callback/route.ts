import { NextRequest, NextResponse } from "next/server";

import { createSupabaseServerClient } from "@bet/supabase/server";
import { normalizeAuthNextPath } from "../../../lib/auth-redirect";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const requestedNext = requestUrl.searchParams.get("next") ?? "/account";
  const next = normalizeAuthNextPath(requestedNext);
  const response = NextResponse.redirect(new URL(next, requestUrl.origin));

  if (code) {
    try {
      const supabase = createSupabaseServerClient({
        get: (name) => request.cookies.get(name)?.value,
        set: (name, value, options) => response.cookies.set(name, value, options),
        remove: (name, options) => response.cookies.delete({ name, ...options }),
      });
      await supabase.auth.exchangeCodeForSession(code);
    } catch (error) {
      console.warn("failed to exchange auth callback code", error);
    }
  }

  return response;
}
