import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@bet/supabase";

const privatePrefixes = ["/account"];
const adminPrefix = "/admin";

const isProtectedPath = (pathname: string): boolean =>
  privatePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) ||
  pathname === adminPrefix ||
  pathname.startsWith(`${adminPrefix}/`);

export const updateSession = async (request: NextRequest, response: NextResponse = NextResponse.next()) => {
  const supabase = createSupabaseServerClient({
    get: (name) => request.cookies.get(name)?.value,
    set: (name, value, options) => response.cookies.set(name, value, options),
    remove: (name, options) => response.cookies.delete({ name, ...options }),
  });

  await supabase.auth.getUser();
  return response;
};

export const protectRoute = async (request: NextRequest, response: NextResponse = NextResponse.next()) => {
  const pathname = request.nextUrl.pathname;
  if (!isProtectedPath(pathname)) {
    return updateSession(request, response);
  }

  const supabase = createSupabaseServerClient({
    get: (name) => request.cookies.get(name)?.value,
    set: (name, value, options) => response.cookies.set(name, value, options),
    remove: (name, options) => response.cookies.delete({ name, ...options }),
  });

  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  const role = typeof user.app_metadata?.role === "string" ? user.app_metadata.role : "user";
  if ((pathname === adminPrefix || pathname.startsWith(`${adminPrefix}/`)) && role !== "admin") {
    const accountUrl = request.nextUrl.clone();
    accountUrl.pathname = "/account";
    accountUrl.searchParams.set("auth", "forbidden");
    return NextResponse.redirect(accountUrl);
  }

  return response;
};
