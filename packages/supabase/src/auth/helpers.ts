import type { User } from "@supabase/supabase-js";

export const requireUser = (user: User | null | undefined): User => {
  if (!user) {
    throw new Error("Authenticated user is required");
  }

  return user;
};

export const getUserRole = (user: User | null | undefined): string =>
  (user?.app_metadata.role as string | undefined) ?? "user";
