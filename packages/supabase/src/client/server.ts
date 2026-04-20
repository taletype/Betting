import { createServerClient } from "@supabase/ssr";

export interface CookieAdapter {
  get(name: string): string | undefined;
  set?(name: string, value: string, options: Record<string, unknown>): void;
  remove?(name: string, options: Record<string, unknown>): void;
}

const readRequired = (name: string): string => {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required. Set ${name} in your environment.`);
  }

  if (value === "replace-me" || value === "changeme") {
    throw new Error(`${name} cannot be a placeholder value`);
  }

  return value;
};

const readRequiredUrl = (name: string): string => {
  const value = readRequired(name);

  try {
    // eslint-disable-next-line no-new
    new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL. Received: ${value}`);
  }

  return value;
};

export const createSupabaseServerClient = (cookies: CookieAdapter) =>
  createServerClient(
    readRequiredUrl("NEXT_PUBLIC_SUPABASE_URL"),
    readRequired("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        get: (name: string) => cookies.get(name),
        set: (name: string, value: string, options: Record<string, unknown>) =>
          cookies.set?.(name, value, options),
        remove: (name: string, options: Record<string, unknown>) => cookies.remove?.(name, options),
      },
    },
  );
