create table if not exists public.idempotency_requests (
  scope text not null,
  idempotency_key text not null,
  request_hash text not null,
  response_status integer not null default 0,
  response_body jsonb not null default '{}'::jsonb,
  replay_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (scope, idempotency_key)
);

alter table public.idempotency_requests enable row level security;
