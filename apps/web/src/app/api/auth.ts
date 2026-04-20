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

export const resolveUserId = (options: {
  sessionUserId: string | null | undefined;
  requestHeaderUserId: string | null | undefined;
  allowDevHeaderOverride: boolean;
}): string | null => {
  if (options.sessionUserId) {
    return options.sessionUserId;
  }

  if (options.allowDevHeaderOverride && options.requestHeaderUserId) {
    return options.requestHeaderUserId;
  }

  return null;
};

export const isAdminRole = (role: string): boolean => role === "admin";

export const getUserRole = (user: AuthenticatedUser | null | undefined): string =>
  user?.role ?? "user";

export const getAuthenticatedUser = async (request: { headers: Headers }): Promise<AuthenticatedUser | null> => {
  const userId = request.headers.get(DEV_USER_HEADER);

  if (!userId) {
    return null;
  }

  return {
    id: userId,
    role: request.headers.get(DEV_USER_ROLE_HEADER),
  };
};

export const canUseDevHeaderOverride = (env: {
  nodeEnv: string | undefined;
  allowDevIdentityHeader: string | undefined;
}): boolean => env.nodeEnv !== "production" && env.allowDevIdentityHeader === "true";
