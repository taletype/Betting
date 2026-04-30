create table if not exists public.ambassador_risk_flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  referral_attribution_id uuid references public.referral_attributions (id) on delete set null,
  trade_attribution_id uuid references public.builder_trade_attributions (id) on delete set null,
  payout_id uuid references public.ambassador_reward_payouts (id) on delete set null,
  severity text not null check (severity in ('low', 'medium', 'high')),
  reason_code text not null,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  constraint ambassador_risk_flags_reviewed_state check (
    (status = 'open' and reviewed_at is null)
    or (status in ('reviewed', 'dismissed') and reviewed_at is not null)
  )
);

create index if not exists ambassador_risk_flags_status_severity_idx
  on public.ambassador_risk_flags (status, severity, created_at desc);

create index if not exists ambassador_risk_flags_user_idx
  on public.ambassador_risk_flags (user_id, created_at desc);

alter table public.ambassador_risk_flags enable row level security;
