"use client";

import React, { useState } from "react";
import { ActiveSession, SessionAuditLog, UserProfile } from "@/lib/types";
import {
  AlertTriangle,
  KeyRound,
  Lock,
  ShieldCheck,
  Store,
} from "lucide-react";
import { Avatar, Button, Card, StatusChip, ThemeToggle } from "@/components/ui/m3";
import { hasGranularPermission } from "@/core/auth/permissions";

interface AuthScreenProps {
  users: UserProfile[];
  activeSession: ActiveSession | null;
  onAuthSuccess: (data: {
    user: UserProfile;
    activeSession: ActiveSession;
    sessionAuditLogs: SessionAuditLog[];
  }) => void;
}

export default function AuthScreen({
  users,
  activeSession,
  onAuthSuccess,
}: AuthScreenProps) {
  const [selectedUser, setSelectedUser] = useState<UserProfile>(users[0]);
  const [pinInput, setPinInput] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [conflictSession, setConflictSession] = useState<ActiveSession | null>(
    activeSession
  );
  const [loading, setLoading] = useState<boolean>(false);

  async function submitLogin(
    targetUser: UserProfile,
    pin: string,
    authMethod: "JWT_PIN" | "OAUTH_SSO" = "JWT_PIN",
    forceTakeover: boolean = false
  ) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "LOGIN",
          userId: targetUser.id,
          pin,
          authMethod,
          forceTakeover,
        }),
      });

      const data = await res.json();
      if (res.status === 409 && data.conflictSession) {
        setConflictSession(data.conflictSession);
        setError(data.error);
        return;
      }

      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }

      onAuthSuccess({
        user: data.user,
        activeSession: data.activeSession,
        sessionAuditLogs: data.sessionAuditLogs || [],
      });
    } catch {
      setError("Network error while establishing JWT session.");
    } finally {
      setLoading(false);
    }
  }

  function handlePinSubmit(e: React.FormEvent) {
    e.preventDefault();
    submitLogin(selectedUser, pinInput, "JWT_PIN", false);
  }

  function handleKeypadPress(digit: string) {
    setError("");
    if (digit === "CLEAR") {
      setPinInput("");
      return;
    }
    if (pinInput.length < 4) {
      const next = pinInput + digit;
      setPinInput(next);
      if (next.length === 4) {
        submitLogin(selectedUser, next, "JWT_PIN", false);
      }
    }
  }

  return (
    <div className="min-h-screen bg-md-surface flex items-center justify-center p-4 sm:p-8">
      <div className="max-w-5xl w-full bg-md-surface-container-lowest border-0 shadow-[var(--md-card-shadow)] rounded-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12">
        {/* Left 7 Cols: Profile Selection + Single-Session Status */}
        <div className="lg:col-span-7 p-6 sm:p-10 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-md-divider">
          <div>
            {/* Brand Row */}
            <div className="flex items-start justify-between gap-4 mb-8">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-md-primary text-md-on-primary flex items-center justify-center font-bold text-xl shrink-0">
                  A
                </div>
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h1 className="text-[22px] leading-[28px] font-normal text-md-on-surface">
                      Albarka ERP & POS
                    </h1>
                    <StatusChip label="Material 3" variant="primary" />
                  </div>
                  <p className="text-sm text-md-on-surface-variant mt-0.5">
                    HS256 JWT Session · OAuth 2.0 Ready · Single-Active-Session Lock
                  </p>
                </div>
              </div>
              <ThemeToggle />
            </div>

            {/* Active Single-Session Lock Banner */}
            {conflictSession && (
              <div className="mb-6 p-4 rounded-2xl bg-md-error-container text-md-on-error-container space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" strokeWidth={1.8} />
                    SINGLE-PROFILE SESSION LOCK ACTIVE
                  </span>
                  <span className="text-xs font-mono font-medium px-2.5 py-0.5 rounded-lg bg-md-surface-container-lowest text-md-on-surface">
                    {conflictSession.sessionId}
                  </span>
                </div>
                <p className="text-sm leading-relaxed">
                  Only <strong>one profile</strong> can be logged in at a single time. Currently
                  locked by{" "}
                  <strong>
                    {conflictSession.userName} ({conflictSession.userRole})
                  </strong>
                  .
                </p>
                <div className="flex flex-wrap gap-2.5">
                  <Button
                    variant="tonal"
                    size="sm"
                    onClick={() => {
                      const lockedUser = users.find((u) => u.id === conflictSession.userId);
                      if (lockedUser) {
                        setSelectedUser(lockedUser);
                        submitLogin(lockedUser, lockedUser.pin, "JWT_PIN", false);
                      }
                    }}
                  >
                    Resume {conflictSession.userName}&apos;s Session
                  </Button>
                  <Button
                    variant="filled"
                    size="sm"
                    onClick={() =>
                      submitLogin(selectedUser, selectedUser.pin, "JWT_PIN", true)
                    }
                  >
                    Force Revoke & Sign In as {selectedUser.role}
                  </Button>
                </div>
              </div>
            )}

            <h2 className="text-xs font-medium uppercase tracking-wider text-md-on-surface-variant mb-3">
              Select Authorized Workspace Profile
            </h2>

            {/* Profile Cards */}
            <div className="space-y-3">
              {users.map((u) => {
                const isSelected = selectedUser.id === u.id;
                const isCurrentlyLockedUser = conflictSession?.userId === u.id;

                return (
                  <div
                    key={u.id}
                    onClick={() => {
                      setSelectedUser(u);
                      setPinInput("");
                      setError("");
                    }}
                    className={`p-4 rounded-2xl border-0 cursor-pointer transition-colors duration-200 flex items-center justify-between ${
                      isSelected
                        ? "bg-md-primary-container/45 ring-2 ring-md-primary/60 shadow-xs"
                        : "bg-md-surface-container-low hover:bg-md-surface-container-high/70"
                    }`}
                  >
                    <div className="flex items-center gap-3.5">
                      <Avatar
                        initials={u.avatarInitials}
                        variant={isSelected ? "primary" : "tertiary"}
                      />
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-md-on-surface text-base">
                            {u.name}
                          </span>
                          <StatusChip
                            label={u.role}
                            variant={
                              u.role === "ADMIN"
                                ? "primary"
                                : u.role === "MANAGER"
                                ? "success"
                                : "neutral"
                            }
                          />
                          {isCurrentlyLockedUser && (
                            <StatusChip label="Active Holder" variant="warning" />
                          )}
                        </div>
                        <div className="text-sm text-md-on-surface-variant mt-0.5">
                          {u.title} · Default PIN:{" "}
                          <code className="font-mono font-medium text-md-on-surface bg-md-surface-container-high px-2 py-0.5 rounded">
                            {u.pin}
                          </code>
                        </div>
                      </div>
                    </div>

                    <span className="text-xs font-medium text-md-primary">
                      {isSelected ? "Selected" : "Select"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Role Capabilities Box */}
          <Card variant="tonal" className="mt-6 p-4! space-y-1.5">
            <div className="text-sm font-medium text-md-on-surface flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-md-primary" strokeWidth={1.8} />
              {selectedUser.role === "ADMIN" ? "OWNER / SUPER ADMIN" : selectedUser.role} RBAC Hierarchy Permissions:
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-xs text-md-on-surface-variant pt-1">
              <span>
                • Ledger, Profiles &amp; Settings:{" "}
                <strong className="text-md-on-surface">
                  {hasGranularPermission(selectedUser.role, "accounting:ledger:view")
                    ? "Full Super Admin"
                    : "Restricted"}
                </strong>
              </span>
              <span>
                • Delete Items &amp; Void Invoices:{" "}
                <strong className="text-md-on-surface">
                  {hasGranularPermission(selectedUser.role, "invoices:delete")
                    ? "Allowed"
                    : "Super Admin Only"}
                </strong>
              </span>
              <span>
                • Menu &amp; Stock Editing:{" "}
                <strong className="text-md-on-surface">
                  {hasGranularPermission(selectedUser.role, "inventory:adjust")
                    ? "Add / Edit Only"
                    : "View Only"}
                </strong>
              </span>
              <span>
                • POS &amp; Bill Discounts:{" "}
                <strong className="text-md-on-surface">
                  {hasGranularPermission(selectedUser.role, "pos:discount:override")
                    ? "POS + Discounts"
                    : "Standard POS"}
                </strong>
              </span>
            </div>
          </Card>
        </div>

        {/* Right 5 Cols: Material 3 Tonal PIN Keypad + OAuth 2.0 SSO */}
        <div className="lg:col-span-5 bg-md-surface-container-low p-6 sm:p-10 flex flex-col justify-center">
          <form onSubmit={handlePinSubmit} className="space-y-5 max-w-xs mx-auto w-full">
            <div className="text-center">
              <div className="w-12 h-12 rounded-2xl bg-md-primary-container text-md-on-primary-container flex items-center justify-center mx-auto mb-3">
                <KeyRound className="w-5 h-5" strokeWidth={1.8} />
              </div>
              <h3 className="text-[22px] leading-[28px] font-normal text-md-on-surface">
                Workspace Sign-In
              </h3>
              <p className="text-sm text-md-on-surface-variant mt-1">
                Profile: <strong className="text-md-on-surface">{selectedUser.name}</strong> (PIN:{" "}
                <span className="font-mono font-medium text-md-primary">{selectedUser.pin}</span>)
              </p>
            </div>

            {/* 4-dot PIN display */}
            <div className="flex justify-center gap-3 py-1">
              {[0, 1, 2, 3].map((idx) => (
                <div
                  key={idx}
                  className={`w-12 h-12 rounded-xl border flex items-center justify-center text-lg font-medium transition ${
                    pinInput.length > idx
                      ? "border-md-primary bg-md-primary-container text-md-on-primary-container"
                      : "border-md-outline-variant bg-md-surface-container-lowest text-md-on-surface-variant"
                  }`}
                >
                  {pinInput.length > idx ? "•" : ""}
                </div>
              ))}
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-md-error-container text-md-on-error-container text-xs text-center font-medium leading-relaxed">
                {error}
              </div>
            )}

            {/* Touch Numeric Keypad */}
            <div className="grid grid-cols-3 gap-2.5">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  disabled={loading}
                  onClick={() => handleKeypadPress(digit)}
                  className="h-12 rounded-full border-0 bg-md-surface-container-lowest hover:bg-md-secondary-container shadow-xs font-mono font-medium text-base text-md-on-surface transition-all duration-150 hover:-translate-y-[1px] hover:scale-[1.02] active:scale-[0.97]"
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                onClick={() => handleKeypadPress("CLEAR")}
                className="h-12 rounded-full border-0 bg-md-error-container hover:brightness-95 font-medium text-xs text-md-on-error-container transition-all duration-150 hover:-translate-y-[1px] hover:scale-[1.02] active:scale-[0.97]"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => handleKeypadPress("0")}
                className="h-12 rounded-full border-0 bg-md-surface-container-lowest hover:bg-md-secondary-container shadow-xs font-mono font-medium text-base text-md-on-surface transition-all duration-150 hover:-translate-y-[1px] hover:scale-[1.02] active:scale-[0.97]"
              >
                0
              </button>
              <button
                type="submit"
                disabled={loading}
                className="h-12 rounded-full border-0 bg-md-primary hover:bg-md-primary-strong text-md-on-primary shadow-sm font-medium text-sm transition-all duration-150 hover:-translate-y-[1px] hover:scale-[1.02] active:scale-[0.97]"
              >
                {loading ? "..." : "Sign In"}
              </button>
            </div>

            {/* OAuth 2.0 / SSO Button + Quick PIN Login */}
            <div className="space-y-2.5 pt-3 border-t border-md-divider">
              <Button
                variant="outlined"
                className="w-full"
                disabled={loading}
                icon={<Lock className="w-4 h-4" strokeWidth={1.8} />}
                onClick={() =>
                  submitLogin(selectedUser, selectedUser.pin, "OAUTH_SSO", false)
                }
              >
                OAuth 2.0 SSO ({selectedUser.email})
              </Button>

              <Button
                variant="filled"
                className="w-full"
                disabled={loading}
                onClick={() =>
                  submitLogin(selectedUser, selectedUser.pin, "JWT_PIN", false)
                }
              >
                Quick Sign-In as {selectedUser.role} (PIN {selectedUser.pin})
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
