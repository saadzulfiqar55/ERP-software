import { NextResponse } from "next/server";
import { mapDataLayerError, withTransaction } from "@/core/db";
import { cookies } from "next/headers";
import { DEFAULT_BRANCH_ID, DEFAULT_TENANT_ID } from "@/core/audit";
import {
  buildRoleLegacyPermissions,
  readVerifiedJwtCookie,
  ROLE_PERMISSION_MATRIX,
  sanitizeUserForClient,
} from "@/core/auth";
import {
  buildTenantSubscription,
  SAAS_PLANS,
} from "@/core/saas/entitlements";
import { sanitizeNoSqlPayload } from "@/core/validation";
import { signJwt } from "@/lib/auth-jwt";
import {
  buildSessionCookieOptions,
  getCorsHeaders,
  STACKLYRA_CONFIG,
} from "@/lib/config";
import {
  findTenantStrict,
  listTenantsRegistry,
  provisionNewTenantWorkspaceAsync,
  readTenantAuthView,
} from "@/lib/db";
import { hashPassword } from "@/lib/password";
import {
  ActiveSession,
  SubscriptionPlanId,
  TenantStatus,
  UserProfile,
} from "@/lib/types";

export const dynamic = "force-dynamic";

function computeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "SL";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request.headers.get("origin")),
  });
}

/**
 * GET /api/saas/onboarding
 * - Publicly checks workspace slug availability (`?checkSlug=crescent`)
 * - Or returns full SaaS tenants list when called by Platform Super Admin (`saad`)
 */
export async function GET(request: Request) {
  try {
    return await handleGet(request);
  } catch (err) {
    const dataLayer = mapDataLayerError(err);
    if (dataLayer) {
      return NextResponse.json(dataLayer.body, { headers: getCorsHeaders(request.headers.get("origin")), status: dataLayer.status });
    }
    console.error("[api] GET failed:", err);
    return NextResponse.json({ error: "Request failed." }, { headers: getCorsHeaders(request.headers.get("origin")), status: 500 });
  }
}

async function handleGet(request: Request) {
  const cors = getCorsHeaders(request.headers.get("origin"));
  const url = new URL(request.url);
  const checkSlug = url.searchParams.get("checkSlug")?.trim().toLowerCase();

  if (checkSlug) {
    const cleanSlug = checkSlug.replace(/[^a-z0-9-]/g, "");
    const existing = await findTenantStrict(cleanSlug);
    return NextResponse.json(
      {
        slug: cleanSlug,
        available: !existing && cleanSlug.length >= 2,
      },
      { headers: cors }
    );
  }

  const verified = await readVerifiedJwtCookie();
  if (!verified) {
    return NextResponse.json(
      { plans: Object.values(SAAS_PLANS) },
      { headers: cors }
    );
  }

  const callerDb = await readTenantAuthView(verified.decoded.tid || DEFAULT_TENANT_ID);
  const caller = callerDb.users.find((u) => u.id === verified.decoded.sub);
  const isPlatformOwner =
    Boolean(caller?.isPlatformAdmin) && callerDb.tenant.id === DEFAULT_TENANT_ID;

  if (!isPlatformOwner) {
    return NextResponse.json(
      {
        tenant: callerDb.tenant,
        plans: Object.values(SAAS_PLANS),
      },
      { headers: cors }
    );
  }

  return NextResponse.json(
    {
      isPlatformAdmin: true,
      tenants: await listTenantsRegistry(),
      plans: Object.values(SAAS_PLANS),
    },
    { headers: cors }
  );
}

/**
 * POST /api/saas/onboarding
 * 1. `action: "REGISTER_WORKSPACE"` — Self-serve SaaS workspace onboarding (creates organization + owner user + clean defaults + signs in).
 * 2. `action: "UPDATE_SUBSCRIPTION"` — Tenant owner or Platform Admin updates plan tier / status.
 */
export async function POST(request: Request) {
  const cors = getCorsHeaders(request.headers.get("origin"));
  try {
    const rawBody = await request.json();
    const body = sanitizeNoSqlPayload(rawBody);
    const action = String(body.action || "REGISTER_WORKSPACE");

    if (action === "UPDATE_SUBSCRIPTION") {
      const verified = await readVerifiedJwtCookie();
      if (!verified) {
        return NextResponse.json(
          { error: "Authentication required" },
          { status: 401, headers: cors }
        );
      }

      const callerDb = await readTenantAuthView(
        verified.decoded.tid || DEFAULT_TENANT_ID
      );
      const caller = callerDb.users.find((u) => u.id === verified.decoded.sub);
      // Plan / status changes grant paid entitlements, so only the platform owner may make
      // them manually. Tenant owners upgrade through checkout, which reaches us via the
      // signed billing webhook.
      const isPlatformOwner =
        Boolean(caller?.isPlatformAdmin) &&
        callerDb.tenant.id === DEFAULT_TENANT_ID;
      if (!caller || !isPlatformOwner) {
        return NextResponse.json(
          {
            error:
              "Plan changes are applied after payment is confirmed. Contact StackLyra billing to upgrade.",
          },
          { status: 403, headers: cors }
        );
      }

      const targetTenantId =
        typeof body.targetTenantId === "string"
          ? body.targetTenantId
          : callerDb.tenant.id;

      // Strict lookup: an unknown id must not silently fall back to the flagship tenant.
      const targetTenant = await findTenantStrict(targetTenantId);
      if (!targetTenant) {
        return NextResponse.json(
          { error: `Tenant "${targetTenantId}" not found.` },
          { status: 404, headers: cors }
        );
      }
      const allowedStatuses: TenantStatus[] = [
        "TRIALING",
        "ACTIVE",
        "PAST_DUE",
        "SUSPENDED",
      ];
      const nextStatus: TenantStatus = allowedStatuses.includes(
        body.status as TenantStatus
      )
        ? (body.status as TenantStatus)
        : "ACTIVE";

      const { db: targetDb } = await withTransaction(
        (txDb) => {
          const nextPlanId = (body.planId ||
            txDb.tenant.planId) as SubscriptionPlanId;
          if (!SAAS_PLANS[nextPlanId]) {
            throw new Error(`Invalid SaaS plan tier: ${nextPlanId}`);
          }
          const updatedSub = buildTenantSubscription(
            nextPlanId,
            nextStatus,
            body.billingCycle === "ANNUAL" ? "ANNUAL" : "MONTHLY",
            body.provider || "MANUAL_IBFT"
          );
          txDb.tenant = {
            ...txDb.tenant,
            planId: nextPlanId,
            status: nextStatus,
            subscription: updatedSub,
            updatedAt: new Date().toISOString(),
          };
        },
        undefined,
        targetTenant.id,
        { readBack: false }
      );

      return NextResponse.json(
        {
          tenant: targetDb.tenant,
          tenants: await listTenantsRegistry(),
        },
        { headers: cors }
      );
    }

    // Default: REGISTER_WORKSPACE (Self-Serve SaaS Onboarding)
    const organizationName = String(body.organizationName || "").trim();
    const rawSlug = String(body.slug || organizationName)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    const ownerName = String(body.ownerName || "").trim();
    const ownerEmail = String(body.ownerEmail || "")
      .trim()
      .toLowerCase();
    const ownerUsername =
      String(body.ownerUsername || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, "") || ownerEmail.split("@")[0];
    const password = String(body.password || "");
    const planId = (
      ["starter", "growth", "enterprise"].includes(String(body.planId))
        ? body.planId
        : "growth"
    ) as SubscriptionPlanId;
    const segment = (
      ["RESTAURANT", "RETAIL", "HYBRID"].includes(String(body.segment))
        ? body.segment
        : "HYBRID"
    ) as "RESTAURANT" | "RETAIL" | "HYBRID";

    if (!organizationName || organizationName.length < 2) {
      throw new Error("Business / Organization name must be at least 2 characters.");
    }
    if (!rawSlug || rawSlug.length < 2) {
      throw new Error("Workspace URL slug must be at least 2 characters.");
    }
    if (!ownerName || ownerName.length < 2) {
      throw new Error("Owner full name is required.");
    }
    if (!ownerEmail || !ownerEmail.includes("@")) {
      throw new Error("Valid owner email address is required.");
    }
    if (password.length < 8) {
      throw new Error("Owner password must be at least 8 characters.");
    }

    const ownerUser: UserProfile = {
      id: `user-owner-${Date.now()}`,
      tenantId: `ten-${rawSlug}`,
      tenantSlug: rawSlug,
      branchId: DEFAULT_BRANCH_ID,
      name: ownerName,
      username: ownerUsername,
      role: "ADMIN",
      membershipRole: "OWNER",
      isPlatformAdmin: false,
      title: "Workspace Owner & Super Admin",
      email: ownerEmail,
      pin: "",
      authType: "PASSWORD",
      isDemoAccount: false,
      passwordHash: hashPassword(password),
      passwordUpdatedInDb: true,
      avatarInitials: computeInitials(ownerName),
      badgeColor: "crimson",
      granularPermissions: ROLE_PERMISSION_MATRIX.ADMIN,
      permissions: buildRoleLegacyPermissions("ADMIN"),
    };

    const { tenant, db } = await provisionNewTenantWorkspaceAsync({
      organizationName,
      slug: rawSlug,
      segment,
      planId,
      ownerUser,
    });

    const sessionId = `SES-${Date.now().toString().slice(-6)}`;
    const { token, fullPayload } = signJwt(
      {
        sub: ownerUser.id,
        tid: tenant.id,
        tslug: tenant.slug,
        bid: ownerUser.branchId,
        name: ownerUser.name,
        role: ownerUser.role,
        membershipRole: "OWNER",
        isPlatformAdmin: false,
        email: ownerUser.email,
        sid: sessionId,
        authMethod: "JWT_PIN",
      },
      8 * 60 * 60
    );

    const activeSession: ActiveSession = {
      sessionId,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      branchId: ownerUser.branchId,
      userId: ownerUser.id,
      userName: ownerUser.name,
      userRole: ownerUser.role,
      membershipRole: "OWNER",
      isPlatformAdmin: false,
      userTitle: ownerUser.title,
      email: ownerUser.email,
      authMethod: "JWT_PIN",
      issuedAt: new Date(fullPayload.iat * 1000).toISOString(),
      expiresAt: new Date(fullPayload.exp * 1000).toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
      jwtTokenPreview: `${token.slice(0, 28)}...${token.slice(-16)}`,
    };

    // The workspace and owner were committed in one transaction by provisioning;
    // the session itself is a stateless JWT and needs no extra write.

    const cookieStore = await cookies();
    cookieStore.set(
      STACKLYRA_CONFIG.cookieName,
      token,
      buildSessionCookieOptions(8 * 60 * 60)
    );

    return NextResponse.json(
      {
        authenticated: true,
        tenant,
        user: sanitizeUserForClient(ownerUser, ownerUser),
        activeSession,
        sessionAuditLogs: db.sessionAuditLogs,
      },
      { status: 201, headers: cors }
    );
  } catch (err) {
    const dataLayer = mapDataLayerError(err);
    if (dataLayer) {
      return NextResponse.json(dataLayer.body, { status: dataLayer.status, headers: cors });
    }
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to provision SaaS workspace",
      },
      { status: 400, headers: cors }
    );
  }
}
