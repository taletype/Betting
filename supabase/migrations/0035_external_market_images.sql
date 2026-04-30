alter table public.external_markets
  add column if not exists image_url text,
  add column if not exists icon_url text,
  add column if not exists image_source_url text,
  add column if not exists image_updated_at timestamptz;

alter table public.external_market_cache
  add column if not exists image_url text,
  add column if not exists icon_url text,
  add column if not exists image_source_url text,
  add column if not exists image_updated_at timestamptz;
