import { DatabaseSchema } from "@/lib/db";
import { ImmutableAuditLog, UserRole } from "@/lib/types";

export const DEFAULT_TENANT_ID = "TENANT_ALBARKA";
export const DEFAULT_BRANCH_ID = "BRANCH_GULBERG_01";

/**
 * Appends an immutable record to the AuditLogs collection
 */
export function appendAuditLog(
  db: DatabaseSchema,
  params: {
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
  const entry: ImmutableAuditLog = {
    id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    tenantId: DEFAULT_TENANT_ID,
    branchId: DEFAULT_BRANCH_ID,
    timestamp: new Date().toISOString(),
    ...params,
  };

  const currentLogs = db.immutableAuditLogs || [];
  db.immutableAuditLogs = [entry, ...currentLogs.slice(0, 299)];
  return entry;
}
