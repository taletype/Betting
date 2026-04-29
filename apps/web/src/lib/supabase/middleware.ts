import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@bet/supabase";

const privatePrefixes = ["/account"];
const adminPrefix = "/admin";
const supabaseConfigKeys = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;

const isProtectedPath = (pathname: string): boolean =>
  privatePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) ||
  pathname === adminPrefix ||
  pathname.startsWith(`${adminPrefix}/`);

const hasSupabaseMiddlewareConfig = (): boolean =>
  supabaseConfigKeys.every((name) => {
    const value = process.env[name]?.trim();
    return Boolean(value && value !== "replace-me" && value !== "changeme");
  });

const createMiddlewareSupabaseClient = (request: NextRequest, response: NextResponse) => {
  if (!hasSupabaseMiddlewareConfig()) return null;

  try {
    return createSupabaseServerClient({
      get: (name) => request.cookies.get(name)?.value,
      set: (name, value, options) => response.cookies.set(name, value, options),
      remove: (name, options) => response.cookies.delete({ name, ...options }),
    });
  } catch (error) {
    console.warn("supabase middleware client unavailable", error);
    return null;
  }
};

const redirectToLogin = (request: NextRequest, authUnavailable = false): NextResponse => {
  const pathname = request.nextUrl.pathname;
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
  if (authUnavailable) loginUrl.searchParams.set("auth", "unavailable");
  return NextResponse.redirect(loginUrl);
};

export const updateSession = async (request: NextRequest, response: NextResponse = NextResponse.next()) => {
  const supabase = createMiddlewareSupabaseClient(request, response);
  if (!supabase) return response;

  await supabase.auth.getUser();
  return response;
};

export const protectRoute = async (request: NextRequest, response: NextResponse = NextResponse.next()) => {
  const pathname = request.nextUrl.pathname;
  if (!isProtectedPath(pathname)) {
    return updateSession(request, response);
  }

  const supabase = createMiddlewareSupabaseClient(request, response);
  if (!supabase) return redirectToLogin(request, true);

  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) {
    return redirectToLogin(request);
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
