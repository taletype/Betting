import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@bet/supabase/server";
import { isAdminRole } from "../../app/api/auth";
import { pathSegmentToLocale } from "../locale";
import { hasPublicSupabaseConfig } from "./config";

const adminPrefix = "/admin";

const stripLocalePrefix = (pathname: string): string => {
  const segments = pathname.split("/").filter(Boolean);
  if (pathSegmentToLocale(segments[0])) {
    return `/${segments.slice(1).join("/")}` || "/";
  }
  return pathname;
};

const isAdminPath = (pathname: string): boolean =>
  pathname === adminPrefix || pathname.startsWith(`${adminPrefix}/`);

const isProtectedPath = (pathname: string): boolean => {
  const normalizedPath = stripLocalePrefix(pathname);
  return (
    normalizedPath === "/account" ||
    normalizedPath.startsWith("/account/") ||
    normalizedPath === "/rewards" ||
    normalizedPath.startsWith("/rewards/") ||
    isAdminPath(normalizedPath)
  );
};

const createMiddlewareSupabaseClient = (request: NextRequest, response: NextResponse) => {
  if (!hasPublicSupabaseConfig()) return null;

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
  const pathname = stripLocalePrefix(request.nextUrl.pathname);
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

  const roles = [
    typeof user.app_metadata?.role === "string" ? user.app_metadata.role : null,
    ...(Array.isArray(user.app_metadata?.roles)
      ? user.app_metadata.roles.filter((role): role is string => typeof role === "string")
      : []),
  ].filter((role): role is string => Boolean(role));
  if (isAdminPath(pathname) && !roles.some(isAdminRole)) {
    const accountUrl = request.nextUrl.clone();
    accountUrl.pathname = "/account";
    accountUrl.searchParams.set("auth", "forbidden");
    return NextResponse.redirect(accountUrl);
  }

  return response;
};
