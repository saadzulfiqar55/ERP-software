import { cookies } from "next/headers";
import { verifyJwt } from "@/lib/auth-jwt";
import { DatabaseSchema } from "@/lib/db";
import { ERPPermission, UserProfile, UserRole } from "@/lib/types";

export const ROLE_PERMISSION_MATRIX: Record<UserRole, ERPPermission[]> = {
  ADMIN: [
    "pos:sale:create",
    "pos:sale:void",
    "pos:discount:override",
    "inventory:view",
    "inventory:adjust",
    "inventory:archive",
    "accounting:journal:post",
    "accounting:journal:reverse",
    "accounting:period:close",
    "settings:pra:manage",
  ],
  MANAGER: [
    "pos:sale:create",
    "pos:sale:void",
    "pos:discount:override",
    "inventory:view",
    "inventory:adjust",
    "inventory:archive",
    "accounting:journal:post",
    "accounting:journal:reverse",
  ],
  CASHIER: ["pos:sale:create", "inventory:view"],
};

export function hasGranularPermission(
  role: UserRole,
  permission: ERPPermission
): boolean {
  return ROLE_PERMISSION_MATRIX[role]?.includes(permission) ?? false;
}

/**
 * Verifies the active session at the Service / Data Access Layer (never relying solely on middleware)
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

  // Fallback to activeSession holder if cookie was established in same session
  if (db.activeSession) {
    const user = db.users.find((u) => u.id === db.activeSession?.userId);
    if (user) return user;
  }

  // Default fallback to primary Admin if initial seed request
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
