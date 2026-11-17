import { cookies } from "next/headers";
import { verifyJwt } from "@/lib/auth-jwt";
import { DatabaseSchema } from "@/lib/db";
import { ERPPermission, UserProfile } from "@/lib/types";
import {
  buildRoleLegacyPermissions,
  hasGranularPermission,
  isSuperAdminRole,
  ROLE_HIERARCHY_RANK,
  ROLE_PERMISSION_MATRIX,
} from "./permissions";

export {
  buildRoleLegacyPermissions,
  hasGranularPermission,
  isSuperAdminRole,
  ROLE_HIERARCHY_RANK,
  ROLE_PERMISSION_MATRIX,
};

/**
 * Resolves the authenticated actor from the HTTP-only HS256 JWT cookie when present.
 * Returns null if unauthenticated or expired (never falls back to an admin user).
 */
export async function tryResolveOptionalActor(
  db: DatabaseSchema
): Promise<UserProfile | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("albarka_session_jwt")?.value;
  if (!token) return null;

  const decoded = verifyJwt(token);
  if (
    decoded &&
    db.activeSession &&
    db.activeSession.sessionId === decoded.sid &&
    new Date(db.activeSession.expiresAt).getTime() > Date.now()
  ) {
    const user = db.users.find((u) => u.id === decoded.sub);
    if (user) return user;
  }

  return null;
}

/**
 * Verifies the active session at the Service / Data Access Layer (Server-only).
 * Rejects unauthenticated calls explicitly to prevent privilege escalation.
 */
export async function resolveAuthenticatedActor(
  db: DatabaseSchema
): Promise<UserProfile> {
  const actor = await tryResolveOptionalActor(db);
  if (!actor) {
    throw new Error("Authentication required: Sign in with an active profile.");
  }
  return actor;
}

export async function assertActorPermission(
  db: DatabaseSchema,
  requiredPermission: ERPPermission
): Promise<UserProfile> {
  const actor = await resolveAuthenticatedActor(db);
  if (!hasGranularPermission(actor.role, requiredPermission)) {
    throw new Error(
      `RBAC Access Denied: "${actor.role}" lacks required permission "${requiredPermission}". Owner / Super Admin authorization required.`
    );
  }
  return actor;
}

export async function assertSuperAdmin(
  db: DatabaseSchema
): Promise<UserProfile> {
  const actor = await resolveAuthenticatedActor(db);
  if (!isSuperAdminRole(actor.role)) {
    throw new Error(
      `Super Admin Required: "${actor.role}" profiles cannot perform Owner / Super Admin operations.`
    );
  }
  return actor;
}
