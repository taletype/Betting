import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { defaultLocale, localeCookieName, localeHeaderName, normalizeLocale, pathSegmentToLocale } from "./lib/locale";
import { protectRoute } from "./lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  const firstSegment = request.nextUrl.pathname.split("/").filter(Boolean)[0];
  const cookieLocale = request.cookies.get(localeCookieName)?.value;
  const acceptLanguage = request.headers.get("accept-language")?.split(",")[0];
  const locale = pathSegmentToLocale(firstSegment) ?? (cookieLocale ? normalizeLocale(cookieLocale) : acceptLanguage ? normalizeLocale(acceptLanguage) : defaultLocale);

  requestHeaders.set(localeHeaderName, locale);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  response.cookies.set(localeCookieName, locale, { path: "/", sameSite: "lax", maxAge: 31_536_000 });

  return protectRoute(request, response);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
