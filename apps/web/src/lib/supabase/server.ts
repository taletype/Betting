import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { createSupabaseServerClient } from "@bet/supabase/server";
import { isAdminRole } from "../../app/api/auth";

export interface CurrentUser {
  id: string;
  email: string | null;
  role: string;
  roles: string[];
}

const normalizeRoles = (roles: ReadonlyArray<string | null | undefined>): string[] =>
  Array.from(new Set(roles.map((role) => role?.trim()).filter((role): role is string => Boolean(role))));

const mapUser = (user: {
  id: string;
  email?: string | null;
  app_metadata?: Record<string, unknown>;
}): CurrentUser => {
  const primaryRole = typeof user.app_metadata?.role === "string" ? user.app_metadata.role : "user";
  const roleList = Array.isArray(user.app_metadata?.roles)
    ? user.app_metadata.roles.filter((role): role is string => typeof role === "string")
    : [];
  const roles = normalizeRoles([primaryRole, ...roleList]);
  return {
    id: user.id,
    email: user.email ?? null,
    role: roles[0] ?? "user",
    roles,
  };
};

export const createClient = async () => {
  const cookieStore = await cookies();
  return createSupabaseServerClient({
    get: (name) => cookieStore.get(name)?.value,
    set: (name, value, options) => cookieStore.set(name, value, options),
    remove: (name, options) => cookieStore.delete({ name, ...options }),
  });
};

export const getCurrentUser = async (): Promise<CurrentUser | null> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return mapUser(data.user);
  } catch {
    return null;
  }
};

export const requireCurrentUser = async (): Promise<CurrentUser> => {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
};

export const requireCurrentAdmin = async (): Promise<CurrentUser> => {
  const user = await requireCurrentUser();
  if (!user.roles.some(isAdminRole)) redirect("/account");
  return user;
};

export const getAuthReadiness = async () => {
  const user = await getCurrentUser();
  return {
    loggedIn: Boolean(user),
    user,
    tradeDisabledReason: user ? null : "需要登入後才可準備交易。",
  };
};