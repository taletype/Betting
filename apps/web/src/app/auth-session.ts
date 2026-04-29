import { cookies } from "next/headers";

import { createSupabaseServerClient } from "@bet/supabase";

export interface WebSessionUser {
  id: string;
  email: string | null;
  role: string;
}

export const getCurrentWebUser = async (): Promise<WebSessionUser | null> => {
  try {
    const cookieStore = await cookies();
    const supabase = createSupabaseServerClient({
      get: (name) => cookieStore.get(name)?.value,
    });
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return {
      id: data.user.id,
      email: data.user.email ?? null,
      role: typeof data.user.app_metadata.role === "string" ? data.user.app_metadata.role : "user",
    };
  } catch {
    return null;
  }
};
