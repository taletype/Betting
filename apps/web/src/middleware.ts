import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { chineseLocale, defaultLocale, localeHeaderName } from "./lib/locale";
import { protectRoute } from "./lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  const locale = request.nextUrl.pathname === `/${chineseLocale}` || request.nextUrl.pathname.startsWith(`/${chineseLocale}/`)
    ? chineseLocale
    : defaultLocale;

  requestHeaders.set(localeHeaderName, locale);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  return protectRoute(request, response);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
