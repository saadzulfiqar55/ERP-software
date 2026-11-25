import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sanitizeUserForClient } from "@/core/auth";
import { readDbAsync, writeDbAsync } from "@/lib/db";
import { signJwt, verifyJwt } from "@/lib/auth-jwt";
import { timingSafeEqualStrings, verifyPassword } from "@/lib/password";
import { ActiveSession, SessionAuditLog } from "@/lib/types";

export const dynamic = "force-dynamic";

const COOKIE_NAME = "albarka_session_jwt";

// Sliding-window brute-force protection for failed login attempts
const MAX_FAILED_ATTEMPTS = 8;
const WINDOW_MS = 5 * 60 * 1000;
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
  const db = await readDbAsync();
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json({
      authenticated: false,
      user: null,
      activeSession: null,
      sessionAuditLogs: db.sessionAuditLogs,
    });
  }

  const decoded = verifyJwt(token);
  if (!decoded) {
    return NextResponse.json({
      authenticated: false,
      user: null,
      activeSession: null,
      sessionAuditLogs: db.sessionAuditLogs,
    });
  }

  const user = db.users.find((u) => u.id === decoded.sub) || null;
  const sessionView: ActiveSession | null = user
    ? {
        sessionId: decoded.sid,
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        userTitle: user.title,
        email: user.email,
        authMethod: decoded.authMethod,
        issuedAt: new Date(decoded.iat * 1000).toISOString(),
        expiresAt: new Date(decoded.exp * 1000).toISOString(),
        lastHeartbeatAt: new Date().toISOString(),
        jwtTokenPreview: `${token.slice(0, 28)}...${token.slice(-16)}`,
      }
    : null;

  return NextResponse.json({
    authenticated: Boolean(user),
    user: user ? sanitizeUserForClient(user, user) : null,
    decodedJwt: decoded,
    activeSession: sessionView,
    sessionAuditLogs: db.sessionAuditLogs,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const db = await readDbAsync();
    const cookieStore = await cookies();

    // Auto-clear expired lock
    if (db.activeSession && new Date(db.activeSession.expiresAt).getTime() < Date.now()) {
      db.activeSession = null;
    }

    // 1. LOGOUT / CLEAR CALLER COOKIE
    if (body.action === "LOGOUT") {
      const token = cookieStore.get(COOKIE_NAME)?.value;
      const decoded = token ? verifyJwt(token) : null;
      const actor = decoded ? db.users.find((u) => u.id === decoded.sub) : null;

      if (actor && decoded) {
        const logEntry: SessionAuditLog = {
          id: `audit-${Date.now()}`,
          timestamp: new Date().toISOString(),
          event: "LOGOUT",
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          details: `Session ${decoded.sid} signed out cleanly.`,
        };
        db.sessionAuditLogs = [logEntry, ...db.sessionAuditLogs.slice(0, 29)];
        if (db.activeSession?.sessionId === decoded.sid) {
          db.activeSession = null;
        }
        await writeDbAsync(db, ["SESSIONS", "AUDIT_LOGS"]);
      }
      cookieStore.delete(COOKIE_NAME);
      return NextResponse.json({
        authenticated: false,
        activeSession: null,
        sessionAuditLogs: db.sessionAuditLogs,
      });
    }

    // 2. REFRESH / EXTEND CALLER SESSION (+12 HOURS)
    if (body.action === "REFRESH_SESSION") {
      const token = cookieStore.get(COOKIE_NAME)?.value;
      const decoded = token ? verifyJwt(token) : null;
      if (!decoded) {
        return NextResponse.json({ error: "No active session to refresh" }, { status: 401 });
      }
      const user = db.users.find((u) => u.id === decoded.sub);
      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      const sessionId = `SES-${Date.now().toString().slice(-6)}`;
      const { token: refreshedToken, fullPayload } = signJwt(
        {
          sub: user.id,
          name: user.name,
          role: user.role,
          email: user.email,
          sid: sessionId,
          authMethod: decoded.authMethod,
        },
        12 * 60 * 60
      );

      const updatedSession: ActiveSession = {
        sessionId,
        userId: user.id,
        userName: user.name,
        userRole: user.role,
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
        timestamp: new Date().toISOString(),
        event: "TOKEN_REFRESH",
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        details: `Refreshed HS256 JWT token (${sessionId}) for +12h shift.`,
      };

      db.activeSession = updatedSession;
      db.sessionAuditLogs = [logEntry, ...db.sessionAuditLogs.slice(0, 29)];
      await writeDbAsync(db, ["SESSIONS", "AUDIT_LOGS"]);

      cookieStore.set(COOKIE_NAME, refreshedToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        path: "/",
        sameSite: "lax",
        maxAge: 12 * 60 * 60,
      });

      return NextResponse.json({
        authenticated: true,
        user: sanitizeUserForClient(user, user),
        decodedJwt: fullPayload,
        activeSession: updatedSession,
        sessionAuditLogs: db.sessionAuditLogs,
      });
    }

    // 3. LOGIN (USERNAME + PASSWORD FOR ADMIN, PIN FOR STAFF) WITH RATE LIMITING
    const identifier =
      typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
    const rateKey = getClientKey(
      request,
      identifier || String(body.userId || "")
    );
    if (isRateLimited(rateKey)) {
      return NextResponse.json(
        { error: "Too many failed sign-in attempts. Please wait 5 minutes and try again." },
        { status: 429 }
      );
    }

    const envAdminUsername = process.env.ADMIN_USERNAME?.trim().toLowerCase();

    let targetUser = body.userId
      ? db.users.find((u) => u.id === body.userId)
      : undefined;

    if (!targetUser && identifier) {
      targetUser = db.users.find(
        (u) =>
          u.username?.toLowerCase() === identifier ||
          u.email.toLowerCase() === identifier
      );
      if (!targetUser && envAdminUsername && identifier === envAdminUsername) {
        targetUser = db.users.find((u) => u.id === "user-admin-1");
      }
    }

    if (!targetUser) {
      recordFailedAttempt(rateKey);
      return NextResponse.json(
        { error: "Invalid username or credentials." },
        { status: 401 }
      );
    }

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
        targetUser.id === "user-admin-1" &&
        !targetUser.passwordUpdatedInDb &&
        timingSafeEqualStrings(providedPassword, envAdminPassword!);

      const hashMatches = verifyPassword(
        providedPassword,
        targetUser.passwordHash
      );

      if (!envOverrideMatches && !hashMatches) {
        recordFailedAttempt(rateKey);
        return NextResponse.json(
          { error: "Invalid Super Admin username or password." },
          { status: 401 }
        );
      }
    } else {
      const providedPin = typeof body.pin === "string" ? body.pin.trim() : "";
      if (
        !targetUser.pin ||
        !providedPin ||
        !timingSafeEqualStrings(providedPin, targetUser.pin)
      ) {
        recordFailedAttempt(rateKey);
        return NextResponse.json(
          { error: `Invalid 4-digit PIN for ${targetUser.name}.` },
          { status: 401 }
        );
      }
    }

    clearFailedAttempts(rateKey);
    const authMethod: "JWT_PIN" | "OAUTH_SSO" = "JWT_PIN";

    const sessionId = `SES-${Date.now().toString().slice(-6)}`;
    const { token, fullPayload } = signJwt(
      {
        sub: targetUser.id,
        name: targetUser.name,
        role: targetUser.role,
        email: targetUser.email,
        sid: sessionId,
        authMethod,
      },
      8 * 60 * 60
    );

    const newSession: ActiveSession = {
      sessionId,
      userId: targetUser.id,
      userName: targetUser.name,
      userRole: targetUser.role,
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
      timestamp: new Date().toISOString(),
      event: "LOGIN_SUCCESS",
      userId: targetUser.id,
      userName: targetUser.name,
      userRole: targetUser.role,
      details: `Signed in via ${authMethod} (Session ${sessionId}).`,
    };

    db.activeSession = newSession;
    db.sessionAuditLogs = [auditEntry, ...db.sessionAuditLogs.slice(0, 29)];
    await writeDbAsync(db, ["SESSIONS", "AUDIT_LOGS"]);

    cookieStore.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      sameSite: "lax",
      maxAge: 8 * 60 * 60,
    });

    return NextResponse.json({
      authenticated: true,
      user: sanitizeUserForClient(targetUser, targetUser),
      decodedJwt: fullPayload,
      activeSession: newSession,
      sessionAuditLogs: db.sessionAuditLogs,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Authentication failed" },
      { status: 400 }
    );
  }
}
