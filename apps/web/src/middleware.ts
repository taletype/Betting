import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { chineseLocale, defaultLocale, localeHeaderName } from "./lib/locale";

export function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  const locale = request.nextUrl.pathname === `/${chineseLocale}` || request.nextUrl.pathname.startsWith(`/${chineseLocale}/`)
    ? chineseLocale
    : defaultLocale;

  requestHeaders.set(localeHeaderName, locale);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
