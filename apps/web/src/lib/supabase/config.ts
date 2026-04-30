const placeholderValues = new Set(["replace-me", "changeme"]);

export const publicSupabaseConfigKeys = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

export const hasPublicSupabaseConfig = (): boolean =>
  publicSupabaseConfigKeys.every((name) => {
    const value = process.env[name]?.trim();
    return Boolean(value && !placeholderValues.has(value));
  });

export const isPublicSupabaseConfigError = (error: unknown): boolean =>
  error instanceof Error &&
  publicSupabaseConfigKeys.some((name) => error.message.includes(name));
