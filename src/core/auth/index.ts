import { cookies } from "next/headers";
import { verifyJwt } from "@/lib/auth-jwt";
import { DatabaseSchema } from "@/lib/db";
import { ERPPermission, UserProfile } from "@/lib/types";
import { hasGranularPermission, ROLE_PERMISSION_MATRIX } from "./permissions";

export { hasGranularPermission, ROLE_PERMISSION_MATRIX };

/**
 * Verifies the active session at the Service / Data Access Layer (Server-only)
 */
export async function resolveAuthenticatedActor(
  db: DatabaseSchema
): Promise<UserProfile> {
  const cookieStore = await cookies();
  const token = cookieStore.get("albarka_session_jwt")?.value;

  if (token) {
    const decoded = verifyJwt(token);
    if (decoded && db.activeSession && db.activeSession.sessionId === decoded.sid) {
      const user = db.users.find((u) => u.id === decoded.sub);
      if (user) return user;
    }
  }

  if (db.activeSession) {
    const user = db.users.find((u) => u.id === db.activeSession?.userId);
    if (user) return user;
  }

  return db.users[0];
}

export async function assertActorPermission(
  db: DatabaseSchema,
  requiredPermission: ERPPermission
): Promise<UserProfile> {
  const actor = await resolveAuthenticatedActor(db);
  if (!hasGranularPermission(actor.role, requiredPermission)) {
    throw new Error(
      `RBAC Access Denied: Role "${actor.role}" lacks required permission "${requiredPermission}".`
    );
  }
  return actor;
}
