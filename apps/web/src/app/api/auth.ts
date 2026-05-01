import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@bet/supabase/server";

export interface AuthenticatedUser {
  id: string;
  role?: string | null;
  roles?: string[];
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

export type AdminRole =
  | "admin"
  | "support"
  | "finance_reviewer"
  | "finance_approver"
  | "trading_config_admin";

export type AdminPermission =
  | "admin:read"
  | "polymarket:read"
  | "withdrawal:read"
  | "ambassador_code:manage"
  | "referral_attribution:override"
  | "builder_trade_attribution:record"
  | "reward_ledger:review"
  | "payout:approve"
  | "payout:mark_paid"
  | "payout:close";

const adminRoles = new Set<AdminRole>([
  "admin",
  "support",
  "finance_reviewer",
  "finance_approver",
  "trading_config_admin",
]);

const adminPermissionRoles: Record<AdminPermission, readonly AdminRole[]> = {
  "admin:read": ["admin", "support", "finance_reviewer", "finance_approver", "trading_config_admin"],
  "polymarket:read": ["admin", "support", "trading_config_admin"],
  "withdrawal:read": ["admin", "finance_reviewer", "finance_approver"],
  "ambassador_code:manage": ["admin"],
  "referral_attribution:override": ["admin", "finance_approver"],
  "builder_trade_attribution:record": ["admin", "trading_config_admin"],
  "reward_ledger:review": ["admin", "finance_reviewer", "finance_approver"],
  "payout:approve": ["admin", "finance_approver"],
  "payout:mark_paid": ["admin", "finance_approver"],
  "payout:close": ["admin", "finance_reviewer", "finance_approver"],
};

const normalizeRoles = (roles: ReadonlyArray<string | null | undefined>): string[] =>
  Array.from(new Set(roles.map((role) => role?.trim()).filter((role): role is string => Boolean(role))));

const rolesFromMetadata = (metadata: Record<string, unknown> | undefined): string[] => {
  const primaryRole = typeof metadata?.role === "string" ? metadata.role : null;
  const roleList = Array.isArray(metadata?.roles)
    ? metadata.roles.filter((role): role is string => typeof role === "string")
    : [];
  return normalizeRoles([primaryRole, ...roleList]);
};

export const isAdminRole = (role: string): boolean => adminRoles.has(role as AdminRole);

export const getUserRoles = (user: AuthenticatedUser | null | undefined): string[] =>
  normalizeRoles(user?.roles?.length ? user.roles : [user?.role ?? "user"]);

export const getUserRole = (user: AuthenticatedUser | null | undefined): string => getUserRoles(user)[0] ?? "user";

const mapSupabaseUser = (user: { id: string; app_metadata?: Record<string, unknown> } | null): AuthenticatedUser | null => {
  if (!user) {
    return null;
  }

  const roles = rolesFromMetadata(user.app_metadata);

  return {
    id: user.id,
    role: roles[0] ?? null,
    roles,
  };
};

export const resolveAuthenticatedUser = (options: {
  sessionUser: AuthenticatedUser | null;
}): AuthenticatedUser | null => options.sessionUser;

export const evaluateAdminAccess = (user: AuthenticatedUser | null): AdminAccessDecision => {
  if (!user) {
    return { ok: false, status: 401, error: "Authentication required" };
  }

  if (!getUserRoles(user).some(isAdminRole)) {
    return { ok: false, status: 403, error: "Admin privileges required" };
  }

  return { ok: true };
};

export const evaluateAdminPermission = (
  user: AuthenticatedUser | null,
  permission: AdminPermission,
): AdminAccessDecision => {
  const adminAccess = evaluateAdminAccess(user);
  if (!adminAccess.ok) return adminAccess;

  const roles = getUserRoles(user);
  if (roles.includes("admin")) return { ok: true };
  if (roles.some((role) => adminPermissionRoles[permission].includes(role as AdminRole))) return { ok: true };
  return { ok: false, status: 403, error: "Admin privileges required" };
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
  if (!getUserRoles(user).some(isAdminRole)) {
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
