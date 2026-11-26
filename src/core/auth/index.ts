import { cookies } from "next/headers";
import { DEFAULT_TENANT_ID } from "@/core/audit";
import { JWTPayload, verifyJwt } from "@/lib/auth-jwt";
import { STACKLYRA_CONFIG } from "@/lib/config";
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
 * Reads and verifies the caller's HS256 JWT from `stacklyra_session_jwt`
 * (with seamless fallback to legacy `albarka_session_jwt`).
 */
export async function readVerifiedJwtCookie(): Promise<{
  token: string;
  decoded: JWTPayload;
} | null> {
  const cookieStore = await cookies();
  const token =
    cookieStore.get(STACKLYRA_CONFIG.cookieName)?.value ||
    cookieStore.get(STACKLYRA_CONFIG.legacyCookieName)?.value;
  if (!token) return null;

  const decoded = verifyJwt(token);
  if (!decoded) return null;
  return { token, decoded };
}

/**
 * Resolves the authenticated `tenantId` strictly from the verified JWT session cookie.
 * Never trusts client-supplied body/query tenant IDs for protected mutations.
 */
export async function resolveAuthenticatedTenantId(): Promise<string | null> {
  const verified = await readVerifiedJwtCookie();
  return verified?.decoded.tid || null;
}

/**
 * Resolves the authenticated actor from the HTTP-only HS256 JWT cookie when present.
 * Verifies that the user belongs to the active `db.tenant.id`.
 */
export async function tryResolveOptionalActor(
  db: DatabaseSchema
): Promise<UserProfile | null> {
  const verified = await readVerifiedJwtCookie();
  if (!verified) return null;

  const { decoded } = verified;
  const expectedTenantId = db.tenant?.id || DEFAULT_TENANT_ID;
  if (decoded.tid && decoded.tid !== expectedTenantId) {
    return null;
  }

  const user = db.users.find((u) => u.id === decoded.sub);
  return user || null;
}

/**
 * Verifies the active session at the Service / Data Access Layer (Server-only).
 * Rejects unauthenticated or cross-tenant calls explicitly.
 */
export async function resolveAuthenticatedActor(
  db: DatabaseSchema
): Promise<UserProfile> {
  const actor = await tryResolveOptionalActor(db);
  if (!actor) {
    throw new Error("Authentication required: Sign in with an active workspace profile.");
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
 * unless an authenticated Owner / Admin is managing staff profiles in their own tenant.
 */
export function sanitizeUserForClient(
  user: UserProfile,
  viewer: UserProfile | null
): UserProfile {
  const {
    passwordHash: _omitHash,
    pinHash: _omitPinHash,
    failedLoginAttempts: _omitAttempts,
    lockedUntil,
    ...rest
  } = user;
  void _omitHash;
  void _omitPinHash;
  void _omitAttempts;

  const isViewerAdmin =
    viewer?.role === "ADMIN" && viewer?.tenantId === user.tenantId;

  return {
    ...rest,
    authType:
      user.role === "ADMIN" || user.authType === "PASSWORD" ? "PASSWORD" : "PIN",
    isDemoAccount: false,
    // PINs are write-only: never returned to any client, including admins.
    pin: "",
    ...(isViewerAdmin && lockedUntil ? { lockedUntil } : {}),
  };
}
