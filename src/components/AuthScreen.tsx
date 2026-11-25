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
  UserCheck,
} from "lucide-react";
import {
  Avatar,
  Button,
  Card,
  SegmentedButton,
  StatusChip,
  ThemeToggle,
} from "@/components/ui/m3";
import { StackLyraLogo } from "@/components/ui/StackLyraLogo";
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
  const staffProfiles = users.filter(
    (u) => u.role !== "ADMIN" && u.authType !== "PASSWORD"
  );
  const [authMode, setAuthMode] = useState<"STAFF_PIN" | "SUPER_ADMIN">(
    staffProfiles.length > 0 ? "STAFF_PIN" : "SUPER_ADMIN"
  );

  const [selectedUserId, setSelectedUserId] = useState<string>(
    staffProfiles[0]?.id || ""
  );
  const selectedStaffUser =
    staffProfiles.find((u) => u.id === selectedUserId) || staffProfiles[0];

  const [pinInput, setPinInput] = useState<string>("");
  const [usernameInput, setUsernameInput] = useState<string>("");
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

  async function submitLogin(
    payload:
      | { userId: string; pin: string }
      | { username: string; password: string },
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
          ...payload,
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
        if (authMode === "STAFF_PIN") setPinInput("");
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
    if (authMode === "SUPER_ADMIN") {
      submitLogin(
        { username: usernameInput.trim(), password: passwordInput },
        forceTakeover
      );
    } else if (selectedStaffUser) {
      submitLogin(
        { userId: selectedStaffUser.id, pin: pinInput },
        forceTakeover
      );
    }
  }

  function handleKeypadPress(digit: string) {
    if (authMode !== "STAFF_PIN" || !selectedStaffUser) return;
    setError("");
    if (digit === "CLEAR") {
      setPinInput("");
      return;
    }
    if (pinInput.length < 4) {
      const next = pinInput + digit;
      setPinInput(next);
      if (next.length === 4) {
        submitLogin(
          { userId: selectedStaffUser.id, pin: next },
          forceTakeover
        );
      }
    }
  }

  const activeRoleForPreview =
    authMode === "SUPER_ADMIN"
      ? "ADMIN"
      : selectedStaffUser?.role || "CASHIER";

  return (
    <div className="min-h-screen bg-md-surface flex items-center justify-center p-4 sm:p-8">
      <div className="max-w-5xl w-full bg-md-surface-container-lowest border-0 shadow-(--md-card-shadow) rounded-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12">
        {/* Left 7 Cols: Role Mode & Demo Staff Selection */}
        <div className="lg:col-span-7 p-6 sm:p-10 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-md-divider">
          <div>
            {/* Brand Row */}
            <div className="flex items-start justify-between gap-4 mb-6">
              <div className="flex items-center gap-4">
                <StackLyraLogo size={48} className="shrink-0" />
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h1 className="text-[22px] leading-[28px] font-normal text-md-on-surface">
                      StackLyra ERP &amp; POS
                    </h1>
                    <StatusChip label="Material 3" variant="primary" />
                  </div>
                  <p className="text-sm text-md-on-surface-variant mt-0.5">
                    HS256 JWT Session · Role-Based Hierarchy · MongoDB Atlas
                  </p>
                </div>
              </div>
              <ThemeToggle />
            </div>

            {/* Mode Switcher: Staff Demo PIN vs Super Admin Username + Password */}
            <div className="mb-6">
              <SegmentedButton
                value={authMode}
                onChange={(mode) => {
                  setAuthMode(mode);
                  setError("");
                  setPinInput("");
                }}
                options={[
                  {
                    value: "STAFF_PIN",
                    label: "Demo Staff (PIN)",
                    icon: <UserCheck className="w-3.5 h-3.5" strokeWidth={1.8} />,
                  },
                  {
                    value: "SUPER_ADMIN",
                    label: "Super Admin",
                    icon: <Lock className="w-3.5 h-3.5" strokeWidth={1.8} />,
                  },
                ]}
              />
            </div>

            {/* Active Single-Session Lock Notice */}
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
                  Currently active:{" "}
                  <strong>
                    {conflictSession.userName} ({conflictSession.userRole})
                  </strong>
                  . Authenticate on the right to sign in or take over the terminal.
                </p>
              </div>
            )}

            {authMode === "STAFF_PIN" ? (
              <>
                <h2 className="text-xs font-medium uppercase tracking-wider text-md-on-surface-variant mb-3">
                  Demo Staff Profiles (Manager &amp; Cashier)
                </h2>
                <div className="space-y-3">
                  {staffProfiles.map((u) => {
                    const isSelected = selectedStaffUser?.id === u.id;
                    const isCurrentlyLockedUser =
                      conflictSession?.userId === u.id;
                    const isDemo = Boolean(u.isDemoAccount);

                    return (
                      <div
                        key={u.id}
                        onClick={() => {
                          setSelectedUserId(u.id);
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
                                  u.role === "MANAGER" ? "success" : "neutral"
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
                              {isDemo && u.pin ? (
                                <>
                                  {" "}
                                  · Demo PIN:{" "}
                                  <code className="font-mono font-medium text-md-on-surface bg-md-surface-container-high px-2 py-0.5 rounded">
                                    {u.pin}
                                  </code>
                                </>
                              ) : (
                                <span className="ml-1.5 text-xs">
                                  · Staff PIN Required
                                </span>
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
              </>
            ) : (
              <Card variant="tonal" className="space-y-3">
                <div className="flex items-center gap-2.5">
                  <StatusChip label="OWNER / SUPER ADMIN" variant="primary" />
                  <span className="text-xs font-medium text-md-on-surface-variant">
                    Username + Password Authentication
                  </span>
                </div>
                <p className="text-sm text-md-on-surface leading-relaxed">
                  Super Admin credentials are protected with salted{" "}
                  <code className="font-mono text-xs bg-md-surface-container-high px-1.5 py-0.5 rounded">
                    scrypt
                  </code>{" "}
                  hashing in MongoDB Atlas and never shown on the sign-in screen.
                </p>
                <p className="text-xs text-md-on-surface-variant">
                  Full control over financial ledgers, party Khata accounts, item archival, invoice deletion/voids, PRA settings, MongoDB, and workspace staff profiles.
                </p>
              </Card>
            )}
          </div>

          {/* Role Capabilities Box */}
          <Card variant="tonal" className="mt-6 p-4! space-y-1.5">
            <div className="text-sm font-medium text-md-on-surface flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-md-primary" strokeWidth={1.8} />
              {activeRoleForPreview === "ADMIN"
                ? "OWNER / SUPER ADMIN"
                : activeRoleForPreview}{" "}
              RBAC Hierarchy Permissions:
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-xs text-md-on-surface-variant pt-1">
              <span>
                • Ledger, Profiles &amp; Settings:{" "}
                <strong className="text-md-on-surface">
                  {hasGranularPermission(
                    activeRoleForPreview,
                    "accounting:ledger:view"
                  )
                    ? "Full Super Admin"
                    : "Restricted"}
                </strong>
              </span>
              <span>
                • Delete Items &amp; Void Invoices:{" "}
                <strong className="text-md-on-surface">
                  {hasGranularPermission(activeRoleForPreview, "invoices:delete")
                    ? "Allowed"
                    : "Super Admin Only"}
                </strong>
              </span>
              <span>
                • Menu &amp; Stock Editing:{" "}
                <strong className="text-md-on-surface">
                  {hasGranularPermission(
                    activeRoleForPreview,
                    "inventory:adjust"
                  )
                    ? "Add / Edit Only"
                    : "View Only"}
                </strong>
              </span>
              <span>
                • POS &amp; Bill Discounts:{" "}
                <strong className="text-md-on-surface">
                  {hasGranularPermission(
                    activeRoleForPreview,
                    "pos:discount:override"
                  )
                    ? "POS + Discounts"
                    : "Standard POS"}
                </strong>
              </span>
            </div>
          </Card>
        </div>

        {/* Right 5 Cols: Super Admin Username+Password OR Staff PIN Keypad */}
        <div className="lg:col-span-5 bg-md-surface-container-low p-6 sm:p-10 flex flex-col justify-center">
          <form onSubmit={handleFormSubmit} className="space-y-5 max-w-xs mx-auto w-full">
            <div className="text-center">
              <div className="w-12 h-12 rounded-2xl bg-md-primary-container text-md-on-primary-container flex items-center justify-center mx-auto mb-3">
                {authMode === "SUPER_ADMIN" ? (
                  <Lock className="w-5 h-5" strokeWidth={1.8} />
                ) : (
                  <KeyRound className="w-5 h-5" strokeWidth={1.8} />
                )}
              </div>
              <h3 className="text-[22px] leading-[28px] font-normal text-md-on-surface">
                {authMode === "SUPER_ADMIN"
                  ? "Super Admin Sign-In"
                  : "Staff PIN Sign-In"}
              </h3>
              <p className="text-sm text-md-on-surface-variant mt-1">
                {authMode === "SUPER_ADMIN" ? (
                  "Enter your Super Admin username & password"
                ) : (
                  <>
                    Profile:{" "}
                    <strong className="text-md-on-surface">
                      {selectedStaffUser?.name || "Select a profile"}
                    </strong>
                  </>
                )}
              </p>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-md-error-container text-md-on-error-container text-xs text-center font-medium leading-relaxed">
                {error}
              </div>
            )}

            {authMode === "SUPER_ADMIN" ? (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="super-admin-username"
                    className="block text-xs font-medium text-md-on-surface-variant"
                  >
                    Username or Email
                  </label>
                  <input
                    id="super-admin-username"
                    type="text"
                    autoComplete="username"
                    required
                    value={usernameInput}
                    onChange={(e) => {
                      setError("");
                      setUsernameInput(e.target.value);
                    }}
                    placeholder="Enter username"
                    className="w-full h-12 px-3.5 rounded-[10px] bg-md-surface-container-lowest border border-md-outline-variant/85 focus:border-md-primary focus:ring-3 focus:ring-md-primary/12 text-sm text-md-on-surface placeholder:text-md-on-surface-variant/60 outline-none transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="super-admin-password"
                    className="block text-xs font-medium text-md-on-surface-variant"
                  >
                    Password
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
                      placeholder="Enter password"
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
                  disabled={loading || !usernameInput.trim() || !passwordInput}
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
                      disabled={loading || !selectedStaffUser}
                      onClick={() => handleKeypadPress(digit)}
                      className="h-12 rounded-full border-0 bg-md-surface-container-lowest hover:bg-md-secondary-container shadow-xs font-mono font-medium text-base text-md-on-surface transition-all duration-150 hover:-translate-y-px hover:scale-[1.02] active:scale-[0.97]"
                    >
                      {digit}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => handleKeypadPress("CLEAR")}
                    className="h-12 rounded-full border-0 bg-md-error-container hover:brightness-95 font-medium text-xs text-md-on-error-container transition-all duration-150 hover:-translate-y-px hover:scale-[1.02] active:scale-[0.97]"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={() => handleKeypadPress("0")}
                    className="h-12 rounded-full border-0 bg-md-surface-container-lowest hover:bg-md-secondary-container shadow-xs font-mono font-medium text-base text-md-on-surface transition-all duration-150 hover:-translate-y-px hover:scale-[1.02] active:scale-[0.97]"
                  >
                    0
                  </button>
                  <button
                    type="submit"
                    disabled={loading || pinInput.length < 4 || !selectedStaffUser}
                    className="h-12 rounded-full border-0 bg-md-primary hover:bg-md-primary-strong disabled:opacity-45 text-md-on-primary shadow-sm font-medium text-sm transition-all duration-150 hover:-translate-y-px hover:scale-[1.02] active:scale-[0.97]"
                  >
                    {loading ? "..." : "Sign In"}
                  </button>
                </div>
              </>
            )}

            {conflictSession && (
              <label className="flex items-center gap-2.5 pt-2 text-xs text-md-on-surface-variant cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={forceTakeover}
                  onChange={(e) => setForceTakeover(e.target.checked)}
                  className="w-4 h-4 accent-md-primary rounded"
                />
                <span>
                  End active session for{" "}
                  <strong>{conflictSession.userName}</strong> on sign-in
                </span>
              </label>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
