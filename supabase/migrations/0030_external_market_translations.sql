create table if not exists public.external_market_translations (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  external_id text not null,
  locale text not null,
  title_translated text,
  description_translated text,
  outcomes_translated jsonb,
  status text not null default 'pending',
  provider text,
  model text,
  source_content_hash text not null,
  error_code text,
  error_message text,
  translated_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint external_market_translations_status_check
    check (status in ('pending', 'translated', 'reviewed', 'failed', 'stale', 'skipped'))
);

create unique index if not exists external_market_translations_source_external_locale_idx
  on public.external_market_translations (source, external_id, locale);

create index if not exists external_market_translations_status_locale_idx
  on public.external_market_translations (status, locale);

alter table public.external_market_translations enable row level security;

drop policy if exists "service role can manage external market translations" on public.external_market_translations;
create policy "service role can manage external market translations"
  on public.external_market_translations
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
