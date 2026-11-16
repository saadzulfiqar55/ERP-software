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
    <div className="min-h-screen bg-[#edf2f4] flex items-center justify-center p-6">
      <div className="max-w-5xl w-full bg-white border border-[#d4dce4] rounded-2xl shadow-lg overflow-hidden grid grid-cols-1 lg:grid-cols-12">
        {/* Left 7 Cols: Profile Selection + Single-Session Status */}
        <div className="lg:col-span-7 p-8 lg:p-10 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-[#d4dce4]">
          <div>
            {/* Brand Header */}
            <div className="flex items-center gap-4 mb-7">
              <div className="w-12 h-12 rounded-xl bg-[#ef233c] text-white flex items-center justify-center shadow-xs">
                <Store className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h1 className="text-xl font-bold text-[#2b2d42] tracking-tight">
                    Albarka Restaurant & Retail
                  </h1>
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-md bg-[#2b2d42] text-white">
                    Hybrid POS
                  </span>
                </div>
                <p className="text-sm text-[#4a4e69] mt-1">
                  HS256 JWT Auth • OAuth 2.0 Ready • Single-Active-Session Lock
                </p>
              </div>
            </div>

            {/* Active Single-Session Lock Banner */}
            {conflictSession && (
              <div className="mb-6 p-4 rounded-xl bg-[#fff5f6] border border-[#ef233c] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#d80032] flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    SINGLE-PROFILE SESSION LOCK ACTIVE
                  </span>
                  <span className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded bg-[#2b2d42] text-white">
                    {conflictSession.sessionId}
                  </span>
                </div>
                <p className="text-sm text-[#2b2d42] leading-relaxed">
                  Only <strong>one profile</strong> can be logged in at a single time. The terminal
                  is currently locked by{" "}
                  <strong>
                    {conflictSession.userName} ({conflictSession.userRole})
                  </strong>
                  .
                </p>
                <div className="flex flex-wrap gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      const lockedUser = users.find((u) => u.id === conflictSession.userId);
                      if (lockedUser) {
                        setSelectedUser(lockedUser);
                        submitLogin(lockedUser, lockedUser.pin, "JWT_PIN", false);
                      }
                    }}
                    className="px-3.5 py-2 rounded-lg bg-[#2b2d42] text-white text-xs font-semibold hover:opacity-90"
                  >
                    Resume {conflictSession.userName}&apos;s Session
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      submitLogin(selectedUser, selectedUser.pin, "JWT_PIN", true)
                    }
                    className="px-3.5 py-2 rounded-lg bg-[#ef233c] hover:bg-[#d80032] text-white text-xs font-semibold"
                  >
                    Force Revoke & Sign In as {selectedUser.role}
                  </button>
                </div>
              </div>
            )}

            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#4a4e69] mb-3">
              Select Authorized Profile (One Active Session Allowed)
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
                    className={`p-4 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                      isSelected
                        ? "border-[#ef233c] bg-[#f8fafc] ring-1 ring-[#ef233c]"
                        : "border-[#d4dce4] hover:border-[#2b2d42] bg-white"
                    }`}
                  >
                    <div className="flex items-center gap-3.5">
                      <div
                        className={`w-11 h-11 rounded-xl font-bold text-sm flex items-center justify-center text-white ${
                          isSelected ? "bg-[#ef233c]" : "bg-[#2b2d42]"
                        }`}
                      >
                        {u.avatarInitials}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[#2b2d42] text-base">
                            {u.name}
                          </span>
                          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-md bg-[#2b2d42] text-white">
                            {u.role}
                          </span>
                          {isCurrentlyLockedUser && (
                            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-md bg-[#ef233c] text-white">
                              Active Holder
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-[#4a4e69] mt-0.5">
                          {u.title} • Default PIN:{" "}
                          <code className="font-mono font-semibold text-[#2b2d42] bg-[#edf2f4] px-2 py-0.5 rounded">
                            {u.pin}
                          </code>
                        </div>
                      </div>
                    </div>

                    <span className="text-sm font-semibold text-[#ef233c]">
                      {isSelected ? "Selected" : "Select →"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Role Capabilities Box */}
          <div className="mt-6 p-4 rounded-xl bg-[#f4f7f9] border border-[#d4dce4] text-sm space-y-1.5">
            <div className="font-semibold text-[#2b2d42] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#ef233c]" />
              {selectedUser.role} Profile Permissions:
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-xs text-[#4a4e69] pt-1">
              <span>
                • PRA Config & Tax Rates:{" "}
                <strong className={selectedUser.permissions.canEditPraSettings ? "text-[#2b2d42]" : "text-[#d80032]"}>
                  {selectedUser.permissions.canEditPraSettings ? "Full Admin" : "Read-Only"}
                </strong>
              </span>
              <span>
                • Menu & Stock Editing:{" "}
                <strong className="text-[#2b2d42]">
                  {selectedUser.permissions.canManageMenuPricing ? "Allowed" : "Restricted"}
                </strong>
              </span>
              <span>
                • Bill Discounts:{" "}
                <strong className="text-[#2b2d42]">
                  {selectedUser.permissions.canApproveDiscounts ? "Allowed" : "Manager PIN"}
                </strong>
              </span>
              <span>
                • Khata & Z-Report:{" "}
                <strong className="text-[#2b2d42]">
                  {selectedUser.permissions.canManageKhata ? "Full Access" : "POS Only"}
                </strong>
              </span>
            </div>
          </div>
        </div>

        {/* Right 5 Cols: JWT PIN Keypad + OAuth 2.0 SSO */}
        <div className="lg:col-span-5 bg-[#2b2d42] text-white p-8 flex flex-col justify-center">
          <form onSubmit={handlePinSubmit} className="space-y-5 max-w-xs mx-auto w-full">
            <div className="text-center">
              <div className="w-11 h-11 rounded-xl bg-[#ef233c] text-white flex items-center justify-center mx-auto mb-2.5">
                <KeyRound className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-white text-lg">
                JWT Session Sign-In
              </h3>
              <p className="text-sm text-[#cbd5e1] mt-1">
                Profile: <strong className="text-white">{selectedUser.name}</strong> (PIN:{" "}
                <span className="font-mono font-semibold text-[#ef233c]">{selectedUser.pin}</span>)
              </p>
            </div>

            {/* 4-dot PIN display */}
            <div className="flex justify-center gap-3 py-1">
              {[0, 1, 2, 3].map((idx) => (
                <div
                  key={idx}
                  className={`w-12 h-12 rounded-xl border flex items-center justify-center text-lg font-bold transition ${
                    pinInput.length > idx
                      ? "border-[#ef233c] bg-[#ef233c] text-white"
                      : "border-white/20 bg-white/10 text-white/50"
                  }`}
                >
                  {pinInput.length > idx ? "•" : ""}
                </div>
              ))}
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-[#d80032] text-white text-xs text-center font-medium leading-relaxed">
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
                  className="h-12 rounded-xl bg-white/10 hover:bg-[#ef233c] border border-white/15 font-mono font-semibold text-base text-white transition"
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                onClick={() => handleKeypadPress("CLEAR")}
                className="h-12 rounded-xl bg-[#d80032]/50 hover:bg-[#d80032] border border-[#ef233c]/40 font-semibold text-xs text-white transition"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => handleKeypadPress("0")}
                className="h-12 rounded-xl bg-white/10 hover:bg-[#ef233c] border border-white/15 font-mono font-semibold text-base text-white transition"
              >
                0
              </button>
              <button
                type="submit"
                disabled={loading}
                className="h-12 rounded-xl bg-[#ef233c] hover:bg-[#d80032] text-white font-semibold text-sm transition"
              >
                {loading ? "..." : "Sign In"}
              </button>
            </div>

            {/* OAuth 2.0 / SSO Button + Quick PIN Login */}
            <div className="space-y-2.5 pt-3 border-t border-white/15">
              <button
                type="button"
                disabled={loading}
                onClick={() =>
                  submitLogin(selectedUser, selectedUser.pin, "OAUTH_SSO", false)
                }
                className="w-full py-2.5 px-3 rounded-xl bg-white hover:bg-[#edf2f4] text-[#2b2d42] font-semibold text-xs transition flex items-center justify-center gap-2"
              >
                <Lock className="w-3.5 h-3.5 text-[#ef233c]" />
                Sign In with OAuth 2.0 ({selectedUser.email})
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={() =>
                  submitLogin(selectedUser, selectedUser.pin, "JWT_PIN", false)
                }
                className="w-full py-2.5 rounded-xl bg-[#ef233c] hover:bg-[#d80032] text-white font-semibold text-xs transition"
              >
                Quick JWT Sign-In as {selectedUser.role} (PIN {selectedUser.pin})
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
