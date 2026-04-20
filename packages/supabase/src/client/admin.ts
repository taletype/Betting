import { createClient } from "@supabase/supabase-js";

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

export const createSupabaseAdminClient = () =>
  createClient(
    readRequiredUrl("SUPABASE_URL"),
    readRequired("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
