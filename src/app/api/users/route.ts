import { NextResponse } from "next/server";
import { appendAuditLog, DEFAULT_BRANCH_ID, DEFAULT_TENANT_ID } from "@/core/audit";
import {
  assertActorPermission,
  buildRoleLegacyPermissions,
  ROLE_PERMISSION_MATRIX,
} from "@/core/auth";
import { withTransaction } from "@/core/db";
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

    const { result, db } = await withTransaction(async (txDb) => {
      const actor = await assertActorPermission(txDb, "users:manage");

      const action = (body.action as string) || "CREATE";

      if (action === "DELETE") {
        const targetId = String(body.userId || "").trim();
        const target = txDb.users.find((u) => u.id === targetId);
        if (!target) {
          throw new Error("Profile not found.");
        }
        if (target.id === actor.id) {
          throw new Error("You cannot delete your own active Super Admin session profile.");
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

        return { removedUserId: targetId };
      }

      const name = String(body.name || "").trim();
      const role = String(body.role || "CASHIER").toUpperCase() as UserRole;
      const title = String(body.title || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const pin = String(body.pin || "").trim();

      if (!name || name.length < 2) {
        throw new Error("Profile name must be at least 2 characters.");
      }
      if (!["ADMIN", "MANAGER", "CASHIER"].includes(role)) {
        throw new Error("Invalid role. Allowed roles: ADMIN, MANAGER, CASHIER.");
      }
      if (!/^\d{4}$/.test(pin)) {
        throw new Error("PIN must be exactly 4 digits.");
      }
      if (!email || !email.includes("@")) {
        throw new Error("Provide a valid work email address.");
      }

      if (action === "UPDATE") {
        const userId = String(body.userId || "").trim();
        const existing = txDb.users.find((u) => u.id === userId);
        if (!existing) {
          throw new Error("Profile not found.");
        }
        if (existing.role === "ADMIN" && role !== "ADMIN") {
          const adminCount = txDb.users.filter((u) => u.role === "ADMIN").length;
          if (adminCount <= 1) {
            throw new Error("Cannot demote the last Owner / Super Admin profile.");
          }
        }
        if (txDb.users.some((u) => u.id !== userId && u.email.toLowerCase() === email)) {
          throw new Error("Another profile already uses that email.");
        }

        const updated: UserProfile = {
          ...existing,
          name,
          role,
          title: title || existing.title,
          email,
          pin,
          avatarInitials: computeInitials(name),
          badgeColor: badgeColorForRole(role),
          granularPermissions: ROLE_PERMISSION_MATRIX[role],
          permissions: buildRoleLegacyPermissions(role),
        };

        txDb.users = txDb.users.map((u) => (u.id === userId ? updated : u));
        appendAuditLog(txDb, {
          actorId: actor.id,
          actorName: actor.name,
          actorRole: actor.role,
          module: "AUTH",
          action: "UPDATE",
          entityType: "UserProfile",
          entityId: updated.id,
          summary: `Super Admin updated profile "${updated.name}" (${updated.role}).`,
        });
        return { user: updated };
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
        pin,
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

      return { user: created };
    });

    return NextResponse.json({
      ...result,
      users: db.users,
      immutableAuditLogs: db.immutableAuditLogs,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to manage user profile";
    const status = message.includes("Access Denied") || message.includes("Super Admin")
      ? 403
      : message.includes("Authentication required")
      ? 401
      : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
