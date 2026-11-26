import { NextResponse } from "next/server";
import { mapDataLayerError, withTransaction } from "@/core/db";
import { cookies } from "next/headers";
import { DEFAULT_TENANT_ID } from "@/core/audit";
import { readVerifiedJwtCookie, sanitizeUserForClient } from "@/core/auth";
import { sanitizeNoSqlPayload } from "@/core/validation";
import { findUserAcrossTenantsAsync, readTenantAuthView } from "@/lib/db";
import { signJwt } from "@/lib/auth-jwt";
import {
  buildSessionCookieOptions,
  STACKLYRA_CONFIG,
} from "@/lib/config";
import {
  migrateLegacyPins,
  timingSafeEqualStrings,
  verifyPassword,
  verifyPin,
} from "@/lib/password";
import { ActiveSession, SessionAuditLog } from "@/lib/types";

export const dynamic = "force-dynamic";

// Sliding-window brute-force protection for failed login attempts
const MAX_FAILED_ATTEMPTS = 8;
const WINDOW_MS = 5 * 60 * 1000;
// Persistent per-profile lockout (stored on the user record)
const MAX_PROFILE_FAILED_ATTEMPTS = 5;
const PROFILE_LOCKOUT_MS = 15 * 60 * 1000;
const failedLoginStore = new Map<string, { count: number; resetAt: number }>();

function getClientKey(request: Request, identifier: string): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const ip = forwarded || realIp || "local";
  return `${ip}:${identifier || "unknown"}`;
}

function isRateLimited(key: string): boolean {
  const entry = failedLoginStore.get(key);
  if (!entry) return false;
  if (Date.now() > entry.resetAt) {
    failedLoginStore.delete(key);
    return false;
  }
  return entry.count >= MAX_FAILED_ATTEMPTS;
}

function recordFailedAttempt(key: string): void {
  const now = Date.now();
  const existing = failedLoginStore.get(key);
  if (!existing || now > existing.resetAt) {
    failedLoginStore.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    existing.count += 1;
  }
}

function clearFailedAttempts(key: string): void {
  failedLoginStore.delete(key);
}

export async function GET() {
  try {
    return await handleGet();
  } catch (err) {
    const dataLayer = mapDataLayerError(err);
    if (dataLayer) {
      return NextResponse.json(dataLayer.body, { status: dataLayer.status });
    }
    console.error("[api] GET failed:", err);
    return NextResponse.json({ error: "Request failed." }, { status: 500 });
  }
}

async function handleGet() {
  const verified = await readVerifiedJwtCookie();

  if (!verified) {
    return NextResponse.json({
      authenticated: false,
      user: null,
      tenant: null,
      activeSession: null,
      sessionAuditLogs: [],
    });
  }

  const { token, decoded } = verified;
  const tenantId = decoded.tid || DEFAULT_TENANT_ID;
  const db = await readTenantAuthView(tenantId);
  const user = db.users.find((u) => u.id === decoded.sub) || null;

  if (!user) {
    return NextResponse.json({
      authenticated: false,
      user: null,
      tenant: null,
      activeSession: null,
      sessionAuditLogs: [],
    });
  }

  const sessionView: ActiveSession = {
    sessionId: decoded.sid,
    tenantId: db.tenant.id,
    tenantSlug: db.tenant.slug,
    branchId: user.branchId,
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    membershipRole: user.membershipRole,
    isPlatformAdmin: user.isPlatformAdmin,
    userTitle: user.title,
    email: user.email,
    authMethod: decoded.authMethod,
    issuedAt: new Date(decoded.iat * 1000).toISOString(),
    expiresAt: new Date(decoded.exp * 1000).toISOString(),
    lastHeartbeatAt: new Date().toISOString(),
    jwtTokenPreview: `${token.slice(0, 28)}...${token.slice(-16)}`,
  };

  return NextResponse.json({
    authenticated: true,
    user: sanitizeUserForClient(user, user),
    tenant: db.tenant,
    decodedJwt: decoded,
    activeSession: sessionView,
    sessionAuditLogs: db.sessionAuditLogs,
  });
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.json();
    const body = sanitizeNoSqlPayload(rawBody);
    const cookieStore = await cookies();

    // 1. LOGOUT / CLEAR CALLER COOKIE
    if (body.action === "LOGOUT") {
      const verified = await readVerifiedJwtCookie();
      if (verified) {
        // Signing out must always clear the cookie, even if the audit write fails.
        try {
        const { decoded } = verified;
        const db = await readTenantAuthView(decoded.tid || DEFAULT_TENANT_ID);
        const actor = db.users.find((u) => u.id === decoded.sub);

        if (actor) {
          const logEntry: SessionAuditLog = {
            id: `audit-${Date.now()}`,
            tenantId: db.tenant.id,
            timestamp: new Date().toISOString(),
            event: "LOGOUT",
            userId: actor.id,
            userName: actor.name,
            userRole: actor.role,
            details: `Session ${decoded.sid} signed out cleanly from workspace "${db.tenant.slug}".`,
          };
          await withTransaction(
            (txDb) => {
              txDb.sessionAuditLogs = [logEntry, ...txDb.sessionAuditLogs.slice(0, 29)];
            },
            undefined,
            db.tenant.id,
            { readBack: false }
          );
        }
        } catch (logoutErr) {
          console.error("[auth] logout audit write failed:", logoutErr);
        }
      }

      cookieStore.delete(STACKLYRA_CONFIG.cookieName);
      cookieStore.delete(STACKLYRA_CONFIG.legacyCookieName);
      return NextResponse.json({
        authenticated: false,
        activeSession: null,
        sessionAuditLogs: [],
      });
    }

    // 2. REFRESH / EXTEND CALLER SESSION (+12 HOURS)
    if (body.action === "REFRESH_SESSION") {
      const verified = await readVerifiedJwtCookie();
      if (!verified) {
        return NextResponse.json(
          { error: "No active session to refresh" },
          { status: 401 }
        );
      }
      const { decoded } = verified;
      const db = await readTenantAuthView(decoded.tid || DEFAULT_TENANT_ID);
      const user = db.users.find((u) => u.id === decoded.sub);
      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      const sessionId = `SES-${Date.now().toString().slice(-6)}`;
      const { token: refreshedToken, fullPayload } = signJwt(
        {
          sub: user.id,
          tid: db.tenant.id,
          tslug: db.tenant.slug,
          bid: user.branchId,
          name: user.name,
          role: user.role,
          membershipRole: user.membershipRole,
          isPlatformAdmin: user.isPlatformAdmin,
          email: user.email,
          sid: sessionId,
          authMethod: decoded.authMethod,
        },
        12 * 60 * 60
      );

      const updatedSession: ActiveSession = {
        sessionId,
        tenantId: db.tenant.id,
        tenantSlug: db.tenant.slug,
        branchId: user.branchId,
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        membershipRole: user.membershipRole,
        isPlatformAdmin: user.isPlatformAdmin,
        userTitle: user.title,
        email: user.email,
        authMethod: decoded.authMethod,
        issuedAt: new Date(fullPayload.iat * 1000).toISOString(),
        expiresAt: new Date(fullPayload.exp * 1000).toISOString(),
        lastHeartbeatAt: new Date().toISOString(),
        jwtTokenPreview: `${refreshedToken.slice(0, 28)}...${refreshedToken.slice(-16)}`,
      };

      const logEntry: SessionAuditLog = {
        id: `audit-${Date.now()}`,
        tenantId: db.tenant.id,
        timestamp: new Date().toISOString(),
        event: "TOKEN_REFRESH",
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        details: `Refreshed HS256 JWT token (${sessionId}) for +12h shift.`,
      };

      await withTransaction(
        (txDb) => {
          txDb.sessionAuditLogs = [logEntry, ...txDb.sessionAuditLogs.slice(0, 29)];
        },
        undefined,
        db.tenant.id,
        { readBack: false }
      );

      cookieStore.set(
        STACKLYRA_CONFIG.cookieName,
        refreshedToken,
        buildSessionCookieOptions(12 * 60 * 60)
      );

      return NextResponse.json({
        authenticated: true,
        user: sanitizeUserForClient(user, user),
        tenant: db.tenant,
        decodedJwt: fullPayload,
        activeSession: updatedSession,
        sessionAuditLogs: [logEntry, ...db.sessionAuditLogs].slice(0, 30),
      });
    }

    // 3. TENANT-AWARE LOGIN (USERNAME/EMAIL + PASSWORD OR WORKSPACE + STAFF PIN)
    const requestedSlug =
      typeof body.tenantSlug === "string"
        ? body.tenantSlug.trim().toLowerCase()
        : undefined;
    const identifier =
      typeof body.username === "string"
        ? body.username.trim().toLowerCase()
        : "";
    const rateKey = getClientKey(
      request,
      `${requestedSlug || "any"}:${identifier || String(body.userId || "")}`
    );
    if (isRateLimited(rateKey)) {
      return NextResponse.json(
        {
          error:
            "Too many failed sign-in attempts. Please wait 5 minutes and try again.",
        },
        { status: 429 }
      );
    }

    const match = await findUserAcrossTenantsAsync({
      tenantSlug: requestedSlug,
      userId: typeof body.userId === "string" ? body.userId : undefined,
      identifier: identifier || undefined,
    });

    if (!match) {
      recordFailedAttempt(rateKey);
      return NextResponse.json(
        {
          error: requestedSlug
            ? `No matching account found in workspace "${requestedSlug}".`
            : "Invalid username, email, or workspace credentials.",
        },
        { status: 401 }
      );
    }

    const { tenant: targetTenant, user: targetUser, db } = match;

    // Per-profile lockout, persisted with the user so it holds across server instances
    // and cannot be bypassed by rotating IPs or spoofing X-Forwarded-For.
    const lockedUntilMs = targetUser.lockedUntil
      ? Date.parse(targetUser.lockedUntil)
      : 0;
    if (lockedUntilMs && lockedUntilMs > Date.now()) {
      const minutesLeft = Math.max(
        1,
        Math.ceil((lockedUntilMs - Date.now()) / 60_000)
      );
      return NextResponse.json(
        {
          error: `This profile is locked after too many failed attempts. Try again in ${minutesLeft} minute(s) or ask an admin to reset it.`,
        },
        { status: 429 }
      );
    }

    // Counts a failed attempt against the profile. Runs under the tenant lock and reads the
    // current counter from the database, so concurrent guesses cannot undercount.
    const registerProfileFailure = async () => {
      recordFailedAttempt(rateKey);
      await withTransaction(
        (txDb) => {
          const fresh = txDb.users.find((u) => u.id === targetUser.id);
          if (!fresh) return;
          const attempts = (fresh.failedLoginAttempts || 0) + 1;
          const shouldLock = attempts >= MAX_PROFILE_FAILED_ATTEMPTS;
          txDb.users = txDb.users.map((u) =>
            u.id === fresh.id
              ? {
                  ...u,
                  failedLoginAttempts: shouldLock ? 0 : attempts,
                  lockedUntil: shouldLock
                    ? new Date(Date.now() + PROFILE_LOCKOUT_MS).toISOString()
                    : u.lockedUntil,
                }
              : u
          );
          if (shouldLock) {
            const lockLog: SessionAuditLog = {
              id: `audit-${Date.now()}`,
              tenantId: txDb.tenant.id,
              timestamp: new Date().toISOString(),
              event: "LOGIN_LOCKOUT",
              userId: fresh.id,
              userName: fresh.name,
              userRole: fresh.role,
              details: `Profile locked for ${PROFILE_LOCKOUT_MS / 60_000} minutes after ${MAX_PROFILE_FAILED_ATTEMPTS} failed sign-in attempts.`,
            };
            txDb.sessionAuditLogs = [lockLog, ...txDb.sessionAuditLogs.slice(0, 29)];
          }
        },
        undefined,
        db.tenant.id,
        { readBack: false }
      );
    };

    const requiresPassword =
      targetUser.role === "ADMIN" || targetUser.authType === "PASSWORD";

    if (requiresPassword) {
      const providedPassword =
        typeof body.password === "string" ? body.password : "";
      if (!providedPassword) {
        return NextResponse.json(
          { error: "Username and password are required." },
          { status: 401 }
        );
      }

      const envAdminPassword = process.env.ADMIN_PASSWORD?.trim();
      const envOverrideMatches =
        Boolean(envAdminPassword) &&
        targetTenant.id === DEFAULT_TENANT_ID &&
        targetUser.id === "user-admin-1" &&
        !targetUser.passwordUpdatedInDb &&
        timingSafeEqualStrings(providedPassword, envAdminPassword!);

      const hashMatches = verifyPassword(
        providedPassword,
        targetUser.passwordHash
      );

      if (!envOverrideMatches && !hashMatches) {
        await registerProfileFailure();
        return NextResponse.json(
          { error: "Invalid Owner / Super Admin username or password." },
          { status: 401 }
        );
      }
    } else {
      const providedPin = typeof body.pin === "string" ? body.pin.trim() : "";
      if (!providedPin || !verifyPin(providedPin, targetUser)) {
        await registerProfileFailure();
        return NextResponse.json(
          { error: `Invalid 4-digit PIN for ${targetUser.name}.` },
          { status: 401 }
        );
      }
    }

    clearFailedAttempts(rateKey);

    const authMethod: "JWT_PIN" | "OAUTH_SSO" = "JWT_PIN";
    const resolvedTenant = targetTenant;

    const sessionId = `SES-${Date.now().toString().slice(-6)}`;
    const { token, fullPayload } = signJwt(
      {
        sub: targetUser.id,
        tid: resolvedTenant.id,
        tslug: resolvedTenant.slug,
        bid: targetUser.branchId,
        name: targetUser.name,
        role: targetUser.role,
        membershipRole: targetUser.membershipRole,
        isPlatformAdmin: targetUser.isPlatformAdmin,
        email: targetUser.email,
        sid: sessionId,
        authMethod,
      },
      8 * 60 * 60
    );

    const newSession: ActiveSession = {
      sessionId,
      tenantId: resolvedTenant.id,
      tenantSlug: resolvedTenant.slug,
      branchId: targetUser.branchId,
      userId: targetUser.id,
      userName: targetUser.name,
      userRole: targetUser.role,
      membershipRole: targetUser.membershipRole,
      isPlatformAdmin: targetUser.isPlatformAdmin,
      userTitle: targetUser.title,
      email: targetUser.email,
      authMethod,
      issuedAt: new Date(fullPayload.iat * 1000).toISOString(),
      expiresAt: new Date(fullPayload.exp * 1000).toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
      jwtTokenPreview: `${token.slice(0, 28)}...${token.slice(-16)}`,
    };

    const auditEntry: SessionAuditLog = {
      id: `audit-${Date.now()}`,
      tenantId: resolvedTenant.id,
      timestamp: new Date().toISOString(),
      event: "LOGIN_SUCCESS",
      userId: targetUser.id,
      userName: targetUser.name,
      userRole: targetUser.role,
      details: `Signed in to workspace "${resolvedTenant.slug}" via ${authMethod} (Session ${sessionId}).`,
    };

    // Successful sign-in: reset the lockout counter, upgrade a legacy plaintext PIN to a
    // hash, and record the login — all in one transaction.
    await withTransaction(
      (txDb) => {
        txDb.users = txDb.users.map((u) => {
          if (u.id !== targetUser.id) return u;
          const next = { ...u };
          if (next.failedLoginAttempts || next.lockedUntil) {
            next.failedLoginAttempts = 0;
            next.lockedUntil = undefined;
          }
          migrateLegacyPins([next]);
          return next;
        });
        txDb.sessionAuditLogs = [auditEntry, ...txDb.sessionAuditLogs.slice(0, 29)];
      },
      undefined,
      resolvedTenant.id,
      { readBack: false }
    );

    cookieStore.set(
      STACKLYRA_CONFIG.cookieName,
      token,
      buildSessionCookieOptions(8 * 60 * 60)
    );

    return NextResponse.json({
      authenticated: true,
      user: sanitizeUserForClient(targetUser, targetUser),
      tenant: resolvedTenant,
      decodedJwt: fullPayload,
      activeSession: newSession,
      sessionAuditLogs: [auditEntry, ...db.sessionAuditLogs].slice(0, 30),
    });
  } catch (err) {
    const dataLayer = mapDataLayerError(err);
    if (dataLayer) {
      return NextResponse.json(dataLayer.body, { status: dataLayer.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Authentication failed" },
      { status: 400 }
    );
  }
}
