import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@bet/supabase";

export interface AuthenticatedUser {
  id: string;
  role?: string | null;
}

export interface AdminAccessDecision {
  ok: boolean;
  status?: 401 | 403;
  error?: string;
}

export const isAdminRole = (role: string): boolean => role === "admin";

export const getUserRole = (user: AuthenticatedUser | null | undefined): string => user?.role ?? "user";

const mapSupabaseUser = (user: { id: string; app_metadata?: Record<string, unknown> } | null): AuthenticatedUser | null => {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    role: typeof user.app_metadata?.role === "string" ? user.app_metadata.role : null,
  };
};

export const resolveAuthenticatedUser = (options: {
  sessionUser: AuthenticatedUser | null;
}): AuthenticatedUser | null => options.sessionUser;

export const evaluateAdminAccess = (user: AuthenticatedUser | null): AdminAccessDecision => {
  if (!user) {
    return { ok: false, status: 401, error: "Authentication required" };
  }

  if (!isAdminRole(getUserRole(user))) {
    return { ok: false, status: 403, error: "Admin privileges required" };
  }

  return { ok: true };
};

export const getAuthenticatedUser = async (request: NextRequest): Promise<AuthenticatedUser | null> => {
  const supabase = createSupabaseServerClient({
    get: (name) => request.cookies.get(name)?.value,
  });

  const { data, error } = await supabase.auth.getUser();
  if (error) {
    return null;
  }

  return resolveAuthenticatedUser({
    sessionUser: mapSupabaseUser(data.user),
  });
};
