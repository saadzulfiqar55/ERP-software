import { DatabaseSchema } from "@/lib/db";
import { ImmutableAuditLog, UserRole } from "@/lib/types";

export const DEFAULT_TENANT_ID = "ten-stacklyra";
export const DEFAULT_TENANT_SLUG = "stacklyra";
export const DEFAULT_BRANCH_ID = "BRANCH_MAIN";

/**
 * Appends an immutable record to the AuditLogs collection strictly scoped by the tenant
 */
export function appendAuditLog(
  db: DatabaseSchema,
  params: {
    tenantId?: string;
    branchId?: string;
    actorId: string;
    actorName: string;
    actorRole: UserRole;
    module: ImmutableAuditLog["module"];
    action: ImmutableAuditLog["action"];
    entityType: string;
    entityId: string;
    summary: string;
  }
): ImmutableAuditLog {
  const resolvedTenantId =
    params.tenantId || db.tenant?.id || DEFAULT_TENANT_ID;
  const resolvedBranchId = params.branchId || DEFAULT_BRANCH_ID;

  const entry: ImmutableAuditLog = {
    id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    tenantId: resolvedTenantId,
    branchId: resolvedBranchId,
    timestamp: new Date().toISOString(),
    actorId: params.actorId,
    actorName: params.actorName,
    actorRole: params.actorRole,
    module: params.module,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    summary: params.summary,
  };

  const currentLogs = db.immutableAuditLogs || [];
  db.immutableAuditLogs = [entry, ...currentLogs.slice(0, 299)];
  return entry;
}
