import { createSupabaseAdminClient } from "@bet/supabase/admin";

export interface AuthenticatedApiUser {
  id: string;
  email: string | null;
  role: string;
  roles?: string[];
  claims: Record<string, unknown>;
}

export class ApiAuthError extends Error {
  readonly status: 401 | 403 | 503;

  constructor(message: string, status: 401 | 403 | 503 = 401) {
    super(message);
    this.name = "ApiAuthError";
    this.status = status;
  }
}

type AuthVerifier = (request: Request) => Promise<AuthenticatedApiUser | null>;

let testAuthVerifier: AuthVerifier | null = null;
let supabaseAdminClient: ReturnType<typeof createSupabaseAdminClient> | null = null;

export const setApiAuthVerifierForTests = (verifier: AuthVerifier | null): void => {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("test auth verifier can only be configured when NODE_ENV is test");
  }
  testAuthVerifier = verifier;
};

const getBearerToken = (request: Request): string | null => {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  const token = authorization.slice("Bearer ".length).trim();
  return token || null;
};

const readRole = (claims: Record<string, unknown>): string => {
  return readRoles(claims)[0] ?? "user";
};

const readRoles = (claims: Record<string, unknown>): string[] => {
  const appMetadata = claims.app_metadata;
  const roles = new Set<string>();
  if (appMetadata && typeof appMetadata === "object" && "role" in appMetadata) {
    const role = (appMetadata as { role?: unknown }).role;
    if (typeof role === "string" && role.trim()) roles.add(role.trim());
  }
  if (appMetadata && typeof appMetadata === "object" && "roles" in appMetadata) {
    const metadataRoles = (appMetadata as { roles?: unknown }).roles;
    if (Array.isArray(metadataRoles)) {
      for (const role of metadataRoles) {
        if (typeof role === "string" && role.trim()) roles.add(role.trim());
      }
    }
  }

  const role = claims.role;
  if (typeof role === "string" && role.trim()) roles.add(role.trim());

  return Array.from(roles);
};

const adminRoles = new Set(["admin", "support", "finance_reviewer", "finance_approver", "trading_config_admin"]);

export const isApiAdminRole = (role: string): boolean => adminRoles.has(role);

export const isApiAdminUser = (user: AuthenticatedApiUser): boolean =>
  (user.roles?.length ? user.roles : [user.role]).some(isApiAdminRole);

export const getAuthenticatedUser = async (request: Request): Promise<AuthenticatedApiUser | null> => {
  if (process.env.NODE_ENV === "test" && testAuthVerifier) {
    return testAuthVerifier(request);
  }

  const bearerToken = getBearerToken(request);
  if (!bearerToken) {
    return null;
  }

  try {
    if (!supabaseAdminClient) {
      supabaseAdminClient = createSupabaseAdminClient();
    }

    const { data, error } = await supabaseAdminClient.auth.getUser(bearerToken);
    if (error || !data.user) {
      return null;
    }

    const claims = {
      ...data.user.user_metadata,
      app_metadata: data.user.app_metadata,
    };

    return {
      id: data.user.id,
      email: data.user.email ?? null,
      role: readRole(claims),
      roles: readRoles(claims),
      claims,
    };
  } catch (error) {
    if (error instanceof Error && /SUPABASE_/.test(error.message)) {
      throw new ApiAuthError("authentication service is not configured", 503);
    }
    return null;
  }
};

export const requireAuthenticatedUser = async (request: Request): Promise<AuthenticatedApiUser> => {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    throw new ApiAuthError("authentication required", 401);
  }
  return user;
};

export const getOptionalSupabaseUser = getAuthenticatedUser;

export const requireSupabaseUser = requireAuthenticatedUser;

export const requireAdminUser = async (request: Request): Promise<AuthenticatedApiUser> => {
  const user = await requireAuthenticatedUser(request);
  if (!isApiAdminUser(user)) {
    throw new ApiAuthError("admin authorization required", 403);
  }
  return user;
};

export const requireUserOwnsReferralCode = async (
  userId: string,
  referralCode: { ownerUserId?: string | null },
): Promise<void> => {
  if (!referralCode.ownerUserId || referralCode.ownerUserId !== userId) {
    throw new ApiAuthError("referral code ownership required", 403);
  }
};

export const requireUserOwnsWallet = async (
  userId: string,
  wallet: { userId?: string | null; walletAddress?: string | null },
): Promise<void> => {
  if (!wallet.userId || wallet.userId !== userId || !wallet.walletAddress) {
    throw new ApiAuthError("wallet ownership proof required", 403);
  }
};

export const assertCommandAllowedForUser = async (request: Request): Promise<AuthenticatedApiUser> =>
  requireAuthenticatedUser(request);

export const assertAdminCommandAllowed = async (request: Request): Promise<AuthenticatedApiUser> =>
  requireAdminUser(request);

export const requireServiceAuthForInternalJobs = async (request: Request): Promise<AuthenticatedApiUser> =>
  requireAdminUser(request);
