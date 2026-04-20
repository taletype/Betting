export interface AuthContext {
  userId: string;
  role: string;
}

export const DEV_USER_HEADER = "x-user-id";

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

export const canUseDevHeaderOverride = (env: {
  nodeEnv: string | undefined;
  allowDevIdentityHeader: string | undefined;
}): boolean => env.nodeEnv !== "production" && env.allowDevIdentityHeader === "true";
