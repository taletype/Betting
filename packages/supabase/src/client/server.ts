import { createServerClient } from "@supabase/ssr";

export interface CookieAdapter {
  get(name: string): string | undefined;
  set?(name: string, value: string, options: Record<string, unknown>): void;
  remove?(name: string, options: Record<string, unknown>): void;
}

export const createSupabaseServerClient = (cookies: CookieAdapter) =>
  createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        get: (name: string) => cookies.get(name),
        set: (name: string, value: string, options: Record<string, unknown>) =>
          cookies.set?.(name, value, options),
        remove: (name: string, options: Record<string, unknown>) => cookies.remove?.(name, options),
      },
    },
  );
