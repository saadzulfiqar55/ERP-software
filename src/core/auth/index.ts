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
  if (decoded) {
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

/**
 * Strips `passwordHash` and private PIN credentials from all client responses
 * unless an authenticated Super Admin is managing staff profiles.
 */
export function sanitizeUserForClient(
  user: UserProfile,
  viewer: UserProfile | null
): UserProfile {
  const { passwordHash: _omitHash, ...rest } = user;
  void _omitHash;

  const isViewerAdmin = viewer?.role === "ADMIN";

  return {
    ...rest,
    authType:
      user.role === "ADMIN" || user.authType === "PASSWORD" ? "PASSWORD" : "PIN",
    isDemoAccount: false,
    pin:
      user.role === "ADMIN" || user.authType === "PASSWORD"
        ? ""
        : isViewerAdmin
        ? user.pin || ""
        : "",
  };
}
