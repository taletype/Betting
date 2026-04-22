import { createDatabaseClient } from "@bet/db";

const db = createDatabaseClient();

const toIso = (value: Date | string | null): string | null =>
  value === null ? null : value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const inviteUrlForCode = (code: string): string => {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
  return `${base}/referrals?code=${encodeURIComponent(code)}`;
};

const ensureReferralCode = async (userId: string) => {
  const [existing] = await db.query<{ id: string; code: string; created_at: Date | string }>(
    `select id, code, created_at from public.referral_codes where user_id = $1::uuid limit 1`,
    [userId],
  );

  if (existing) {
    return {
      id: existing.id,
      code: existing.code,
      inviteUrl: inviteUrlForCode(existing.code),
      createdAt: toIso(existing.created_at),
    };
  }

  const [inserted] = await db.query<{ id: string; code: string; created_at: Date | string }>(
    `
      insert into public.referral_codes (
        user_id,
        code,
        created_at,
        updated_at
      ) values (
        $1::uuid,
        upper(substr(md5(gen_random_uuid()::text), 1, 8)),
        now(),
        now()
      )
      returning id, code, created_at
    `,
    [userId],
  );

  if (!inserted) {
    throw new Error("failed to create referral code");
  }

  return {
    id: inserted.id,
    code: inserted.code,
    inviteUrl: inviteUrlForCode(inserted.code),
    createdAt: toIso(inserted.created_at),
  };
};

export const readMlmDashboard = async (userId: string) => {
  const [referralCode, sponsorRows, directReferralRows, metricRows, commissionRows] = await Promise.all([
    ensureReferralCode(userId),
    db.query<{
      user_id: string;
      username: string | null;
      display_name: string | null;
      referral_code: string | null;
      assigned_at: Date | string;
    }>(
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
    ),
    db.query<{
      user_id: string;
      username: string | null;
      display_name: string | null;
      joined_at: Date | string;
    }>(
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
      [userId],
    ),
    db.query<{ total_downline_count: number; lifetime_commission: bigint; recent_commission_30d: bigint }>(
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
        select
          (select count(*)::int from tree) as total_downline_count,
          (
            select coalesce(sum(amount)::bigint, 0::bigint)
            from public.mlm_commission_events
            where beneficiary_user_id = $1::uuid
              and payout_status = 'credited'
          ) as lifetime_commission,
          (
            select coalesce(sum(amount)::bigint, 0::bigint)
            from public.mlm_commission_events
            where beneficiary_user_id = $1::uuid
              and payout_status = 'credited'
              and created_at >= now() - interval '30 days'
          ) as recent_commission_30d
      `,
      [userId],
    ),
    db.query<{
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
    }>(
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
        limit 20
      `,
      [userId],
    ),
  ]);

  const sponsor = sponsorRows[0]
    ? {
        userId: sponsorRows[0].user_id,
        username: sponsorRows[0].username,
        displayName: sponsorRows[0].display_name,
        referralCode: sponsorRows[0].referral_code,
        assignedAt: toIso(sponsorRows[0].assigned_at),
      }
    : null;

  return {
    referralCode,
    sponsor,
    directReferrals: directReferralRows.map((row) => ({
      userId: row.user_id,
      username: row.username,
      displayName: row.display_name,
      joinedAt: toIso(row.joined_at),
    })),
    metrics: {
      directReferralCount: directReferralRows.length,
      totalDownlineCount: metricRows[0]?.total_downline_count ?? 0,
      lifetimeCommission: metricRows[0]?.lifetime_commission ?? 0n,
      recentCommission30d: metricRows[0]?.recent_commission_30d ?? 0n,
    },
    commissions: commissionRows.map((row) => ({
      id: row.id,
      depositId: row.deposit_id,
      sourceUserId: row.source_user_id,
      sourceDisplayName: row.source_display_name,
      beneficiaryUserId: row.beneficiary_user_id,
      levelDepth: row.level_depth,
      amount: row.amount,
      currency: row.currency,
      payoutStatus: row.payout_status,
      createdAt: toIso(row.created_at),
      journalId: row.journal_id,
    })),
  };
};

export const joinReferralProgramDb = async (userId: string, code: string) => {
  await db.transaction(async (transaction) => {
    const [referralCode] = await transaction.query<{ id: string; user_id: string; code: string }>(
      `select id, user_id, code from public.referral_codes where upper(code) = upper($1) limit 1`,
      [code.trim()],
    );

    if (!referralCode) {
      throw new Error("invalid referral code");
    }

    if (referralCode.user_id === userId) {
      throw new Error("self-referrals are not allowed");
    }

    const [cycle] = await transaction.query<{ blocked: boolean }>(
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
        select exists(select 1 from ancestors where sponsor_user_id = $2::uuid) as blocked
      `,
      [referralCode.user_id, userId],
    );

    if (cycle?.blocked) {
      throw new Error("referral assignment would create a cycle");
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
          'invite_code',
          $1::uuid,
          null,
          now(),
          now()
        )
        on conflict (referred_user_id)
        do update set
          sponsor_user_id = excluded.sponsor_user_id,
          referral_code_id = excluded.referral_code_id,
          source = excluded.source,
          assigned_by_user_id = excluded.assigned_by_user_id,
          updated_at = excluded.updated_at
      `,
      [userId, referralCode.user_id, referralCode.id],
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
          null,
          $3::uuid,
          'assigned',
          'invite_code',
          $1::uuid,
          null,
          now()
        )
      `,
      [userId, referralCode.user_id, referralCode.id],
    );
  });

  return readMlmDashboard(userId);
};

export const readAdminMlmOverview = async () => {
  const [planRows, levelRows, commissionRows, relationshipRows] = await Promise.all([
    db.query<{
      id: string;
      version: number;
      name: string;
      payable_depth: number;
      is_active: boolean;
      activated_at: Date | string | null;
      created_at: Date | string;
    }>(
      `select id, version, name, payable_depth, is_active, activated_at, created_at from public.mlm_commission_plans order by version desc`,
    ),
    db.query<{ id: string; plan_id: string; level_depth: number; rate_bps: number }>(
      `select id, plan_id, level_depth, rate_bps from public.mlm_commission_plan_levels`,
    ),
    db.query<{
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
    }>(
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
        limit 20
      `,
    ),
    db.query<{
      id: string;
      referred_user_id: string;
      referred_display_name: string | null;
      sponsor_user_id: string;
      sponsor_display_name: string | null;
      referral_code: string | null;
      source: "invite_code" | "admin_override";
      assigned_at: Date | string;
    }>(
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
        limit 20
      `,
    ),
  ]);

  const plans = planRows.map((plan) => ({
    id: plan.id,
    version: plan.version,
    name: plan.name,
    payableDepth: plan.payable_depth,
    isActive: plan.is_active,
    activatedAt: toIso(plan.activated_at),
    createdAt: toIso(plan.created_at),
    levels: levelRows
      .filter((level) => level.plan_id === plan.id)
      .sort((left, right) => left.level_depth - right.level_depth)
      .map((level) => ({
        id: level.id,
        levelDepth: level.level_depth,
        rateBps: level.rate_bps,
      })),
  }));

  return {
    activePlan: plans.find((plan) => plan.isActive) ?? null,
    plans,
    recentCommissions: commissionRows.map((row) => ({
      id: row.id,
      depositId: row.deposit_id,
      sourceUserId: row.source_user_id,
      sourceDisplayName: row.source_display_name,
      beneficiaryUserId: row.beneficiary_user_id,
      levelDepth: row.level_depth,
      amount: row.amount,
      currency: row.currency,
      payoutStatus: row.payout_status,
      createdAt: toIso(row.created_at),
      journalId: row.journal_id,
    })),
    relationships: relationshipRows.map((row) => ({
      id: row.id,
      referredUserId: row.referred_user_id,
      referredDisplayName: row.referred_display_name,
      sponsorUserId: row.sponsor_user_id,
      sponsorDisplayName: row.sponsor_display_name,
      referralCode: row.referral_code,
      source: row.source,
      assignedAt: toIso(row.assigned_at),
    })),
  };
};

export const createAdminMlmPlanDb = async (adminUserId: string, input: {
  name: string;
  levels: { levelDepth: number; rateBps: number }[];
  activate: boolean;
}) => db.transaction(async (transaction) => {
  const levels = [...input.levels].sort((a, b) => a.levelDepth - b.levelDepth);
  const [versionRow] = await transaction.query<{ version: number }>(
    `select coalesce(max(version), 0)::int + 1 as version from public.mlm_commission_plans`,
  );
  if (input.activate) {
    await transaction.query(`update public.mlm_commission_plans set is_active = false where is_active = true`);
  }
  const [plan] = await transaction.query<{
    id: string;
    version: number;
    name: string;
    payable_depth: number;
    is_active: boolean;
    activated_at: Date | string | null;
    created_at: Date | string;
  }>(
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
    [versionRow?.version ?? 1, input.name.trim(), levels[levels.length - 1]?.levelDepth ?? 1, input.activate, adminUserId],
  );

  for (const level of levels) {
    await transaction.query(
      `insert into public.mlm_commission_plan_levels (plan_id, level_depth, rate_bps, created_at) values ($1::uuid, $2, $3, now())`,
      [plan?.id, level.levelDepth, level.rateBps],
    );
  }

  const createdLevels = await transaction.query<{ id: string; level_depth: number; rate_bps: number }>(
    `select id, level_depth, rate_bps from public.mlm_commission_plan_levels where plan_id = $1::uuid order by level_depth asc`,
    [plan?.id ?? ""],
  );

  return {
    id: plan?.id ?? "",
    version: plan?.version ?? 0,
    name: plan?.name ?? "",
    payableDepth: plan?.payable_depth ?? 0,
    isActive: plan?.is_active ?? false,
    activatedAt: toIso(plan?.activated_at ?? null),
    createdAt: toIso(plan?.created_at ?? null),
    levels: createdLevels.map((level) => ({
      id: level.id,
      levelDepth: level.level_depth,
      rateBps: level.rate_bps,
    })),
  };
});

export const activateAdminMlmPlanDb = async (planId: string) => {
  await db.transaction(async (transaction) => {
    await transaction.query(`update public.mlm_commission_plans set is_active = false where is_active = true`);
    await transaction.query(
      `update public.mlm_commission_plans set is_active = true, activated_at = now(), updated_at = now() where id = $1::uuid`,
      [planId],
    );
  });
};

export const overrideReferralSponsorDb = async (adminUserId: string, input: {
  referredUserId: string;
  sponsorCode: string;
  reason: string;
}) => {
  await db.transaction(async (transaction) => {
    const [referralCode] = await transaction.query<{ id: string; user_id: string }>(
      `select id, user_id from public.referral_codes where upper(code) = upper($1) limit 1`,
      [input.sponsorCode.trim()],
    );

    if (!referralCode) {
      throw new Error("invalid referral code");
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
          'admin_override',
          $4::uuid,
          $5,
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
      [input.referredUserId, referralCode.user_id, referralCode.id, adminUserId, input.reason.trim() || null],
    );
  });
};
