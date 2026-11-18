"use client";

import React, { useEffect, useState } from "react";
import { ActiveSession, SessionAuditLog, UserProfile } from "@/lib/types";
import {
  AlertTriangle,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  ShieldCheck,
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
  const [selectedUserId, setSelectedUserId] = useState<string>(
    users[0]?.id || ""
  );
  const selectedUser =
    users.find((u) => u.id === selectedUserId) || users[0];

  const [pinInput, setPinInput] = useState<string>("");
  const [passwordInput, setPasswordInput] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [forceTakeover, setForceTakeover] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [conflictSession, setConflictSession] = useState<ActiveSession | null>(
    activeSession
  );
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    setConflictSession(activeSession);
  }, [activeSession]);

  if (!selectedUser) return null;

  const isPasswordAccount =
    selectedUser.role === "ADMIN" || selectedUser.authType === "PASSWORD";

  async function submitLogin(
    targetUser: UserProfile,
    credentials: { pin?: string; password?: string },
    takeover: boolean
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
          pin: credentials.pin,
          password: credentials.password,
          forceTakeover: takeover,
        }),
      });

      const data = await res.json();
      if (res.status === 409 && data.conflictSession) {
        setConflictSession(data.conflictSession);
        setForceTakeover(true);
        setError(data.error);
        return;
      }

      if (!res.ok) {
        setError(data.error || "Sign-in failed");
        if (!isPasswordAccount) setPinInput("");
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

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isPasswordAccount) {
      submitLogin(selectedUser, { password: passwordInput }, forceTakeover);
    } else {
      submitLogin(selectedUser, { pin: pinInput }, forceTakeover);
    }
  }

  function handleKeypadPress(digit: string) {
    if (isPasswordAccount) return;
    setError("");
    if (digit === "CLEAR") {
      setPinInput("");
      return;
    }
    if (pinInput.length < 4) {
      const next = pinInput + digit;
      setPinInput(next);
      if (next.length === 4) {
        submitLogin(selectedUser, { pin: next }, forceTakeover);
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
                      Albarka ERP &amp; POS
                    </h1>
                    <StatusChip label="Material 3" variant="primary" />
                  </div>
                  <p className="text-sm text-md-on-surface-variant mt-0.5">
                    HS256 JWT Session · Role-Based Access Control · Single-Session Lock
                  </p>
                </div>
              </div>
              <ThemeToggle />
            </div>

            {/* Active Single-Session Lock Notice (No Credential-Bypass Buttons) */}
            {conflictSession && (
              <div className="mb-6 p-4 rounded-2xl bg-md-error-container text-md-on-error-container space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 shrink-0" strokeWidth={1.8} />
                    SINGLE-PROFILE SESSION LOCK ACTIVE
                  </span>
                  <span className="text-xs font-mono font-medium px-2.5 py-0.5 rounded-lg bg-md-surface-container-lowest text-md-on-surface">
                    {conflictSession.sessionId}
                  </span>
                </div>
                <p className="text-sm leading-relaxed">
                  Currently locked by{" "}
                  <strong>
                    {conflictSession.userName} ({conflictSession.userRole})
                  </strong>
                  . Enter valid credentials on the right to authenticate or take over this terminal.
                </p>
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
                const isAdmin = u.role === "ADMIN" || u.authType === "PASSWORD";
                const isDemo = Boolean(u.isDemoAccount && !isAdmin);

                return (
                  <div
                    key={u.id}
                    onClick={() => {
                      setSelectedUserId(u.id);
                      setPinInput("");
                      setPasswordInput("");
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
                            label={
                              u.role === "ADMIN"
                                ? "OWNER / SUPER ADMIN"
                                : u.role
                            }
                            variant={
                              u.role === "ADMIN"
                                ? "primary"
                                : u.role === "MANAGER"
                                ? "success"
                                : "neutral"
                            }
                          />
                          {isDemo && (
                            <StatusChip label="Demo Account" variant="warning" />
                          )}
                          {isCurrentlyLockedUser && (
                            <StatusChip label="Active Holder" variant="warning" />
                          )}
                        </div>
                        <div className="text-sm text-md-on-surface-variant mt-0.5">
                          {u.title}
                          {isAdmin ? (
                            <span className="ml-1.5 text-xs font-medium text-md-primary">
                              · Password Protected
                            </span>
                          ) : isDemo && u.pin ? (
                            <>
                              {" "}
                              · Demo PIN:{" "}
                              <code className="font-mono font-medium text-md-on-surface bg-md-surface-container-high px-2 py-0.5 rounded">
                                {u.pin}
                              </code>
                            </>
                          ) : (
                            <span className="ml-1.5 text-xs">· Staff PIN Required</span>
                          )}
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

        {/* Right 5 Cols: Password Form for Super Admin / PIN Keypad for Staff Demo */}
        <div className="lg:col-span-5 bg-md-surface-container-low p-6 sm:p-10 flex flex-col justify-center">
          <form onSubmit={handleFormSubmit} className="space-y-5 max-w-xs mx-auto w-full">
            <div className="text-center">
              <div className="w-12 h-12 rounded-2xl bg-md-primary-container text-md-on-primary-container flex items-center justify-center mx-auto mb-3">
                {isPasswordAccount ? (
                  <Lock className="w-5 h-5" strokeWidth={1.8} />
                ) : (
                  <KeyRound className="w-5 h-5" strokeWidth={1.8} />
                )}
              </div>
              <h3 className="text-[22px] leading-[28px] font-normal text-md-on-surface">
                {isPasswordAccount ? "Super Admin Sign-In" : "Staff PIN Sign-In"}
              </h3>
              <p className="text-sm text-md-on-surface-variant mt-1">
                Profile:{" "}
                <strong className="text-md-on-surface">{selectedUser.name}</strong>
              </p>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-md-error-container text-md-on-error-container text-xs text-center font-medium leading-relaxed">
                {error}
              </div>
            )}

            {isPasswordAccount ? (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="super-admin-password"
                    className="block text-xs font-medium text-md-on-surface-variant"
                  >
                    Super Admin Password
                  </label>
                  <div className="relative flex items-center rounded-[10px] bg-md-surface-container-lowest border border-md-outline-variant/85 focus-within:border-md-primary focus-within:ring-3 focus-within:ring-md-primary/12 transition-all">
                    <input
                      id="super-admin-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      value={passwordInput}
                      onChange={(e) => {
                        setError("");
                        setPasswordInput(e.target.value);
                      }}
                      placeholder="Enter Super Admin password"
                      className="w-full h-12 pl-3.5 pr-11 bg-transparent text-sm text-md-on-surface placeholder:text-md-on-surface-variant/60 outline-none"
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="border-0 absolute right-2 w-8 h-8 rounded-full flex items-center justify-center text-md-on-surface-variant hover:bg-md-surface-container-high"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" strokeWidth={1.8} />
                      ) : (
                        <Eye className="w-4 h-4" strokeWidth={1.8} />
                      )}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  variant="filled"
                  size="lg"
                  disabled={loading || !passwordInput}
                  className="w-full"
                >
                  {loading ? "Verifying…" : "Sign In as Super Admin"}
                </Button>
              </div>
            ) : (
              <>
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
                    disabled={loading || pinInput.length < 4}
                    className="h-12 rounded-full border-0 bg-md-primary hover:bg-md-primary-strong disabled:opacity-45 text-md-on-primary shadow-sm font-medium text-sm transition-all duration-150 hover:-translate-y-[1px] hover:scale-[1.02] active:scale-[0.97]"
                  >
                    {loading ? "..." : "Sign In"}
                  </button>
                </div>
              </>
            )}

            {conflictSession && conflictSession.userId !== selectedUser.id && (
              <label className="flex items-center gap-2.5 pt-2 text-xs text-md-on-surface-variant cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={forceTakeover}
                  onChange={(e) => setForceTakeover(e.target.checked)}
                  className="w-4 h-4 accent-md-primary rounded"
                />
                <span>
                  End active session for <strong>{conflictSession.userName}</strong> on sign-in
                </span>
              </label>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
