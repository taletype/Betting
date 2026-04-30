import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { createSupabaseServerClient } from "@bet/supabase/server";

export interface CurrentUser {
  id: string;
  email: string | null;
  role: string;
}

const mapUser = (user: {
  id: string;
  email?: string | null;
  app_metadata?: Record<string, unknown>;
}): CurrentUser => ({
  id: user.id,
  email: user.email ?? null,
  role: typeof user.app_metadata?.role === "string" ? user.app_metadata.role : "user",
});

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
  if (user.role !== "admin") redirect("/account");
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
