insert into public.markets (
  id,
  slug,
  title,
  description,
  status,
  collateral_currency,
  min_price,
  max_price,
  tick_size
) values (
  '11111111-1111-4111-8111-111111111111',
  'fed-cuts-before-year-end',
  'Will the Fed cut rates before year end?',
  'Development scaffold market.',
  'open',
  'USD',
  0,
  100,
  1
)
on conflict (id) do nothing;

insert into public.outcomes (id, market_id, slug, title, outcome_index)
values
  ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'yes', 'Yes', 0),
  ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'no', 'No', 1)
on conflict (id) do nothing;
