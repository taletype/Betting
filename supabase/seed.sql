insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'demo@bet.local',
  crypt('demo-password', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"display_name":"Demo Trader"}',
  now(),
  now(),
  '',
  '',
  '',
  ''
)
on conflict (id) do nothing;

insert into public.profiles (
  id,
  username,
  display_name,
  wallet_address
) values (
  '00000000-0000-4000-8000-000000000001',
  'demo-trader',
  'Demo Trader',
  null
)
on conflict (id) do update
set username = excluded.username,
    display_name = excluded.display_name,
    wallet_address = excluded.wallet_address,
    updated_at = now();

insert into public.markets (
  id,
  slug,
  title,
  description,
  status,
  collateral_currency,
  min_price,
  max_price,
  tick_size,
  close_time,
  resolve_time
) values
  (
    '11111111-1111-4111-8111-111111111111',
    'fed-cuts-before-year-end',
    'Will the Fed cut rates before year end?',
    'Development scaffold market for local trading flows.',
    'open',
    'USD',
    0,
    100,
    1,
    '2026-12-01T00:00:00.000Z',
    '2026-12-31T00:00:00.000Z'
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    'btc-above-120k-july',
    'Will BTC trade above $120k before July 31, 2026?',
    'Open crypto market for local order flow testing.',
    'open',
    'USD',
    0,
    100,
    1,
    '2026-07-31T00:00:00.000Z',
    '2026-08-01T00:00:00.000Z'
  ),
  (
    '77777777-7777-4777-8777-777777777777',
    'shanghai-rain-weekend',
    'Will Shanghai record rain this coming weekend?',
    'Weather-style market with a different prompt shape.',
    'open',
    'USD',
    0,
    100,
    1,
    '2026-04-25T00:00:00.000Z',
    '2026-04-27T00:00:00.000Z'
  )
on conflict (id) do update
set slug = excluded.slug,
    title = excluded.title,
    description = excluded.description,
    status = excluded.status,
    collateral_currency = excluded.collateral_currency,
    min_price = excluded.min_price,
    max_price = excluded.max_price,
    tick_size = excluded.tick_size,
    close_time = excluded.close_time,
    resolve_time = excluded.resolve_time,
    updated_at = now();

insert into public.outcomes (id, market_id, slug, title, outcome_index)
values
  ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'yes', 'Yes', 0),
  ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'no', 'No', 1),
  ('55555555-5555-4555-8555-555555555555', '44444444-4444-4444-8444-444444444444', 'yes', 'Yes', 0),
  ('66666666-6666-4666-8666-666666666666', '44444444-4444-4444-8444-444444444444', 'no', 'No', 1),
  ('88888888-8888-4888-8888-888888888888', '77777777-7777-4777-8777-777777777777', 'yes', 'Yes', 0),
  ('99999999-9999-4999-8999-999999999999', '77777777-7777-4777-8777-777777777777', 'no', 'No', 1)
on conflict (id) do update
set market_id = excluded.market_id,
    slug = excluded.slug,
    title = excluded.title,
    outcome_index = excluded.outcome_index;

insert into public.ledger_journals (
  id,
  journal_kind,
  reference,
  metadata,
  created_at
) values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'deposit',
  'seed:demo-user:initial-funds',
  '{"seed":"true","userId":"00000000-0000-4000-8000-000000000001"}',
  '2026-04-20T00:00:00.000Z'
)
on conflict (journal_kind, reference) do update
set metadata = excluded.metadata;

insert into public.ledger_entries (
  journal_id,
  account_code,
  direction,
  amount,
  currency,
  created_at
) values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'user:00000000-0000-4000-8000-000000000001:funds:available',
    'debit',
    100000,
    'USD',
    '2026-04-20T00:00:00.000Z'
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'platform:seed:cash',
    'credit',
    100000,
    'USD',
    '2026-04-20T00:00:00.000Z'
  )
on conflict do nothing;
