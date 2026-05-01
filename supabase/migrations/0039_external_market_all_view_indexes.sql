create index if not exists idx_external_market_cache_source_status
  on public.external_market_cache(source, resolution_status);

create index if not exists idx_external_market_cache_source_volume
  on public.external_market_cache(source, volume desc nulls last);

create index if not exists idx_external_market_cache_source_close_time
  on public.external_market_cache(source, close_time asc nulls last);

create index if not exists idx_external_market_cache_source_last_synced
  on public.external_market_cache(source, last_synced_at desc nulls last);

create index if not exists idx_external_market_cache_source_slug
  on public.external_market_cache(source, slug);
