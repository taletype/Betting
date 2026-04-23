alter table public.external_trade_ticks
  add column if not exists source text,
  add column if not exists raw_json jsonb not null default '{}'::jsonb,
  add column if not exists price_ppm bigint,
  add column if not exists size_atoms bigint,
  add column if not exists executed_at timestamptz;

update public.external_trade_ticks as trade_ticks
set
  source = coalesce(trade_ticks.source, markets.source),
  raw_json = case
    when trade_ticks.raw_json = '{}'::jsonb then coalesce(trade_ticks.raw_payload, '{}'::jsonb)
    else trade_ticks.raw_json
  end,
  price_ppm = coalesce(trade_ticks.price_ppm, round(trade_ticks.price * 1000000)::bigint),
  size_atoms = coalesce(
    trade_ticks.size_atoms,
    case when trade_ticks.size is null then null else round(trade_ticks.size * 1000000)::bigint end
  ),
  executed_at = coalesce(trade_ticks.executed_at, trade_ticks.traded_at)
from public.external_markets as markets
where markets.id = trade_ticks.external_market_id
  and (
    trade_ticks.source is null
    or trade_ticks.price_ppm is null
    or trade_ticks.executed_at is null
    or trade_ticks.raw_json = '{}'::jsonb
    or (trade_ticks.size is not null and trade_ticks.size_atoms is null)
  );

alter table public.external_trade_ticks
  alter column source set not null,
  alter column raw_json set not null,
  alter column price_ppm set not null,
  alter column executed_at set not null;

alter table public.external_trade_ticks
  drop constraint if exists external_trade_ticks_source_check;

alter table public.external_trade_ticks
  add constraint external_trade_ticks_source_check check (source in ('polymarket', 'kalshi'));

create index if not exists external_trade_ticks_market_executed_at_idx
  on public.external_trade_ticks (external_market_id, executed_at desc);
