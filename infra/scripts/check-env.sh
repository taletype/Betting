#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${ENV_FILE:-}"
if [[ -z "$ENV_FILE" ]]; then
  if [[ -f .env.local ]]; then
    ENV_FILE=.env.local
  elif [[ -f .env ]]; then
    ENV_FILE=.env
  else
    ENV_FILE=.env.example
  fi
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ Could not find env file: $ENV_FILE"
  echo "Create .env.local from .env.example before starting services."
  exit 1
fi

required_commands=(pnpm node curl)
missing_commands=()
for cmd in "${required_commands[@]}"; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    missing_commands+=("$cmd")
  fi
done

if ((${#missing_commands[@]} > 0)); then
  echo "❌ Missing required commands: ${missing_commands[*]}"
  exit 1
fi

if ! command -v supabase >/dev/null 2>&1; then
  echo "⚠️  Supabase CLI is not installed."
  echo "    Install it from https://supabase.com/docs/guides/local-development/cli/getting-started"
fi

set -a
source "$ENV_FILE"
set +a

required_env_vars=(
  DATABASE_URL
  SUPABASE_DB_URL
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY
  SUPABASE_URL
  SUPABASE_ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY
  SUPABASE_JWT_SECRET
  API_BASE_URL
  ADMIN_API_TOKEN
)

missing_env_vars=()
placeholder_env_vars=()

for env_var in "${required_env_vars[@]}"; do
  value="${!env_var:-}"
  if [[ -z "$value" ]]; then
    missing_env_vars+=("$env_var")
    continue
  fi

  if [[ "$value" == "replace-me" || "$value" == "changeme" ]]; then
    placeholder_env_vars+=("$env_var")
  fi
done

echo "Using env file: $ENV_FILE"

if ((${#missing_env_vars[@]} > 0)); then
  echo "❌ Missing required env vars: ${missing_env_vars[*]}"
  echo "   Update $ENV_FILE and re-run this check."
  exit 1
fi

if ((${#placeholder_env_vars[@]} > 0)); then
  echo "❌ Placeholder values detected for: ${placeholder_env_vars[*]}"
  echo "   Set real local values in $ENV_FILE before running the stack."
  exit 1
fi

echo "✅ Environment checks passed."
