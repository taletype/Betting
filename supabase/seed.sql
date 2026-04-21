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
  '00000000-0000-4000-8000-000000000002',
  'authenticated',
  'authenticated',
  'integration@bet.local',
  crypt('integration-password', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"display_name":"Integration Trader"}',
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

insert into public.profiles (
  id,
  username,
  display_name,
  wallet_address
) values (
  '00000000-0000-4000-8000-000000000002',
  'integration-trader',
  'Integration Trader',
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

insert into public.ledger_journals (
  id,
  journal_kind,
  reference,
  metadata,
  created_at
) values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'deposit',
  'seed:integration-user:initial-funds',
  '{"seed":"true","userId":"00000000-0000-4000-8000-000000000002"}',
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
    250000000,
    'USD',
    '2026-04-20T00:00:00.000Z'
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'platform:seed:cash',
    'credit',
    250000000,
    'USD',
    '2026-04-20T00:00:00.000Z'
  )
on conflict do nothing;

insert into public.ledger_entries (
  journal_id,
  account_code,
  direction,
  amount,
  currency,
  created_at
) values
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'user:00000000-0000-4000-8000-000000000002:funds:available',
    'debit',
    250000000,
    'USD',
    '2026-04-20T00:00:00.000Z'
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'platform:seed:cash',
    'credit',
    250000000,
    'USD',
    '2026-04-20T00:00:00.000Z'
  )
on conflict do nothing;

-- Demo density pass: add seeded records so key pages render with realistic non-empty states.

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
    '12121212-1212-4121-8121-121212121212',
    'ai-chips-shortage-q4-2026',
    'Will there be a major AI chip shortage call before Q4 2026 earnings?',
    'Sector sentiment market used for demo depth and trade-history views.',
    'open',
    'USD',
    0,
    100,
    1,
    '2026-10-15T00:00:00.000Z',
    '2026-10-20T00:00:00.000Z'
  ),
  (
    '13131313-1313-4131-8131-131313131313',
    'nyc-marathon-rain-2025',
    'Did NYC Marathon day record measurable rain in 2025?',
    'Resolved weather market included for claims/history screenshots.',
    'resolved',
    'USD',
    0,
    100,
    1,
    '2025-11-02T00:00:00.000Z',
    '2025-11-03T00:00:00.000Z'
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
  ('12121212-2222-4222-8222-222222222222', '12121212-1212-4121-8121-121212121212', 'yes', 'Yes', 0),
  ('12121212-3333-4333-8333-333333333333', '12121212-1212-4121-8121-121212121212', 'no', 'No', 1),
  ('13131313-2222-4222-8222-222222222222', '13131313-1313-4131-8131-131313131313', 'yes', 'Yes', 0),
  ('13131313-3333-4333-8333-333333333333', '13131313-1313-4131-8131-131313131313', 'no', 'No', 1)
on conflict (id) do update
set market_id = excluded.market_id,
    slug = excluded.slug,
    title = excluded.title,
    outcome_index = excluded.outcome_index;

insert into public.resolutions (
  id,
  market_id,
  status,
  winning_outcome_id,
  evidence_url,
  notes,
  resolved_at,
  created_at,
  updated_at
) values (
  '13131313-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '13131313-1313-4131-8131-131313131313',
  'finalized',
  '13131313-3333-4333-8333-333333333333',
  'https://www.weather.gov/',
  'Seeded demo resolution for launch drill UI density.',
  '2025-11-03T14:00:00.000Z',
  '2025-11-03T14:00:00.000Z',
  '2025-11-03T14:00:00.000Z'
)
on conflict (market_id) do update
set status = excluded.status,
    winning_outcome_id = excluded.winning_outcome_id,
    evidence_url = excluded.evidence_url,
    notes = excluded.notes,
    resolved_at = excluded.resolved_at,
    updated_at = now();

insert into public.orders (
  id,
  user_id,
  market_id,
  outcome_id,
  side,
  order_type,
  status,
  price,
  quantity,
  remaining_quantity,
  reserved_amount,
  client_order_id,
  created_at,
  updated_at
) values
  ('aaaaaaaa-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'buy', 'limit', 'open', 58, 120, 120, 6960, 'seed-open-buy-fed-1', '2026-04-20T01:05:00.000Z', '2026-04-20T01:05:00.000Z'),
  ('aaaaaaaa-2222-4222-8222-222222222222', '00000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', 'sell', 'limit', 'partially_filled', 45, 90, 40, 1800, 'seed-open-sell-fed-1', '2026-04-20T01:06:00.000Z', '2026-04-20T01:20:00.000Z'),
  ('aaaaaaaa-3333-4333-8333-333333333333', '00000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', 'buy', 'limit', 'filled', 45, 50, 0, 0, 'seed-fill-buy-fed-1', '2026-04-20T01:07:00.000Z', '2026-04-20T01:20:00.000Z'),
  ('aaaaaaaa-4444-4444-8444-444444444444', '00000000-0000-4000-8000-000000000002', '44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555', 'sell', 'limit', 'open', 67, 150, 150, 10050, 'seed-open-sell-btc-1', '2026-04-20T02:00:00.000Z', '2026-04-20T02:00:00.000Z'),
  ('aaaaaaaa-5555-4555-8555-555555555555', '00000000-0000-4000-8000-000000000001', '44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555', 'buy', 'limit', 'filled', 67, 60, 0, 0, 'seed-fill-buy-btc-1', '2026-04-20T02:03:00.000Z', '2026-04-20T02:05:00.000Z'),
  ('aaaaaaaa-6666-4666-8666-666666666666', '00000000-0000-4000-8000-000000000002', '12121212-1212-4121-8121-121212121212', '12121212-2222-4222-8222-222222222222', 'buy', 'limit', 'open', 41, 200, 200, 8200, 'seed-open-buy-ai-1', '2026-04-20T03:00:00.000Z', '2026-04-20T03:00:00.000Z'),
  ('aaaaaaaa-7777-4777-8777-777777777777', '00000000-0000-4000-8000-000000000001', '12121212-1212-4121-8121-121212121212', '12121212-3333-4333-8333-333333333333', 'sell', 'limit', 'open', 62, 180, 180, 11160, 'seed-open-sell-ai-1', '2026-04-20T03:04:00.000Z', '2026-04-20T03:04:00.000Z'),
  ('aaaaaaaa-8888-4888-8888-888888888888', '00000000-0000-4000-8000-000000000002', '77777777-7777-4777-8777-777777777777', '88888888-8888-4888-8888-888888888888', 'buy', 'limit', 'open', 53, 140, 140, 7420, 'seed-open-buy-rain-1', '2026-04-20T03:20:00.000Z', '2026-04-20T03:20:00.000Z'),
  ('aaaaaaaa-9999-4999-8999-999999999999', '00000000-0000-4000-8000-000000000001', '77777777-7777-4777-8777-777777777777', '88888888-8888-4888-8888-888888888888', 'sell', 'limit', 'partially_filled', 54, 120, 80, 4320, 'seed-open-sell-rain-1', '2026-04-20T03:21:00.000Z', '2026-04-20T03:28:00.000Z')
on conflict (id) do update
set status = excluded.status,
    price = excluded.price,
    quantity = excluded.quantity,
    remaining_quantity = excluded.remaining_quantity,
    reserved_amount = excluded.reserved_amount,
    updated_at = excluded.updated_at;

insert into public.trades (
  id,
  market_id,
  outcome_id,
  maker_order_id,
  taker_order_id,
  maker_user_id,
  taker_user_id,
  price,
  quantity,
  notional,
  sequence,
  matched_at
) values
  ('bbbbbbbb-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', 'aaaaaaaa-2222-4222-8222-222222222222', 'aaaaaaaa-3333-4333-8333-333333333333', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 45, 50, 2250, 1, '2026-04-20T01:20:00.000Z'),
  ('bbbbbbbb-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555', 'aaaaaaaa-4444-4444-8444-444444444444', 'aaaaaaaa-5555-4555-8555-555555555555', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 67, 60, 4020, 1, '2026-04-20T02:05:00.000Z'),
  ('bbbbbbbb-3333-4333-8333-333333333333', '77777777-7777-4777-8777-777777777777', '88888888-8888-4888-8888-888888888888', 'aaaaaaaa-9999-4999-8999-999999999999', 'aaaaaaaa-8888-4888-8888-888888888888', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 54, 40, 2160, 1, '2026-04-20T03:28:00.000Z')
on conflict (id) do update
set price = excluded.price,
    quantity = excluded.quantity,
    notional = excluded.notional,
    sequence = excluded.sequence,
    matched_at = excluded.matched_at;

insert into public.positions (
  id,
  user_id,
  market_id,
  outcome_id,
  net_quantity,
  average_entry_price,
  realized_pnl,
  updated_at
) values
  ('cccccccc-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', -50, 45, 0, '2026-04-20T01:20:00.000Z'),
  ('cccccccc-2222-4222-8222-222222222222', '00000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', 50, 45, 0, '2026-04-20T01:20:00.000Z'),
  ('cccccccc-3333-4333-8333-333333333333', '00000000-0000-4000-8000-000000000001', '44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555', 60, 67, 0, '2026-04-20T02:05:00.000Z'),
  ('cccccccc-4444-4444-8444-444444444444', '00000000-0000-4000-8000-000000000001', '77777777-7777-4777-8777-777777777777', '88888888-8888-4888-8888-888888888888', -40, 54, 0, '2026-04-20T03:28:00.000Z'),
  ('cccccccc-5555-4555-8555-555555555555', '00000000-0000-4000-8000-000000000002', '77777777-7777-4777-8777-777777777777', '88888888-8888-4888-8888-888888888888', 40, 54, 0, '2026-04-20T03:28:00.000Z')
on conflict (user_id, market_id, outcome_id) do update
set net_quantity = excluded.net_quantity,
    average_entry_price = excluded.average_entry_price,
    realized_pnl = excluded.realized_pnl,
    updated_at = excluded.updated_at;

insert into public.claims (
  id,
  user_id,
  market_id,
  resolution_id,
  claimable_amount,
  claimed_amount,
  status,
  created_at,
  updated_at
) values
  ('dddddddd-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000001', '13131313-1313-4131-8131-131313131313', '13131313-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 3200000, 3200000, 'claimed', '2025-11-03T14:10:00.000Z', '2025-11-03T14:12:00.000Z'),
  ('dddddddd-2222-4222-8222-222222222222', '00000000-0000-4000-8000-000000000002', '13131313-1313-4131-8131-131313131313', '13131313-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 900000, 0, 'claimable', '2025-11-03T14:10:00.000Z', '2025-11-03T14:10:00.000Z')
on conflict (id) do update
set claimable_amount = excluded.claimable_amount,
    claimed_amount = excluded.claimed_amount,
    status = excluded.status,
    updated_at = excluded.updated_at;

insert into public.linked_wallets (
  id,
  user_id,
  chain,
  wallet_address,
  signature,
  signed_message,
  verified_at,
  metadata,
  created_at,
  updated_at
) values (
  'eeeeeeee-1111-4111-8111-111111111111',
  '00000000-0000-4000-8000-000000000001',
  'base',
  '0x1111111111111111111111111111111111110111',
  '0xseeded-signature',
  'Bet wallet link\nuser:00000000-0000-4000-8000-000000000001\nnonce:seed',
  '2026-04-20T00:20:00.000Z',
  '{"seed":"true"}'::jsonb,
  '2026-04-20T00:20:00.000Z',
  '2026-04-20T00:20:00.000Z'
)
on conflict (user_id) do update
set wallet_address = excluded.wallet_address,
    signature = excluded.signature,
    signed_message = excluded.signed_message,
    verified_at = excluded.verified_at,
    metadata = excluded.metadata,
    updated_at = excluded.updated_at;

insert into public.ledger_journals (id, journal_kind, reference, metadata, created_at)
values
  ('ffffffff-1111-4111-8111-111111111111', 'deposit_confirmed', 'seed:demo:base:deposit-1', '{"seed":"true"}'::jsonb, '2026-04-20T00:30:00.000Z'),
  ('ffffffff-2222-4222-8222-222222222222', 'deposit_confirmed', 'seed:demo:base:deposit-2', '{"seed":"true"}'::jsonb, '2026-04-20T00:40:00.000Z'),
  ('ffffffff-3333-4333-8333-333333333333', 'deposit_confirmed', 'seed:integration:base:deposit-1', '{"seed":"true"}'::jsonb, '2026-04-20T00:50:00.000Z'),
  ('ffffffff-4444-4444-8444-444444444444', 'withdrawal_requested', 'seed:demo:withdrawal:req-1', '{"seed":"true"}'::jsonb, '2026-04-20T04:00:00.000Z'),
  ('ffffffff-5555-4555-8555-555555555555', 'withdrawal_requested', 'seed:demo:withdrawal:req-2', '{"seed":"true"}'::jsonb, '2026-04-20T04:10:00.000Z'),
  ('ffffffff-6666-4666-8666-666666666666', 'withdrawal_completed', 'seed:demo:withdrawal:completed-2', '{"seed":"true"}'::jsonb, '2026-04-20T04:15:00.000Z'),
  ('ffffffff-7777-4777-8777-777777777777', 'withdrawal_requested', 'seed:demo:withdrawal:req-3', '{"seed":"true"}'::jsonb, '2026-04-20T04:20:00.000Z'),
  ('ffffffff-8888-4888-8888-888888888888', 'withdrawal_failed', 'seed:demo:withdrawal:failed-3', '{"seed":"true"}'::jsonb, '2026-04-20T04:22:00.000Z')
on conflict (journal_kind, reference) do update
set metadata = excluded.metadata;

insert into public.chain_deposits (
  id,
  user_id,
  chain,
  tx_hash,
  tx_sender,
  tx_recipient,
  token_address,
  amount,
  currency,
  block_number,
  tx_status,
  journal_id,
  metadata,
  created_at,
  verified_at
) values
  ('abababab-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000001', 'base', '0x1111aaaabbbbccccddddeeeeffff000011112222333344445555666677778888', '0x1111111111111111111111111111111111110111', '0x2222222222222222222222222222222222220222', '0x3333333333333333333333333333333333330333', 25000000, 'USDC', 12345001, 'confirmed', 'ffffffff-1111-4111-8111-111111111111', '{"seed":"true"}'::jsonb, '2026-04-20T00:30:00.000Z', '2026-04-20T00:30:00.000Z'),
  ('abababab-2222-4222-8222-222222222222', '00000000-0000-4000-8000-000000000001', 'base', '0x9999aaaabbbbccccddddeeeeffff000011112222333344445555666677778888', '0x1111111111111111111111111111111111110111', '0x2222222222222222222222222222222222220222', '0x3333333333333333333333333333333333330333', 18000000, 'USDC', 12345022, 'confirmed', 'ffffffff-2222-4222-8222-222222222222', '{"seed":"true"}'::jsonb, '2026-04-20T00:40:00.000Z', '2026-04-20T00:40:00.000Z'),
  ('abababab-3333-4333-8333-333333333333', '00000000-0000-4000-8000-000000000002', 'base', '0x7777aaaabbbbccccddddeeeeffff000011112222333344445555666677778888', '0x4444444444444444444444444444444444440444', '0x2222222222222222222222222222222222220222', '0x3333333333333333333333333333333333330333', 12000000, 'USDC', 12345044, 'confirmed', 'ffffffff-3333-4333-8333-333333333333', '{"seed":"true"}'::jsonb, '2026-04-20T00:50:00.000Z', '2026-04-20T00:50:00.000Z')
on conflict (chain, tx_hash) do update
set amount = excluded.amount,
    tx_status = excluded.tx_status,
    verified_at = excluded.verified_at;

insert into public.withdrawals (
  id,
  user_id,
  chain,
  amount,
  currency,
  destination_address,
  status,
  requested_journal_id,
  completed_journal_id,
  failed_journal_id,
  processed_by,
  processed_at,
  tx_hash,
  failure_reason,
  metadata,
  created_at,
  updated_at
) values
  ('cdcdcdcd-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000001', 'base', 2500000, 'USDC', '0x5555555555555555555555555555555555550555', 'requested', 'ffffffff-4444-4444-8444-444444444444', null, null, null, null, null, null, '{"seed":"true"}'::jsonb, '2026-04-20T04:00:00.000Z', '2026-04-20T04:00:00.000Z'),
  ('cdcdcdcd-2222-4222-8222-222222222222', '00000000-0000-4000-8000-000000000001', 'base', 1800000, 'USDC', '0x6666666666666666666666666666666666660666', 'completed', 'ffffffff-5555-4555-8555-555555555555', 'ffffffff-6666-4666-8666-666666666666', null, '00000000-0000-4000-8000-000000000002', '2026-04-20T04:15:00.000Z', '0x6666aaaabbbbccccddddeeeeffff000011112222333344445555666677778888', null, '{"seed":"true"}'::jsonb, '2026-04-20T04:10:00.000Z', '2026-04-20T04:15:00.000Z'),
  ('cdcdcdcd-3333-4333-8333-333333333333', '00000000-0000-4000-8000-000000000001', 'base', 900000, 'USDC', '0x7777777777777777777777777777777777770777', 'failed', 'ffffffff-7777-4777-8777-777777777777', null, 'ffffffff-8888-4888-8888-888888888888', '00000000-0000-4000-8000-000000000002', '2026-04-20T04:22:00.000Z', null, 'destination address failed checksum validation', '{"seed":"true"}'::jsonb, '2026-04-20T04:20:00.000Z', '2026-04-20T04:22:00.000Z')
on conflict (id) do update
set status = excluded.status,
    processed_at = excluded.processed_at,
    processed_by = excluded.processed_by,
    tx_hash = excluded.tx_hash,
    failure_reason = excluded.failure_reason,
    updated_at = excluded.updated_at;

insert into public.external_markets (
  id,
  source,
  external_id,
  market_id,
  sync_status,
  raw_payload,
  last_synced_at,
  slug,
  title,
  description,
  status,
  market_url,
  close_time,
  end_time,
  resolved_at,
  best_bid,
  best_ask,
  last_trade_price,
  volume_24h,
  volume_total,
  created_at,
  updated_at
) values
  ('efefefef-1111-4111-8111-111111111111', 'polymarket', 'poly-fed-2026-001', '11111111-1111-4111-8111-111111111111', 'synced', '{"seed":"true"}'::jsonb, now(), 'poly-fed-cuts', 'Fed cut before year end?', 'Polymarket reference market for rate-cut narrative.', 'open', 'https://polymarket.com', '2026-12-01T00:00:00.000Z', '2026-12-31T00:00:00.000Z', null, 0.58, 0.6, 0.59, 142000, 1880000, '2026-04-20T05:00:00.000Z', '2026-04-20T05:00:00.000Z'),
  ('efefefef-2222-4222-8222-222222222222', 'kalshi', 'kalshi-weather-nyc-2025', '13131313-1313-4131-8131-131313131313', 'synced', '{"seed":"true"}'::jsonb, now(), 'kalshi-nyc-marathon-rain', 'NYC Marathon rain contract', 'Resolved weather contract mirrored for research context.', 'resolved', 'https://kalshi.com', '2025-11-02T00:00:00.000Z', '2025-11-03T00:00:00.000Z', '2025-11-03T14:00:00.000Z', 0.09, 0.1, 0.1, 84000, 490000, '2026-04-20T05:10:00.000Z', '2026-04-20T05:10:00.000Z'),
  ('efefefef-3333-4333-8333-333333333333', 'polymarket', 'poly-ai-chips-2026', '12121212-1212-4121-8121-121212121212', 'synced', '{"seed":"true"}'::jsonb, now(), 'poly-ai-chip-shortage', 'AI chip shortage warning before Q4?', 'Open technology sentiment market used in demos.', 'open', 'https://polymarket.com', '2026-10-15T00:00:00.000Z', '2026-10-20T00:00:00.000Z', null, 0.41, 0.43, 0.42, 98000, 720000, '2026-04-20T05:20:00.000Z', '2026-04-20T05:20:00.000Z')
on conflict (source, external_id) do update
set title = excluded.title,
    description = excluded.description,
    status = excluded.status,
    best_bid = excluded.best_bid,
    best_ask = excluded.best_ask,
    last_trade_price = excluded.last_trade_price,
    volume_24h = excluded.volume_24h,
    volume_total = excluded.volume_total,
    last_synced_at = excluded.last_synced_at,
    updated_at = excluded.updated_at;

insert into public.external_outcomes (
  id,
  external_market_id,
  external_outcome_id,
  title,
  slug,
  outcome_index,
  yes_no,
  best_bid,
  best_ask,
  last_price,
  volume,
  created_at,
  updated_at
) values
  ('f1f1f1f1-1111-4111-8111-111111111111', 'efefefef-1111-4111-8111-111111111111', 'yes', 'Yes', 'yes', 0, 'yes', 0.58, 0.60, 0.59, 940000, '2026-04-20T05:00:00.000Z', '2026-04-20T05:00:00.000Z'),
  ('f1f1f1f1-2222-4222-8222-222222222222', 'efefefef-1111-4111-8111-111111111111', 'no', 'No', 'no', 1, 'no', 0.40, 0.42, 0.41, 910000, '2026-04-20T05:00:00.000Z', '2026-04-20T05:00:00.000Z'),
  ('f1f1f1f1-3333-4333-8333-333333333333', 'efefefef-2222-4222-8222-222222222222', 'yes', 'Yes', 'yes', 0, 'yes', 0.09, 0.10, 0.10, 300000, '2026-04-20T05:10:00.000Z', '2026-04-20T05:10:00.000Z'),
  ('f1f1f1f1-4444-4444-8444-444444444444', 'efefefef-2222-4222-8222-222222222222', 'no', 'No', 'no', 1, 'no', 0.90, 0.92, 0.91, 190000, '2026-04-20T05:10:00.000Z', '2026-04-20T05:10:00.000Z'),
  ('f1f1f1f1-5555-4555-8555-555555555555', 'efefefef-3333-4333-8333-333333333333', 'yes', 'Yes', 'yes', 0, 'yes', 0.41, 0.43, 0.42, 360000, '2026-04-20T05:20:00.000Z', '2026-04-20T05:20:00.000Z'),
  ('f1f1f1f1-6666-4666-8666-666666666666', 'efefefef-3333-4333-8333-333333333333', 'no', 'No', 'no', 1, 'no', 0.57, 0.59, 0.58, 350000, '2026-04-20T05:20:00.000Z', '2026-04-20T05:20:00.000Z')
on conflict (external_market_id, external_outcome_id) do update
set best_bid = excluded.best_bid,
    best_ask = excluded.best_ask,
    last_price = excluded.last_price,
    volume = excluded.volume,
    updated_at = excluded.updated_at;

insert into public.external_trade_ticks (
  id,
  external_market_id,
  external_trade_id,
  external_outcome_id,
  side,
  price,
  size,
  traded_at,
  raw_payload,
  created_at
) values
  ('f2f2f2f2-1111-4111-8111-111111111111', 'efefefef-1111-4111-8111-111111111111', 'poly-trade-1', 'yes', 'buy', 0.59, 2500, '2026-04-20T04:55:00.000Z', '{"seed":"true"}'::jsonb, '2026-04-20T04:55:00.000Z'),
  ('f2f2f2f2-2222-4222-8222-222222222222', 'efefefef-1111-4111-8111-111111111111', 'poly-trade-2', 'no', 'sell', 0.41, 1900, '2026-04-20T04:58:00.000Z', '{"seed":"true"}'::jsonb, '2026-04-20T04:58:00.000Z'),
  ('f2f2f2f2-3333-4333-8333-333333333333', 'efefefef-2222-4222-8222-222222222222', 'kal-trade-1', 'yes', 'buy', 0.10, 800, '2025-11-03T13:55:00.000Z', '{"seed":"true"}'::jsonb, '2025-11-03T13:55:00.000Z'),
  ('f2f2f2f2-4444-4444-8444-444444444444', 'efefefef-3333-4333-8333-333333333333', 'poly-ai-trade-1', 'yes', 'buy', 0.42, 1200, '2026-04-20T05:19:00.000Z', '{"seed":"true"}'::jsonb, '2026-04-20T05:19:00.000Z'),
  ('f2f2f2f2-5555-4555-8555-555555555555', 'efefefef-3333-4333-8333-333333333333', 'poly-ai-trade-2', 'no', 'sell', 0.58, 950, '2026-04-20T05:21:00.000Z', '{"seed":"true"}'::jsonb, '2026-04-20T05:21:00.000Z')
on conflict (external_market_id, external_trade_id) do update
set price = excluded.price,
    size = excluded.size,
    traded_at = excluded.traded_at,
    raw_payload = excluded.raw_payload;

insert into public.external_sync_checkpoints (
  id,
  source,
  checkpoint_key,
  checkpoint_value,
  synced_at,
  created_at,
  updated_at
) values
  ('f3f3f3f3-1111-4111-8111-111111111111', 'polymarket', 'markets', '{"cursor":"seed-poly-cursor"}'::jsonb, now(), now(), now()),
  ('f3f3f3f3-2222-4222-8222-222222222222', 'kalshi', 'markets', '{"cursor":"seed-kalshi-cursor"}'::jsonb, now(), now(), now())
on conflict (source, checkpoint_key) do update
set checkpoint_value = excluded.checkpoint_value,
    synced_at = excluded.synced_at,
    updated_at = excluded.updated_at;
