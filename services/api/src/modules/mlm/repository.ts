import crypto from "node:crypto";

import type { DatabaseExecutor, DatabaseTransaction } from "@bet/db";

export interface ReferralCodeRecord {
  id: string;
  userId: string;
  code: string;
  createdAt: string;
}

export interface ReferralSponsorRecord {
  userId: string;
  username: string | null;
  displayName: string | null;
  referralCode: string | null;
  assignedAt: string;
}

export interface ReferralMemberRecord {
  userId: string;
  username: string | null;
  displayName: string | null;
  joinedAt: string;
}

export interface CommissionPlanLevelRecord {
  id: string;
  levelDepth: number;
  rateBps: number;
}

export interface CommissionPlanRecord {
  id: string;
  version: number;
  name: string;
  payableDepth: number;
  isActive: boolean;
  activatedAt: string | null;
  createdAt: string;
  levels: CommissionPlanLevelRecord[];
}

export interface CommissionEventRecord {
  id: string;
  depositId: string;
  sourceUserId: string;
  sourceDisplayName: string | null;
  beneficiaryUserId: string;
  levelDepth: number;
  amount: bigint;
  currency: string;
  payoutStatus: "credited" | "skipped";
  createdAt: string;
  journalId: string | null;
}

export interface ReferralRelationshipRecord {
  id: string;
  referredUserId: string;
  referredDisplayName: string | null;
  sponsorUserId: string;
  sponsorDisplayName: string | null;
  referralCode: string | null;
  source: "invite_code" | "admin_override";
  assignedAt: string;
}

interface ReferralCodeRow {
  id: string;
  user_id: string;
  code: string;
  created_at: Date | string;
}

interface SponsorRow {
  user_id: string;
  username: string | null;
  display_name: string | null;
  referral_code: string | null;
  assigned_at: Date | string;
}

interface MemberRow {
  user_id: string;
  username: string | null;
  display_name: string | null;
  joined_at: Date | string;
}

interface PlanRow {
  id: string;
  version: number;
  name: string;
  payable_depth: number;
  is_active: boolean;
  activated_at: Date | string | null;
  created_at: Date | string;
}

interface PlanLevelRow {
  id: string;
  plan_id: string;
  level_depth: number;
  rate_bps: number;
}

interface EventRow {
  id: string;
  deposit_id: string;
  source_user_id: string;
  source_display_name: string | null;
  beneficiary_user_id: string;
  level_depth: number;
  amount: bigint;
  currency: string;
  payout_status: "credited" | "skipped";
  created_at: Date | string;
  journal_id: string | null;
}

interface RelationshipRow {
  id: string;
  referred_user_id: string;
  referred_display_name: string | null;
  sponsor_user_id: string;
  sponsor_display_name: string | null;
  referral_code: string | null;
  source: "invite_code" | "admin_override";
  assigned_at: Date | string;
}

interface ChainRow {
  relationship_id: string;
  sponsor_user_id: string;
  level_depth: number;
}

const toIso = (value: Date | string | null): string | null =>
  value === null ? null : value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const mapReferralCode = (row: ReferralCodeRow): ReferralCodeRecord => ({
  id: row.id,
  userId: row.user_id,
  code: row.code,
  createdAt: toIso(row.created_at) ?? new Date().toISOString(),
});

const mapSponsor = (row: SponsorRow): ReferralSponsorRecord => ({
  userId: row.user_id,
  username: row.username,
  displayName: row.display_name,
  referralCode: row.referral_code,
  assignedAt: toIso(row.assigned_at) ?? new Date().toISOString(),
});

const mapMember = (row: MemberRow): ReferralMemberRecord => ({
  userId: row.user_id,
  username: row.username,
  displayName: row.display_name,
  joinedAt: toIso(row.joined_at) ?? new Date().toISOString(),
});

const mapPlan = (row: PlanRow, levels: PlanLevelRow[]): CommissionPlanRecord => ({
  id: row.id,
  version: row.version,
  name: row.name,
  payableDepth: row.payable_depth,
  isActive: row.is_active,
  activatedAt: toIso(row.activated_at),
  createdAt: toIso(row.created_at) ?? new Date().toISOString(),
  levels: levels
    .filter((level) => level.plan_id === row.id)
    .sort((left, right) => left.level_depth - right.level_depth)
    .map((level) => ({
      id: level.id,
      levelDepth: level.level_depth,
      rateBps: level.rate_bps,
    })),
});

const mapEvent = (row: EventRow): CommissionEventRecord => ({
  id: row.id,
  depositId: row.deposit_id,
  sourceUserId: row.source_user_id,
  sourceDisplayName: row.source_display_name,
  beneficiaryUserId: row.beneficiary_user_id,
  levelDepth: row.level_depth,
  amount: row.amount,
  currency: row.currency,
  payoutStatus: row.payout_status,
  createdAt: toIso(row.created_at) ?? new Date().toISOString(),
  journalId: row.journal_id,
});

const mapRelationship = (row: RelationshipRow): ReferralRelationshipRecord => ({
  id: row.id,
  referredUserId: row.referred_user_id,
  referredDisplayName: row.referred_display_name,
  sponsorUserId: row.sponsor_user_id,
  sponsorDisplayName: row.sponsor_display_name,
  referralCode: row.referral_code,
  source: row.source,
  assignedAt: toIso(row.assigned_at) ?? new Date().toISOString(),
});

export const generateReferralCode = (): string => crypto.randomBytes(4).toString("hex").toUpperCase();

export const buildMlmCommissionLedgerEntries = (input: {
  beneficiaryUserId: string;
  amount: bigint;
  currency: string;
}) => [
  {
    accountCode: `user:${input.beneficiaryUserId}:funds:available`,
    direction: "debit" as const,
    amount: input.amount,
    currency: input.currency,
  },
  {
    accountCode: "platform:mlm:commissions",
    direction: "credit" as const,
    amount: input.amount,
    currency: input.currency,
  },
];

export const calculateCommissionAmount = (amount: bigint, rateBps: number): bigint =>
  (amount * BigInt(rateBps)) / 10000n;

export const ensureReferralCode = async (
  transaction: DatabaseTransaction,
  userId: string,
): Promise<ReferralCodeRecord> => {
  const [existing] = await transaction.query<ReferralCodeRow>(
    `
      select id, user_id, code, created_at
      from public.referral_codes
      where user_id = $1::uuid
      limit 1
    `,
    [userId],
  );

  if (existing) {
    return mapReferralCode(existing);
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const [inserted] = await transaction.query<ReferralCodeRow>(
      `
        insert into public.referral_codes (
          user_id,
          code,
          created_at,
          updated_at
        ) values (
          $1::uuid,
          $2,
          now(),
          now()
        )
        on conflict (code) do nothing
        returning id, user_id, code, created_at
      `,
      [userId, generateReferralCode()],
    );

    if (inserted) {
      return mapReferralCode(inserted);
    }
  }

  throw new Error("failed to generate referral code");
};

export const getReferralCodeByCode = async (
  executor: DatabaseExecutor,
  code: string,
): Promise<ReferralCodeRecord | null> => {
  const [row] = await executor.query<ReferralCodeRow>(
    `
      select id, user_id, code, created_at
      from public.referral_codes
      where upper(code) = upper($1)
      limit 1
    `,
    [code.trim()],
  );

  return row ? mapReferralCode(row) : null;
};

export const getSponsorRelationship = async (
  executor: DatabaseExecutor,
  userId: string,
): Promise<ReferralSponsorRecord | null> => {
  const [row] = await executor.query<SponsorRow>(
    `
      select
        sponsor.id as user_id,
        sponsor.username,
        sponsor.display_name,
        code.code as referral_code,
        relationship.created_at as assigned_at
      from public.referral_relationships relationship
      join public.profiles sponsor on sponsor.id = relationship.sponsor_user_id
      left join public.referral_codes code on code.user_id = sponsor.id
      where relationship.referred_user_id = $1::uuid
      limit 1
    `,
    [userId],
  );

  return row ? mapSponsor(row) : null;
};

export const listDirectReferrals = async (
  executor: DatabaseExecutor,
  sponsorUserId: string,
): Promise<ReferralMemberRecord[]> => {
  const rows = await executor.query<MemberRow>(
    `
      select
        profile.id as user_id,
        profile.username,
        profile.display_name,
        relationship.created_at as joined_at
      from public.referral_relationships relationship
      join public.profiles profile on profile.id = relationship.referred_user_id
      where relationship.sponsor_user_id = $1::uuid
      order by relationship.created_at desc
    `,
    [sponsorUserId],
  );

  return rows.map(mapMember);
};

export const countTotalDownline = async (executor: DatabaseExecutor, sponsorUserId: string): Promise<number> => {
  const [row] = await executor.query<{ total: number }>(
    `
      with recursive tree as (
        select referred_user_id
        from public.referral_relationships
        where sponsor_user_id = $1::uuid
        union all
        select relationship.referred_user_id
        from public.referral_relationships relationship
        join tree on tree.referred_user_id = relationship.sponsor_user_id
      )
      select count(*)::int as total
      from tree
    `,
    [sponsorUserId],
  );

  return row?.total ?? 0;
};

export const listCommissionPlans = async (executor: DatabaseExecutor): Promise<CommissionPlanRecord[]> => {
  const [plans, levels] = await Promise.all([
    executor.query<PlanRow>(
      `
        select id, version, name, payable_depth, is_active, activated_at, created_at
        from public.mlm_commission_plans
        order by version desc
      `,
    ),
    executor.query<PlanLevelRow>(
      `
        select id, plan_id, level_depth, rate_bps
        from public.mlm_commission_plan_levels
      `,
    ),
  ]);

  return plans.map((plan) => mapPlan(plan, levels));
};

export const getActiveCommissionPlan = async (executor: DatabaseExecutor): Promise<CommissionPlanRecord | null> => {
  const plans = await listCommissionPlans(executor);
  return plans.find((plan) => plan.isActive) ?? null;
};

export const listCommissionEventsForUser = async (
  executor: DatabaseExecutor,
  userId: string,
  limit = 20,
): Promise<CommissionEventRecord[]> => {
  const rows = await executor.query<EventRow>(
    `
      select
        event.id,
        event.deposit_id,
        event.source_user_id,
        source.display_name as source_display_name,
        event.beneficiary_user_id,
        event.level_depth,
        event.amount,
        event.currency,
        event.payout_status,
        event.created_at,
        event.journal_id
      from public.mlm_commission_events event
      join public.profiles source on source.id = event.source_user_id
      where event.beneficiary_user_id = $1::uuid
      order by event.created_at desc, event.id desc
      limit $2
    `,
    [userId, limit],
  );

  return rows.map(mapEvent);
};

export const listRecentCommissionEvents = async (
  executor: DatabaseExecutor,
  limit = 20,
): Promise<CommissionEventRecord[]> => {
  const rows = await executor.query<EventRow>(
    `
      select
        event.id,
        event.deposit_id,
        event.source_user_id,
        source.display_name as source_display_name,
        event.beneficiary_user_id,
        event.level_depth,
        event.amount,
        event.currency,
        event.payout_status,
        event.created_at,
        event.journal_id
      from public.mlm_commission_events event
      join public.profiles source on source.id = event.source_user_id
      order by event.created_at desc, event.id desc
      limit $1
    `,
    [limit],
  );

  return rows.map(mapEvent);
};

export const getCommissionMetrics = async (
  executor: DatabaseExecutor,
  beneficiaryUserId: string,
): Promise<{ lifetimeCommission: bigint; recentCommission30d: bigint }> => {
  const [row] = await executor.query<{ lifetime_commission: bigint; recent_commission_30d: bigint }>(
    `
      select
        coalesce(sum(amount)::bigint, 0::bigint) as lifetime_commission,
        coalesce(
          sum(case when created_at >= now() - interval '30 days' then amount else 0 end)::bigint,
          0::bigint
        ) as recent_commission_30d
      from public.mlm_commission_events
      where beneficiary_user_id = $1::uuid
        and payout_status = 'credited'
    `,
    [beneficiaryUserId],
  );

  return {
    lifetimeCommission: row?.lifetime_commission ?? 0n,
    recentCommission30d: row?.recent_commission_30d ?? 0n,
  };
};

export const listReferralRelationships = async (
  executor: DatabaseExecutor,
  limit = 20,
): Promise<ReferralRelationshipRecord[]> => {
  const rows = await executor.query<RelationshipRow>(
    `
      select
        relationship.id,
        relationship.referred_user_id,
        referred.display_name as referred_display_name,
        relationship.sponsor_user_id,
        sponsor.display_name as sponsor_display_name,
        code.code as referral_code,
        relationship.source,
        relationship.created_at as assigned_at
      from public.referral_relationships relationship
      join public.profiles referred on referred.id = relationship.referred_user_id
      join public.profiles sponsor on sponsor.id = relationship.sponsor_user_id
      left join public.referral_codes code on code.id = relationship.referral_code_id
      order by relationship.created_at desc, relationship.id desc
      limit $1
    `,
    [limit],
  );

  return rows.map(mapRelationship);
};

export const getSponsorChain = async (
  executor: DatabaseExecutor,
  userId: string,
  maxDepth: number,
): Promise<ChainRow[]> => {
  const rows = await executor.query<ChainRow>(
    `
      with recursive chain as (
        select
          relationship.id as relationship_id,
          relationship.sponsor_user_id,
          1 as level_depth
        from public.referral_relationships relationship
        where relationship.referred_user_id = $1::uuid
        union all
        select
          relationship.id as relationship_id,
          relationship.sponsor_user_id,
          chain.level_depth + 1 as level_depth
        from public.referral_relationships relationship
        join chain on chain.sponsor_user_id = relationship.referred_user_id
        where chain.level_depth < $2
      )
      select relationship_id, sponsor_user_id, level_depth
      from chain
      order by level_depth asc
    `,
    [userId, maxDepth],
  );

  return rows;
};

export const assertNoReferralCycle = async (
  executor: DatabaseExecutor,
  referredUserId: string,
  sponsorUserId: string,
): Promise<void> => {
  if (referredUserId === sponsorUserId) {
    throw new Error("self-referrals are not allowed");
  }

  const [row] = await executor.query<{ blocked: boolean }>(
    `
      with recursive ancestors as (
        select sponsor_user_id
        from public.referral_relationships
        where referred_user_id = $1::uuid
        union all
        select relationship.sponsor_user_id
        from public.referral_relationships relationship
        join ancestors on ancestors.sponsor_user_id = relationship.referred_user_id
      )
      select exists(
        select 1 from ancestors where sponsor_user_id = $2::uuid
      ) as blocked
    `,
    [sponsorUserId, referredUserId],
  );

  if (row?.blocked) {
    throw new Error("referral assignment would create a cycle");
  }
};

export const assignSponsor = async (
  transaction: DatabaseTransaction,
  input: {
    referredUserId: string;
    sponsorUserId: string;
    referralCodeId: string | null;
    source: "invite_code" | "admin_override";
    actorUserId: string | null;
    notes: string | null;
  },
): Promise<void> => {
  await assertNoReferralCycle(transaction, input.referredUserId, input.sponsorUserId);

  const [existing] = await transaction.query<{ sponsor_user_id: string | null }>(
    `
      select sponsor_user_id
      from public.referral_relationships
      where referred_user_id = $1::uuid
      limit 1
    `,
    [input.referredUserId],
  );

  if (existing?.sponsor_user_id === input.sponsorUserId) {
    return;
  }

  await transaction.query(
    `
      insert into public.referral_relationships (
        referred_user_id,
        sponsor_user_id,
        referral_code_id,
        source,
        assigned_by_user_id,
        notes,
        created_at,
        updated_at
      ) values (
        $1::uuid,
        $2::uuid,
        $3::uuid,
        $4,
        $5::uuid,
        $6,
        now(),
        now()
      )
      on conflict (referred_user_id)
      do update set
        sponsor_user_id = excluded.sponsor_user_id,
        referral_code_id = excluded.referral_code_id,
        source = excluded.source,
        assigned_by_user_id = excluded.assigned_by_user_id,
        notes = excluded.notes,
        updated_at = excluded.updated_at
    `,
    [
      input.referredUserId,
      input.sponsorUserId,
      input.referralCodeId,
      input.source,
      input.actorUserId,
      input.notes,
    ],
  );

  await transaction.query(
    `
      insert into public.referral_relationship_events (
        referred_user_id,
        sponsor_user_id,
        previous_sponsor_user_id,
        referral_code_id,
        action,
        source,
        actor_user_id,
        notes,
        created_at
      ) values (
        $1::uuid,
        $2::uuid,
        $3::uuid,
        $4::uuid,
        $5,
        $6,
        $7::uuid,
        $8,
        now()
      )
    `,
    [
      input.referredUserId,
      input.sponsorUserId,
      existing?.sponsor_user_id ?? null,
      input.referralCodeId,
      existing ? "overridden" : "assigned",
      input.source,
      input.actorUserId,
      input.notes,
    ],
  );
};

export const createCommissionPlan = async (
  transaction: DatabaseTransaction,
  input: {
    name: string;
    createdByUserId: string;
    levels: { levelDepth: number; rateBps: number }[];
    activate: boolean;
  },
): Promise<CommissionPlanRecord> => {
  const normalizedLevels = [...input.levels].sort((left, right) => left.levelDepth - right.levelDepth);

  if (normalizedLevels.length === 0) {
    throw new Error("at least one commission level is required");
  }

  const payableDepth = normalizedLevels[normalizedLevels.length - 1]?.levelDepth ?? 0;
  const [versionRow] = await transaction.query<{ version: number }>(
    `
      select coalesce(max(version), 0)::int + 1 as version
      from public.mlm_commission_plans
    `,
  );

  if (input.activate) {
    await transaction.query(`update public.mlm_commission_plans set is_active = false where is_active = true`);
  }

  const [plan] = await transaction.query<PlanRow>(
    `
      insert into public.mlm_commission_plans (
        version,
        name,
        payable_depth,
        is_active,
        activated_at,
        created_by_user_id,
        created_at,
        updated_at
      ) values (
        $1,
        $2,
        $3,
        $4,
        case when $4 then now() else null end,
        $5::uuid,
        now(),
        now()
      )
      returning id, version, name, payable_depth, is_active, activated_at, created_at
    `,
    [versionRow?.version ?? 1, input.name.trim(), payableDepth, input.activate, input.createdByUserId],
  );

  for (const level of normalizedLevels) {
    await transaction.query(
      `
        insert into public.mlm_commission_plan_levels (
          plan_id,
          level_depth,
          rate_bps,
          created_at
        ) values (
          $1::uuid,
          $2,
          $3,
          now()
        )
      `,
      [plan?.id, level.levelDepth, level.rateBps],
    );
  }

  const levels = await transaction.query<PlanLevelRow>(
    `select id, plan_id, level_depth, rate_bps from public.mlm_commission_plan_levels where plan_id = $1::uuid`,
    [plan?.id ?? ""],
  );

  if (!plan) {
    throw new Error("failed to create commission plan");
  }

  return mapPlan(plan, levels);
};

export const activateCommissionPlan = async (
  transaction: DatabaseTransaction,
  planId: string,
): Promise<void> => {
  await transaction.query(`update public.mlm_commission_plans set is_active = false where is_active = true`);
  await transaction.query(
    `
      update public.mlm_commission_plans
      set is_active = true,
          activated_at = now(),
          updated_at = now()
      where id = $1::uuid
    `,
    [planId],
  );
};

export const insertMlmCommissionJournal = async (
  transaction: DatabaseTransaction,
  input: {
    journalId: string;
    reference: string;
    beneficiaryUserId: string;
    amount: bigint;
    currency: string;
    metadata: Record<string, unknown>;
  },
): Promise<void> => {
  await transaction.query(
    `
      insert into public.ledger_journals (
        id,
        journal_kind,
        reference,
        metadata,
        created_at
      ) values (
        $1::uuid,
        'mlm_commission',
        $2,
        $3::jsonb,
        now()
      )
    `,
    [input.journalId, input.reference, JSON.stringify(input.metadata)],
  );

  const entries = buildMlmCommissionLedgerEntries({
    beneficiaryUserId: input.beneficiaryUserId,
    amount: input.amount,
    currency: input.currency,
  });

  await transaction.query(
    `
      insert into public.ledger_entries (
        journal_id,
        account_code,
        direction,
        amount,
        currency,
        created_at
      ) values
        ($1::uuid, $2, $3, $4, $5, now()),
        ($1::uuid, $6, $7, $8, $9, now())
    `,
    [
      input.journalId,
      entries[0].accountCode,
      entries[0].direction,
      entries[0].amount,
      entries[0].currency,
      entries[1].accountCode,
      entries[1].direction,
      entries[1].amount,
      entries[1].currency,
    ],
  );
};

export const allocateDepositCommissions = async (
  transaction: DatabaseTransaction,
  input: {
    depositId: string;
    sourceUserId: string;
    amount: bigint;
    currency: string;
  },
): Promise<CommissionEventRecord[]> => {
  const activePlan = await getActiveCommissionPlan(transaction);
  if (!activePlan) {
    return [];
  }

  const sponsorChain = await getSponsorChain(transaction, input.sourceUserId, activePlan.payableDepth);
  const events: CommissionEventRecord[] = [];

  for (const level of activePlan.levels) {
    const chainItem = sponsorChain.find((item) => item.level_depth === level.levelDepth);
    if (!chainItem) {
      continue;
    }

    const amount = calculateCommissionAmount(input.amount, level.rateBps);
    if (amount <= 0n) {
      continue;
    }

    const existing = await transaction.query<EventRow>(
      `
        select
          event.id,
          event.deposit_id,
          event.source_user_id,
          source.display_name as source_display_name,
          event.beneficiary_user_id,
          event.level_depth,
          event.amount,
          event.currency,
          event.payout_status,
          event.created_at,
          event.journal_id
        from public.mlm_commission_events event
        join public.profiles source on source.id = event.source_user_id
        where event.deposit_id = $1::uuid
          and event.beneficiary_user_id = $2::uuid
          and event.level_depth = $3
        limit 1
      `,
      [input.depositId, chainItem.sponsor_user_id, level.levelDepth],
    );

    if (existing[0]) {
      events.push(mapEvent(existing[0]));
      continue;
    }

    const journalId = crypto.randomUUID();
    await insertMlmCommissionJournal(transaction, {
      journalId,
      reference: `deposit:${input.depositId}:level:${level.levelDepth}:beneficiary:${chainItem.sponsor_user_id}`,
      beneficiaryUserId: chainItem.sponsor_user_id,
      amount,
      currency: input.currency,
      metadata: {
        depositId: input.depositId,
        sourceUserId: input.sourceUserId,
        beneficiaryUserId: chainItem.sponsor_user_id,
        levelDepth: level.levelDepth,
        planId: activePlan.id,
      },
    });

    const [inserted] = await transaction.query<EventRow>(
      `
        insert into public.mlm_commission_events (
          deposit_id,
          source_user_id,
          beneficiary_user_id,
          referral_relationship_id,
          plan_id,
          plan_level_id,
          level_depth,
          amount,
          currency,
          payout_status,
          journal_id,
          metadata,
          created_at
        ) values (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4::uuid,
          $5::uuid,
          $6::uuid,
          $7,
          $8,
          $9,
          'credited',
          $10::uuid,
          $11::jsonb,
          now()
        )
        returning
          id,
          deposit_id,
          source_user_id,
          null::text as source_display_name,
          beneficiary_user_id,
          level_depth,
          amount,
          currency,
          payout_status,
          created_at,
          journal_id
      `,
      [
        input.depositId,
        input.sourceUserId,
        chainItem.sponsor_user_id,
        chainItem.relationship_id,
        activePlan.id,
        level.id,
        level.levelDepth,
        amount,
        input.currency,
        journalId,
        JSON.stringify({
          rateBps: level.rateBps,
        }),
      ],
    );

    if (inserted) {
      events.push(mapEvent(inserted));
    }
  }

  return events;
};
