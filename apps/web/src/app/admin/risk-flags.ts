import { createDatabaseClient } from "@bet/db";

export const updateAdminRiskFlagReviewState = async (input: {
  riskFlagId: string;
  reviewedBy: string;
  status: "reviewed" | "dismissed";
  reviewNotes: string;
}) => {
  const reviewNotes = input.reviewNotes.trim();
  if (!reviewNotes) throw new Error("risk review notes are required");

  const db = createDatabaseClient();
  return db.transaction(async (transaction) => {
    const [row] = await transaction.query<{
      id: string;
      status: "open" | "reviewed" | "dismissed";
      reviewed_by: string | null;
      reviewed_at: Date | string | null;
      review_notes: string | null;
    }>(
      `
        update public.ambassador_risk_flags
           set status = $3,
               reviewed_by = $2::uuid,
               reviewed_at = coalesce(reviewed_at, now()),
               review_notes = $4
         where id = $1::uuid
           and status = 'open'
        returning id, status, reviewed_by, reviewed_at, review_notes
      `,
      [input.riskFlagId, input.reviewedBy, input.status, reviewNotes],
    );
    if (!row) throw new Error("risk flag must be open before review status can change");

    await transaction.query(
      `
        insert into public.admin_audit_log (
          actor_user_id,
          actor_admin_user_id,
          action,
          entity_type,
          target_type,
          entity_id,
          target_id,
          before_status,
          after_status,
          note,
          metadata,
          created_at
        )
        values ($1::uuid, $1::uuid, $2, 'ambassador_risk_flag', 'ambassador_risk_flag', $3::uuid, $3::uuid, 'open', $4, $5, $6::jsonb, now())
      `,
      [
        input.reviewedBy,
        input.status === "dismissed" ? "risk_flag.dismiss" : "risk_flag.review",
        input.riskFlagId,
        input.status,
        reviewNotes,
        JSON.stringify({ beforeStatus: "open", afterStatus: input.status, reviewNotes }),
      ],
    );

    return row;
  });
};
