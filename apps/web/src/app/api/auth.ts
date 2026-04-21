import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@bet/supabase";

export interface AuthContext {
  userId: string;
  role: string;
}

export interface AuthenticatedUser {
  id: string;
  role?: string | null;
}

export const DEV_USER_HEADER = "x-user-id";
export const DEV_USER_ROLE_HEADER = "x-user-role";

export const isAdminRole = (role: string): boolean => role === "admin";

export const getUserRole = (user: AuthenticatedUser | null | undefined): string => user?.role ?? "user";

export const canUseDevHeaderOverride = (env: {
  nodeEnv: string | undefined;
  allowDevIdentityHeader: string | undefined;
}): boolean => env.nodeEnv !== "production" && env.allowDevIdentityHeader === "true";

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
  requestHeaderUserId: string | null | undefined;
  requestHeaderRole: string | null | undefined;
  allowDevHeaderOverride: boolean;
}): AuthenticatedUser | null => {
  if (options.sessionUser) {
    return options.sessionUser;
  }

  if (options.allowDevHeaderOverride && options.requestHeaderUserId) {
    return {
      id: options.requestHeaderUserId,
      role: options.requestHeaderRole,
    };
  }

  return null;
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
    requestHeaderUserId: request.headers.get(DEV_USER_HEADER),
    requestHeaderRole: request.headers.get(DEV_USER_ROLE_HEADER),
    allowDevHeaderOverride: canUseDevHeaderOverride({
      nodeEnv: process.env.NODE_ENV,
      allowDevIdentityHeader: process.env.ALLOW_DEV_IDENTITY_HEADER,
    }),
  });
};
