import type { DatabaseExecutor } from "@bet/db";

export interface AuditRecordInput {
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
  beforeStatus?: string | null;
  afterStatus?: string | null;
  note?: string | null;
}

export const insertAuditRecord = async (
  executor: DatabaseExecutor,
  input: AuditRecordInput,
): Promise<void> => {
  await executor.query(
    `
      insert into public.audit_logs (
        actor_user_id,
        action,
        entity_type,
        entity_id,
        metadata,
        created_at
      ) values (
        $1::uuid,
        $2,
        $3,
        $4,
        $5::jsonb,
        now()
      )
    `,
    [
      input.actorUserId,
      input.action,
      input.entityType,
      input.entityId,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
};

export const insertAdminAuditRecord = async (
  executor: DatabaseExecutor,
  input: AuditRecordInput,
): Promise<void> => {
  await executor.query(
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
      ) values (
        $1::uuid,
        $1::uuid,
        $2,
        $3,
        $3,
        $4,
        $4,
        $5,
        $6,
        $7,
        $8::jsonb,
        now()
      )
    `,
    [
      input.actorUserId,
      input.action,
      input.entityType,
      input.entityId,
      input.beforeStatus ?? (typeof input.metadata?.beforeStatus === "string" ? input.metadata.beforeStatus : null),
      input.afterStatus ?? (typeof input.metadata?.afterStatus === "string" ? input.metadata.afterStatus : null),
      input.note ?? (typeof input.metadata?.notes === "string" ? input.metadata.notes : null),
      JSON.stringify(input.metadata ?? {}),
    ],
  );
};
