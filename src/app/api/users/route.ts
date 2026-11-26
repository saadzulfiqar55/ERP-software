import { NextResponse } from "next/server";
import { appendAuditLog, DEFAULT_BRANCH_ID, DEFAULT_TENANT_ID } from "@/core/audit";
import {
  assertActorPermission,
  buildRoleLegacyPermissions,
  resolveAuthenticatedTenantId,
  ROLE_PERMISSION_MATRIX,
  sanitizeUserForClient,
} from "@/core/auth";
import { mapDataLayerError, withTransaction } from "@/core/db";
import {
  assertTenantSeatQuota,
  assertTenantWriteActive,
  SaaSEntitlementError,
} from "@/core/saas/entitlements";
import {
  hashPassword,
  hashPin,
  migrateLegacyPins,
  timingSafeEqualStrings,
  verifyPassword,
} from "@/lib/password";
import { sanitizeNoSqlPayload } from "@/core/validation";
import { UserProfile, UserRole } from "@/lib/types";

function computeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "US";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function badgeColorForRole(role: UserRole): string {
  if (role === "ADMIN") return "crimson";
  if (role === "MANAGER") return "indigo";
  return "slate";
}

export async function POST(request: Request) {
  try {
    const sessionTenantId = await resolveAuthenticatedTenantId();
    if (!sessionTenantId) {
      return NextResponse.json(
        { error: "Authentication required: Sign in with an active workspace profile." },
        { status: 401 }
      );
    }

    const rawBody = await request.json();
    const body = sanitizeNoSqlPayload(rawBody);

    const { result, db, actorRef } = await withTransaction(
      async (txDb) => {
        const actor = await assertActorPermission(txDb, "users:manage");
        assertTenantWriteActive(txDb.tenant);
        const tenantId = txDb.tenant.id;

        const action = (body.action as string) || "CREATE";

        // Upgrade any legacy plaintext staff PINs in this workspace to scrypt hashes.
        migrateLegacyPins(txDb.users);

        if (action === "RESET_PIN") {
          const targetId = String(body.userId || "").trim();
          const target = txDb.users.find(
            (u) => u.id === targetId && u.tenantId === tenantId
          );
          if (!target) {
            throw new Error("Profile not found in this workspace.");
          }
          if (target.role === "ADMIN" || target.authType === "PASSWORD") {
            throw new Error("Password profiles do not use a PIN.");
          }
          const newPin = String(body.pin || "").trim();
          if (!/^\d{4}$/.test(newPin)) {
            throw new Error("Staff PIN must be exactly 4 digits.");
          }
          txDb.users = txDb.users.map((u) =>
            u.id === targetId
              ? {
                  ...u,
                  pin: "",
                  pinHash: hashPin(newPin),
                  failedLoginAttempts: 0,
                  lockedUntil: undefined,
                }
              : u
          );
          appendAuditLog(txDb, {
            tenantId,
            actorId: actor.id,
            actorName: actor.name,
            actorRole: actor.role,
            module: "AUTH",
            action: "UPDATE",
            entityType: "UserProfile",
            entityId: targetId,
            summary: `Reset PIN and cleared sign-in lockout for "${target.name}".`,
          });
          return { pinResetUserId: targetId, actor };
        }

        if (action === "UNLOCK") {
          const targetId = String(body.userId || "").trim();
          const target = txDb.users.find(
            (u) => u.id === targetId && u.tenantId === tenantId
          );
          if (!target) {
            throw new Error("Profile not found in this workspace.");
          }
          txDb.users = txDb.users.map((u) =>
            u.id === targetId
              ? { ...u, failedLoginAttempts: 0, lockedUntil: undefined }
              : u
          );
          appendAuditLog(txDb, {
            tenantId,
            actorId: actor.id,
            actorName: actor.name,
            actorRole: actor.role,
            module: "AUTH",
            action: "UPDATE",
            entityType: "UserProfile",
            entityId: targetId,
            summary: `Cleared sign-in lockout for "${target.name}".`,
          });
          return { unlockedUserId: targetId, actor };
        }

        if (action === "CHANGE_PASSWORD") {
          const currentPassword = String(body.currentPassword || "");
          const newPassword = String(body.newPassword || "");
          if (newPassword.length < 8) {
            throw new Error(
              "New Super Admin password must be at least 8 characters."
            );
          }

          const envAdminPassword = process.env.ADMIN_PASSWORD?.trim();
          const envMatches =
            Boolean(envAdminPassword) &&
            tenantId === DEFAULT_TENANT_ID &&
            actor.id === "user-admin-1" &&
            !actor.passwordUpdatedInDb &&
            timingSafeEqualStrings(currentPassword, envAdminPassword!);
          const hashMatches = verifyPassword(
            currentPassword,
            actor.passwordHash
          );

          if (!envMatches && !hashMatches) {
            throw new Error("Current password is incorrect.");
          }

          const nextHash = hashPassword(newPassword);
          txDb.users = txDb.users.map((u) =>
            u.id === actor.id
              ? {
                  ...u,
                  pin: "",
                  authType: "PASSWORD",
                  isDemoAccount: false,
                  passwordHash: nextHash,
                  passwordUpdatedInDb: true,
                }
              : u
          );

          appendAuditLog(txDb, {
            tenantId,
            actorId: actor.id,
            actorName: actor.name,
            actorRole: actor.role,
            module: "AUTH",
            action: "UPDATE",
            entityType: "UserProfile",
            entityId: actor.id,
            summary: `Owner / Admin "${actor.name}" rotated their account password.`,
          });

          return { passwordChanged: true, actor };
        }

        if (action === "DELETE") {
          const targetId = String(body.userId || "").trim();
          const target = txDb.users.find(
            (u) => u.id === targetId && u.tenantId === tenantId
          );
          if (!target) {
            throw new Error("Profile not found in this workspace.");
          }
          if (target.id === actor.id) {
            throw new Error(
              "You cannot delete your own active session profile."
            );
          }
          if (target.role === "ADMIN") {
            const adminCount = txDb.users.filter(
              (u) => u.role === "ADMIN" && u.tenantId === tenantId
            ).length;
            if (adminCount <= 1) {
              throw new Error(
                "Cannot remove the last Owner / Super Admin profile."
              );
            }
          }

          txDb.users = txDb.users.filter((u) => u.id !== targetId);
          if (txDb.activeSession?.userId === targetId) {
            txDb.activeSession = null;
          }

          appendAuditLog(txDb, {
            tenantId,
            actorId: actor.id,
            actorName: actor.name,
            actorRole: actor.role,
            module: "AUTH",
            action: "SOFT_ARCHIVE",
            entityType: "UserProfile",
            entityId: targetId,
            summary: `Removed staff profile "${target.name}" (${target.role}).`,
          });

          return { removedUserId: targetId, actor };
        }

        // Enforce SaaS plan seat quota before adding a new staff member
        const tenantStaffCount = txDb.users.filter(
          (u) => u.tenantId === tenantId
        ).length;
        assertTenantSeatQuota(txDb.tenant, tenantStaffCount);

        const name = String(body.name || "").trim();
        const username = String(body.username || "")
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9._-]/g, "");
        const role = String(body.role || "CASHIER").toUpperCase() as UserRole;
        const title = String(body.title || "").trim();
        const rawEmail = String(body.email || "").trim().toLowerCase();
        const pin = String(body.pin || "").trim();
        const password = String(body.password || "");

        if (!name || name.length < 2) {
          throw new Error("Profile name must be at least 2 characters.");
        }
        if (!["ADMIN", "MANAGER", "CASHIER"].includes(role)) {
          throw new Error("Invalid role. Allowed roles: ADMIN, MANAGER, CASHIER.");
        }

        const fallbackSlug =
          name.toLowerCase().replace(/[^a-z0-9]/g, "") ||
          `staff${Date.now().toString().slice(-4)}`;
        const resolvedUsername =
          username || (rawEmail ? rawEmail.split("@")[0] : fallbackSlug);
        if (!resolvedUsername || resolvedUsername.length < 2) {
          throw new Error("Username must be at least 2 characters.");
        }
        const email =
          rawEmail || `${resolvedUsername}@${txDb.tenant.slug}.stacklyra.local`;
        if (!email.includes("@")) {
          throw new Error("Provide a valid work email address.");
        }

        if (role === "ADMIN") {
          if (password.length < 8) {
            throw new Error(
              "Admin profiles require a password of at least 8 characters."
            );
          }
        } else if (!/^\d{4}$/.test(pin)) {
          throw new Error("Staff PIN must be exactly 4 digits.");
        }

        if (
          txDb.users.some(
            (u) => u.tenantId === tenantId && u.email.toLowerCase() === email
          )
        ) {
          throw new Error(
            "A profile with this email already exists in your workspace."
          );
        }
        if (
          txDb.users.some(
            (u) =>
              u.tenantId === tenantId &&
              u.username &&
              u.username.toLowerCase() === resolvedUsername
          )
        ) {
          throw new Error(
            "A profile with this username already exists in your workspace."
          );
        }

        const created: UserProfile = {
          id: `user-${role.toLowerCase()}-${Date.now()}`,
          tenantId,
          tenantSlug: txDb.tenant.slug,
          branchId: DEFAULT_BRANCH_ID,
          name,
          username: resolvedUsername,
          role,
          membershipRole:
            role === "ADMIN"
              ? "ADMIN"
              : role === "MANAGER"
              ? "MANAGER"
              : "CASHIER",
          isPlatformAdmin: false,
          title:
            title ||
            (role === "ADMIN"
              ? "Owner / Co-Admin"
              : role === "MANAGER"
              ? "Floor / Shift Manager"
              : "POS Cashier"),
          email,
          pin: "",
          pinHash: role === "ADMIN" ? undefined : hashPin(pin),
          authType: role === "ADMIN" ? "PASSWORD" : "PIN",
          isDemoAccount: false,
          passwordHash: role === "ADMIN" ? hashPassword(password) : undefined,
          avatarInitials: computeInitials(name),
          badgeColor: badgeColorForRole(role),
          granularPermissions: ROLE_PERMISSION_MATRIX[role],
          permissions: buildRoleLegacyPermissions(role),
        };

        txDb.users = [...txDb.users, created];
        appendAuditLog(txDb, {
          tenantId,
          actorId: actor.id,
          actorName: actor.name,
          actorRole: actor.role,
          module: "AUTH",
          action: "CREATE",
          entityType: "UserProfile",
          entityId: created.id,
          summary: `Added new ${created.role} profile "${created.name}" to workspace "${txDb.tenant.slug}".`,
        });

        return { user: sanitizeUserForClient(created, actor), actor };
      },
      ["USERS", "SESSIONS", "IMMUTABLE_AUDIT_LOGS"],
      sessionTenantId
    ).then(({ result: inner, db: nextDb }) => ({
      result: inner,
      db: nextDb,
      actorRef: inner.actor,
    }));

    return NextResponse.json({
      ...result,
      users: db.users.map((u) => sanitizeUserForClient(u, actorRef)),
      immutableAuditLogs: db.immutableAuditLogs,
    });
  } catch (err) {
    const dataLayer = mapDataLayerError(err);
    if (dataLayer) {
      return NextResponse.json(dataLayer.body, { status: dataLayer.status });
    }
    if (err instanceof SaaSEntitlementError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.statusCode }
      );
    }
    const message =
      err instanceof Error ? err.message : "Failed to manage user profile";
    const status =
      message.includes("Access Denied") || message.includes("Super Admin")
        ? 403
        : message.includes("Authentication required")
        ? 401
        : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
