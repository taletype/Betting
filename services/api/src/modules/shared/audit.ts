import type { DatabaseExecutor } from "@bet/db";

export interface AuditRecordInput {
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
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
