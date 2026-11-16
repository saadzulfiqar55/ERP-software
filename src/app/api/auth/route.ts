import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readDb, writeDb } from "@/lib/db";
import { signJwt, verifyJwt } from "@/lib/auth-jwt";
import { ActiveSession, SessionAuditLog } from "@/lib/types";

const COOKIE_NAME = "albarka_session_jwt";

export async function GET() {
  const db = readDb();
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  // Auto-expire stale server session if past expiresAt
  if (db.activeSession && new Date(db.activeSession.expiresAt).getTime() < Date.now()) {
    db.activeSession = null;
    writeDb(db);
  }

  if (!token) {
    return NextResponse.json({
      authenticated: false,
      user: null,
      activeSession: db.activeSession,
      sessionAuditLogs: db.sessionAuditLogs,
    });
  }

  const decoded = verifyJwt(token);
  if (!decoded || !db.activeSession || db.activeSession.sessionId !== decoded.sid) {
    return NextResponse.json({
      authenticated: false,
      user: null,
      activeSession: db.activeSession,
      sessionAuditLogs: db.sessionAuditLogs,
    });
  }

  const user = db.users.find((u) => u.id === decoded.sub) || null;
  return NextResponse.json({
    authenticated: Boolean(user),
    user,
    decodedJwt: decoded,
    activeSession: db.activeSession,
    sessionAuditLogs: db.sessionAuditLogs,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const db = readDb();
    const cookieStore = await cookies();

    // Auto-clear expired lock
    if (db.activeSession && new Date(db.activeSession.expiresAt).getTime() < Date.now()) {
      db.activeSession = null;
    }

    // 1. LOGOUT / REVOKE SESSION
    if (body.action === "LOGOUT") {
      if (db.activeSession) {
        const logEntry: SessionAuditLog = {
          id: `audit-${Date.now()}`,
          timestamp: new Date().toISOString(),
          event: "LOGOUT",
          userId: db.activeSession.userId,
          userName: db.activeSession.userName,
          userRole: db.activeSession.userRole,
          details: `Session ${db.activeSession.sessionId} signed out cleanly.`,
        };
        db.sessionAuditLogs = [logEntry, ...db.sessionAuditLogs.slice(0, 29)];
        db.activeSession = null;
        writeDb(db);
      }
      cookieStore.delete(COOKIE_NAME);
      return NextResponse.json({
        authenticated: false,
        activeSession: null,
        sessionAuditLogs: db.sessionAuditLogs,
      });
    }

    // 2. REFRESH / EXTEND ACTIVE SESSION (+4 HOURS)
    if (body.action === "REFRESH_SESSION") {
      if (!db.activeSession) {
        return NextResponse.json({ error: "No active session to refresh" }, { status: 400 });
      }
      const user = db.users.find((u) => u.id === db.activeSession?.userId);
      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      const sessionId = `SES-${Date.now().toString().slice(-6)}`;
      const { token, fullPayload } = signJwt(
        {
          sub: user.id,
          name: user.name,
          role: user.role,
          email: user.email,
          sid: sessionId,
          authMethod: db.activeSession.authMethod,
        },
        12 * 60 * 60
      );

      const updatedSession: ActiveSession = {
        ...db.activeSession,
        sessionId,
        issuedAt: new Date(fullPayload.iat * 1000).toISOString(),
        expiresAt: new Date(fullPayload.exp * 1000).toISOString(),
        lastHeartbeatAt: new Date().toISOString(),
        jwtTokenPreview: `${token.slice(0, 28)}...${token.slice(-16)}`,
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
      writeDb(db);

      cookieStore.set(COOKIE_NAME, token, {
        httpOnly: true,
        path: "/",
        sameSite: "lax",
        maxAge: 12 * 60 * 60,
      });

      return NextResponse.json({
        authenticated: true,
        user,
        decodedJwt: fullPayload,
        activeSession: updatedSession,
        sessionAuditLogs: db.sessionAuditLogs,
      });
    }

    // 3. LOGIN (PIN OR OAUTH SSO) WITH SINGLE-SESSION LOCK ENFORCEMENT
    const targetUser = db.users.find((u) => u.id === body.userId);
    if (!targetUser) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const authMethod: "JWT_PIN" | "OAUTH_SSO" =
      body.authMethod === "OAUTH_SSO" ? "OAUTH_SSO" : "JWT_PIN";

    if (authMethod === "JWT_PIN" && body.pin !== targetUser.pin) {
      return NextResponse.json(
        { error: `Invalid 4-digit PIN for ${targetUser.name}.` },
        { status: 401 }
      );
    }

    // STRICT SINGLE-PROFILE LOCK CHECK:
    // If another profile is already logged in, block unless forceTakeover is authorized
    if (
      db.activeSession &&
      db.activeSession.userId !== targetUser.id &&
      !body.forceTakeover
    ) {
      const conflictLog: SessionAuditLog = {
        id: `audit-${Date.now()}`,
        timestamp: new Date().toISOString(),
        event: "SESSION_LOCKED_CONFLICT",
        userId: targetUser.id,
        userName: targetUser.name,
        userRole: targetUser.role,
        details: `Blocked concurrent login: ${db.activeSession.userName} (${db.activeSession.userRole}) is already logged in.`,
      };
      db.sessionAuditLogs = [conflictLog, ...db.sessionAuditLogs.slice(0, 29)];
      writeDb(db);

      return NextResponse.json(
        {
          error: `Single-Session Lock Active: ${db.activeSession.userName} (${db.activeSession.userRole}) is currently logged in. Only one profile can be logged in at a single time.`,
          conflictSession: db.activeSession,
          sessionAuditLogs: db.sessionAuditLogs,
        },
        { status: 409 }
      );
    }

    const isTakeover =
      Boolean(db.activeSession) &&
      db.activeSession?.userId !== targetUser.id &&
      Boolean(body.forceTakeover);

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
      event: isTakeover ? "ADMIN_FORCE_TAKEOVER" : "LOGIN_SUCCESS",
      userId: targetUser.id,
      userName: targetUser.name,
      userRole: targetUser.role,
      details: isTakeover
        ? `Force-terminated previous session and locked terminal for ${targetUser.name} (${authMethod}).`
        : `Signed in via ${authMethod} (Session ${sessionId}). Single-session lock acquired.`,
    };

    db.activeSession = newSession;
    db.sessionAuditLogs = [auditEntry, ...db.sessionAuditLogs.slice(0, 29)];
    writeDb(db);

    cookieStore.set(COOKIE_NAME, token, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      maxAge: 8 * 60 * 60,
    });

    return NextResponse.json({
      authenticated: true,
      user: targetUser,
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
