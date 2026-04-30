import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@bet/supabase";

export interface AuthenticatedUser {
  id: string;
  role?: string | null;
}

export class WebAuthError extends Error {
  readonly status: 401 | 403;

  constructor(message: string, status: 401 | 403) {
    super(message);
    this.name = "WebAuthError";
    this.status = status;
  }
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
  try {
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
  } catch {
    return null;
  }
};

export const getOptionalSupabaseUser = getAuthenticatedUser;

export const requireSupabaseUser = async (request: NextRequest): Promise<AuthenticatedUser> => {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    throw new WebAuthError("Authentication required", 401);
  }
  return user;
};

export const requireAdminUser = async (request: NextRequest): Promise<AuthenticatedUser> => {
  const user = await requireSupabaseUser(request);
  if (!isAdminRole(getUserRole(user))) {
    throw new WebAuthError("Admin privileges required", 403);
  }
  return user;
};

export const requireUserOwnsReferralCode = (
  userId: string,
  referralCode: { ownerUserId?: string | null },
): void => {
  if (!referralCode.ownerUserId || referralCode.ownerUserId !== userId) {
    throw new WebAuthError("Referral code ownership required", 403);
  }
};

export const requireUserOwnsWallet = (
  userId: string,
  wallet: { userId?: string | null; walletAddress?: string | null },
): void => {
  if (!wallet.userId || wallet.userId !== userId || !wallet.walletAddress) {
    throw new WebAuthError("Wallet ownership proof required", 403);
  }
};
