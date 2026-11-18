import { NextResponse } from "next/server";
import { appendAuditLog, DEFAULT_BRANCH_ID, DEFAULT_TENANT_ID } from "@/core/audit";
import {
  assertActorPermission,
  buildRoleLegacyPermissions,
  ROLE_PERMISSION_MATRIX,
  sanitizeUserForClient,
} from "@/core/auth";
import { withTransaction } from "@/core/db";
import {
  hashPassword,
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
    const rawBody = await request.json();
    const body = sanitizeNoSqlPayload(rawBody);

    const { result, db, actorRef } = await withTransaction(async (txDb) => {
      const actor = await assertActorPermission(txDb, "users:manage");

      const action = (body.action as string) || "CREATE";

      if (action === "CHANGE_PASSWORD") {
        const currentPassword = String(body.currentPassword || "");
        const newPassword = String(body.newPassword || "");
        if (newPassword.length < 8) {
          throw new Error("New Super Admin password must be at least 8 characters.");
        }

        const envAdminPassword = process.env.ADMIN_PASSWORD?.trim();
        const envMatches =
          Boolean(envAdminPassword) &&
          actor.id === "user-admin-1" &&
          !actor.passwordUpdatedInDb &&
          timingSafeEqualStrings(currentPassword, envAdminPassword!);
        const hashMatches = verifyPassword(currentPassword, actor.passwordHash);

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
          actorId: actor.id,
          actorName: actor.name,
          actorRole: actor.role,
          module: "AUTH",
          action: "UPDATE",
          entityType: "UserProfile",
          entityId: actor.id,
          summary: `Super Admin "${actor.name}" rotated their account password.`,
        });

        return { passwordChanged: true, actor };
      }

      if (action === "DELETE") {
        const targetId = String(body.userId || "").trim();
        const target = txDb.users.find((u) => u.id === targetId);
        if (!target) {
          throw new Error("Profile not found.");
        }
        if (target.id === actor.id) {
          throw new Error(
            "You cannot delete your own active Super Admin session profile."
          );
        }
        if (target.role === "ADMIN") {
          const adminCount = txDb.users.filter((u) => u.role === "ADMIN").length;
          if (adminCount <= 1) {
            throw new Error("Cannot remove the last Owner / Super Admin profile.");
          }
        }

        txDb.users = txDb.users.filter((u) => u.id !== targetId);
        if (txDb.activeSession?.userId === targetId) {
          txDb.activeSession = null;
        }

        appendAuditLog(txDb, {
          actorId: actor.id,
          actorName: actor.name,
          actorRole: actor.role,
          module: "AUTH",
          action: "SOFT_ARCHIVE",
          entityType: "UserProfile",
          entityId: targetId,
          summary: `Super Admin removed staff profile "${target.name}" (${target.role}).`,
        });

        return { removedUserId: targetId, actor };
      }

      const name = String(body.name || "").trim();
      const role = String(body.role || "CASHIER").toUpperCase() as UserRole;
      const title = String(body.title || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const pin = String(body.pin || "").trim();
      const password = String(body.password || "");

      if (!name || name.length < 2) {
        throw new Error("Profile name must be at least 2 characters.");
      }
      if (!["ADMIN", "MANAGER", "CASHIER"].includes(role)) {
        throw new Error("Invalid role. Allowed roles: ADMIN, MANAGER, CASHIER.");
      }
      if (!email || !email.includes("@")) {
        throw new Error("Provide a valid work email address.");
      }

      if (role === "ADMIN") {
        if (password.length < 8) {
          throw new Error(
            "Super Admin profiles require a password of at least 8 characters."
          );
        }
      } else if (!/^\d{4}$/.test(pin)) {
        throw new Error("Staff PIN must be exactly 4 digits.");
      }

      if (txDb.users.some((u) => u.email.toLowerCase() === email)) {
        throw new Error("A profile with this email already exists.");
      }

      const created: UserProfile = {
        id: `user-${role.toLowerCase()}-${Date.now()}`,
        tenantId: DEFAULT_TENANT_ID,
        branchId: DEFAULT_BRANCH_ID,
        name,
        role,
        title:
          title ||
          (role === "ADMIN"
            ? "Owner / Co-Admin"
            : role === "MANAGER"
            ? "Floor / Shift Manager"
            : "POS Cashier"),
        email,
        pin: role === "ADMIN" ? "" : pin,
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
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        module: "AUTH",
        action: "CREATE",
        entityType: "UserProfile",
        entityId: created.id,
        summary: `Super Admin added new ${created.role} profile "${created.name}".`,
      });

      return { user: sanitizeUserForClient(created, actor), actor };
    }).then(({ result: inner, db: nextDb }) => ({
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
