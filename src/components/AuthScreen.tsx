"use client";

import React, { useState } from "react";
import {
  ActiveSession,
  SessionAuditLog,
  SubscriptionPlanId,
  TenantOrganization,
  UserProfile,
} from "@/lib/types";
import {
  Building2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Rocket,
  Search,
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
import { SAAS_PLANS } from "@/core/saas/entitlements";

interface AuthScreenProps {
  users: UserProfile[];
  activeSession: ActiveSession | null;
  onAuthSuccess: (data: {
    user: UserProfile;
    tenant?: TenantOrganization;
    activeSession: ActiveSession;
    sessionAuditLogs: SessionAuditLog[];
  }) => void;
}

export default function AuthScreen({
  users,
  onAuthSuccess,
}: AuthScreenProps) {
  const [workspaceUsers, setWorkspaceUsers] = useState<UserProfile[]>(users);
  const staffProfiles = workspaceUsers.filter(
    (u) => u.role !== "ADMIN" && u.authType !== "PASSWORD"
  );

  const [authMode, setAuthMode] = useState<
    "SUPER_ADMIN" | "STAFF_PIN" | "NEW_WORKSPACE"
  >("SUPER_ADMIN");

  const [workspaceSlugInput, setWorkspaceSlugInput] =
    useState<string>("stacklyra");
  const [workspaceDisplayName, setWorkspaceDisplayName] = useState<string>(
    "StackLyra Workspace"
  );
  const [loadingWorkspace, setLoadingWorkspace] = useState<boolean>(false);

  const [selectedUserId, setSelectedUserId] = useState<string>(
    staffProfiles[0]?.id || ""
  );
  const selectedStaffUser =
    staffProfiles.find((u) => u.id === selectedUserId) || staffProfiles[0];

  const [pinInput, setPinInput] = useState<string>("");
  const [usernameInput, setUsernameInput] = useState<string>("");
  const [passwordInput, setPasswordInput] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  // SaaS Self-Serve Onboarding Form State
  const [orgNameInput, setOrgNameInput] = useState<string>("");
  const [orgSlugInput, setOrgSlugInput] = useState<string>("");
  const [orgSegment, setOrgSegment] = useState<
    "RESTAURANT" | "RETAIL" | "HYBRID"
  >("HYBRID");
  const [orgPlanId, setOrgPlanId] = useState<SubscriptionPlanId>("growth");
  const [ownerNameInput, setOwnerNameInput] = useState<string>("");
  const [ownerEmailInput, setOwnerEmailInput] = useState<string>("");
  const [ownerPasswordInput, setOwnerPasswordInput] = useState<string>("");

  async function handleLoadWorkspaceStaff(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const slug = workspaceSlugInput.trim().toLowerCase();
    if (!slug) return;
    setLoadingWorkspace(true);
    setError("");
    try {
      const res = await fetch(
        `/api/state?workspace=${encodeURIComponent(slug)}`
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Workspace "${slug}" not found.`);
        setWorkspaceUsers([]);
        return;
      }
      setWorkspaceUsers(data.users || []);
      if (data.tenant?.name) {
        setWorkspaceDisplayName(data.tenant.name);
      }
      const nextStaff = (data.users || []).filter(
        (u: UserProfile) => u.role !== "ADMIN" && u.authType !== "PASSWORD"
      );
      setSelectedUserId(nextStaff[0]?.id || "");
    } catch {
      setError("Could not load workspace staff directory.");
    } finally {
      setLoadingWorkspace(false);
    }
  }

  async function submitLogin(
    payload:
      | { tenantSlug?: string; userId: string; pin: string }
      | { tenantSlug?: string; username: string; password: string }
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
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Sign-in failed");
        if (authMode === "STAFF_PIN") setPinInput("");
        return;
      }

      onAuthSuccess({
        user: data.user,
        tenant: data.tenant,
        activeSession: data.activeSession,
        sessionAuditLogs: data.sessionAuditLogs || [],
      });
    } catch {
      setError("Network error while establishing JWT session.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateWorkspace(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/saas/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "REGISTER_WORKSPACE",
          organizationName: orgNameInput.trim(),
          slug: orgSlugInput.trim().toLowerCase(),
          segment: orgSegment,
          planId: orgPlanId,
          ownerName: ownerNameInput.trim(),
          ownerEmail: ownerEmailInput.trim().toLowerCase(),
          password: ownerPasswordInput,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not create workspace.");
        return;
      }

      onAuthSuccess({
        user: data.user,
        tenant: data.tenant,
        activeSession: data.activeSession,
        sessionAuditLogs: data.sessionAuditLogs || [],
      });
    } catch {
      setError("Network error while provisioning SaaS workspace.");
    } finally {
      setLoading(false);
    }
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (authMode === "NEW_WORKSPACE") {
      void handleCreateWorkspace(e);
      return;
    }
    if (authMode === "SUPER_ADMIN") {
      submitLogin({
        tenantSlug: workspaceSlugInput.trim() || undefined,
        username: usernameInput.trim(),
        password: passwordInput,
      });
    } else if (selectedStaffUser) {
      submitLogin({
        tenantSlug: workspaceSlugInput.trim() || undefined,
        userId: selectedStaffUser.id,
        pin: pinInput,
      });
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
        submitLogin({
          tenantSlug: workspaceSlugInput.trim() || undefined,
          userId: selectedStaffUser.id,
          pin: next,
        });
      }
    }
  }

  const activeRoleForPreview =
    authMode === "SUPER_ADMIN" || authMode === "NEW_WORKSPACE"
      ? "ADMIN"
      : selectedStaffUser?.role || "CASHIER";

  return (
    <div className="min-h-screen m3-expressive-canvas flex items-center justify-center p-4 sm:p-8">
      <div className="max-w-5xl w-full bg-md-surface-container-lowest border-0 shadow-(--md-elevation-3) rounded-[32px] overflow-hidden grid grid-cols-1 lg:grid-cols-12 md-anim-rise">
        {/* Left 7 Cols: Brand, Workspace Selector & SaaS Tiers / Staff Profiles */}
        <div className="lg:col-span-7 p-6 sm:p-10 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-md-divider">
          <div>
            {/* Brand Row */}
            <div className="flex items-start justify-between gap-4 mb-6">
              <div className="flex items-center gap-4">
                <StackLyraLogo size={52} className="shrink-0 drop-shadow-xs" />
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h1 className="font-display text-[26px] leading-[30px] font-extrabold text-md-on-surface tracking-tight">
                      StackLyra ERP
                    </h1>
                    <StatusChip label="M3 Expressive · SaaS" variant="primary" />
                  </div>
                  <p className="text-sm text-md-on-surface-variant mt-0.5">
                    erp.stacklyra.com · HS256 JWT · Supabase PostgreSQL &amp; Drizzle
                  </p>
                </div>
              </div>
              <ThemeToggle />
            </div>

            {/* Mode Switcher */}
            <div className="mb-6">
              <SegmentedButton
                value={authMode}
                onChange={(mode) => {
                  setAuthMode(mode);
                  setError("");
                  setPinInput("");
                  if (mode === "STAFF_PIN") {
                    void handleLoadWorkspaceStaff();
                  }
                }}
                options={[
                  {
                    value: "SUPER_ADMIN",
                    label: "Owner / Admin",
                    icon: <Lock className="w-3.5 h-3.5" strokeWidth={1.8} />,
                  },
                  {
                    value: "STAFF_PIN",
                    label: "Staff (PIN)",
                    icon: (
                      <UserCheck className="w-3.5 h-3.5" strokeWidth={1.8} />
                    ),
                  },
                  {
                    value: "NEW_WORKSPACE",
                    label: "New Workspace",
                    icon: <Rocket className="w-3.5 h-3.5" strokeWidth={1.8} />,
                  },
                ]}
              />
            </div>

            {authMode === "NEW_WORKSPACE" ? (
              <div className="space-y-4">
                <h2 className="text-xs font-medium uppercase tracking-wider text-md-on-surface-variant">
                  Choose Your StackLyra ERP SaaS Plan (14-Day Free Trial)
                </h2>
                <div className="space-y-2.5">
                  {Object.values(SAAS_PLANS).map((plan) => {
                    const selected = orgPlanId === plan.planId;
                    return (
                      <div
                        key={plan.planId}
                        onClick={() => setOrgPlanId(plan.planId)}
                        className={`p-4 rounded-2xl cursor-pointer transition-all ${
                          selected
                            ? "bg-md-primary-container/50 ring-2 ring-md-primary"
                            : "bg-md-surface-container-low hover:bg-md-surface-container-high/70"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-md-on-surface">
                              {plan.name}
                            </span>
                            <StatusChip
                              label={`Up to ${
                                plan.maxSeats > 500 ? "Unlimited" : plan.maxSeats
                              } staff`}
                              variant={selected ? "primary" : "neutral"}
                            />
                          </div>
                          <span className="font-mono text-xs font-semibold text-md-primary">
                            PKR {plan.monthlyPricePkr.toLocaleString()}/mo · \$
                            {plan.monthlyPriceUsd}/mo
                          </span>
                        </div>
                        <p className="text-xs text-md-on-surface-variant mt-1">
                          {plan.tagline}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : authMode === "STAFF_PIN" ? (
              <>
                <div className="mb-4">
                  <label className="block text-xs font-medium text-md-on-surface-variant mb-1.5">
                    Workspace Slug ({workspaceDisplayName})
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={workspaceSlugInput}
                      onChange={(e) =>
                        setWorkspaceSlugInput(
                          e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")
                        )
                      }
                      placeholder="e.g. stacklyra"
                      className="flex-1 h-10 px-3 rounded-[10px] bg-md-surface-container-low border border-md-outline-variant text-sm font-mono text-md-on-surface outline-none focus:border-md-primary"
                    />
                    <Button
                      type="button"
                      variant="tonal"
                      size="sm"
                      disabled={loadingWorkspace}
                      onClick={() => void handleLoadWorkspaceStaff()}
                      icon={<Search className="w-3.5 h-3.5" />}
                    >
                      {loadingWorkspace ? "Loading…" : "Load Staff"}
                    </Button>
                  </div>
                </div>

                <h2 className="text-xs font-medium uppercase tracking-wider text-md-on-surface-variant mb-3">
                  Staff Profiles (Manager &amp; Cashier)
                </h2>
                {staffProfiles.length === 0 ? (
                  <Card
                    variant="tonal"
                    className="text-sm text-md-on-surface-variant"
                  >
                    No staff PIN profiles found in workspace{" "}
                    <code className="font-mono">{workspaceSlugInput}</code>.
                    Sign in as Owner / Admin to add staff profiles under People
                    &amp; HR.
                  </Card>
                ) : (
                  <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                    {staffProfiles.map((u) => {
                      const isSelected = selectedStaffUser?.id === u.id;

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
                              </div>
                              <div className="text-sm text-md-on-surface-variant mt-0.5">
                                {u.title}
                                <span className="ml-1.5 text-xs">
                                  · Staff PIN Required
                                </span>
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
                )}
              </>
            ) : (
              <Card variant="tonal" className="space-y-3">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <StatusChip label="WORKSPACE OWNER / ADMIN" variant="primary" />
                  <span className="text-xs font-medium text-md-on-surface-variant">
                    Tenant-Isolated Session Authentication
                  </span>
                </div>
                <p className="text-sm text-md-on-surface leading-relaxed">
                  Every organization on <strong>StackLyra ERP</strong> runs inside
                  an isolated tenant boundary backed by salted{" "}
                  <code className="font-mono text-xs bg-md-surface-container-high px-1.5 py-0.5 rounded">
                    scrypt
                  </code>{" "}
                  password hashing and Supabase PostgreSQL + Drizzle ORM.
                </p>
                <p className="text-xs text-md-on-surface-variant">
                  Full control over your organization&apos;s financial ledgers,
                  party Khata accounts, catalog items, invoices, PRA e-IMS
                  settings, subscription plan, and staff profiles.
                </p>
              </Card>
            )}
          </div>

          {/* Role Capabilities Box */}
          <Card variant="tonal" className="mt-6 p-4! space-y-1.5">
            <div className="text-sm font-medium text-md-on-surface flex items-center gap-2">
              <ShieldCheck
                className="w-4 h-4 text-md-primary"
                strokeWidth={1.8}
              />
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
                    ? "Full Owner Access"
                    : "Restricted"}
                </strong>
              </span>
              <span>
                • Delete Items &amp; Void Invoices:{" "}
                <strong className="text-md-on-surface">
                  {hasGranularPermission(
                    activeRoleForPreview,
                    "invoices:delete"
                  )
                    ? "Allowed"
                    : "Owner / Admin Only"}
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

        {/* Right 5 Cols: Sign-In Form, PIN Keypad, or Workspace Registration */}
        <div className="lg:col-span-5 bg-md-surface-container-low p-6 sm:p-10 flex flex-col justify-center">
          <form
            onSubmit={handleFormSubmit}
            className="space-y-4 max-w-xs mx-auto w-full"
          >
            <div className="text-center">
              <div className="w-13 h-13 rounded-[18px] bg-md-primary text-md-on-primary shadow-[0_6px_16px_rgba(255,91,31,0.32)] flex items-center justify-center mx-auto mb-3.5">
                {authMode === "NEW_WORKSPACE" ? (
                  <Building2 className="w-5 h-5" strokeWidth={2} />
                ) : authMode === "SUPER_ADMIN" ? (
                  <Lock className="w-5 h-5" strokeWidth={2} />
                ) : (
                  <KeyRound className="w-5 h-5" strokeWidth={2} />
                )}
              </div>
              <h3 className="font-display text-[24px] leading-[30px] font-bold text-md-on-surface">
                {authMode === "NEW_WORKSPACE"
                  ? "Create SaaS Workspace"
                  : authMode === "SUPER_ADMIN"
                  ? "Workspace Sign-In"
                  : "Staff PIN Sign-In"}
              </h3>
              <p className="text-sm text-md-on-surface-variant mt-1">
                {authMode === "NEW_WORKSPACE" ? (
                  "Provision your isolated organization in seconds"
                ) : authMode === "SUPER_ADMIN" ? (
                  "Sign in with your Owner / Admin credentials"
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

            {authMode === "NEW_WORKSPACE" ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-md-on-surface-variant mb-1">
                    Business / Organization Name
                  </label>
                  <input
                    type="text"
                    required
                    value={orgNameInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      setOrgNameInput(val);
                      if (!orgSlugInput || orgSlugInput === orgNameInput.toLowerCase().replace(/[^a-z0-9-]/g, "-")) {
                        setOrgSlugInput(
                          val
                            .toLowerCase()
                            .replace(/[^a-z0-9-]/g, "-")
                            .replace(/-+/g, "-")
                            .replace(/^-|-$/g, "")
                        );
                      }
                    }}
                    placeholder="e.g. Crescent Retail & Cafe"
                    className="w-full h-10 px-3 rounded-[10px] bg-md-surface-container-lowest border border-md-outline-variant text-sm text-md-on-surface outline-none focus:border-md-primary"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-md-on-surface-variant mb-1">
                      Workspace Slug
                    </label>
                    <input
                      type="text"
                      required
                      value={orgSlugInput}
                      onChange={(e) =>
                        setOrgSlugInput(
                          e.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9-]/g, "")
                        )
                      }
                      placeholder="crescent"
                      className="w-full h-10 px-3 rounded-[10px] bg-md-surface-container-lowest border border-md-outline-variant text-xs font-mono text-md-on-surface outline-none focus:border-md-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-md-on-surface-variant mb-1">
                      Industry Segment
                    </label>
                    <select
                      value={orgSegment}
                      onChange={(e) =>
                        setOrgSegment(
                          e.target.value as "RESTAURANT" | "RETAIL" | "HYBRID"
                        )
                      }
                      className="w-full h-10 px-2.5 rounded-[10px] bg-md-surface-container-lowest border border-md-outline-variant text-xs text-md-on-surface outline-none focus:border-md-primary"
                    >
                      <option value="HYBRID">Restaurant + Retail</option>
                      <option value="RESTAURANT">Restaurant / Cafe</option>
                      <option value="RETAIL">Retail / POS Store</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-md-on-surface-variant mb-1">
                    Owner Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={ownerNameInput}
                    onChange={(e) => setOwnerNameInput(e.target.value)}
                    placeholder="Your full name"
                    className="w-full h-10 px-3 rounded-[10px] bg-md-surface-container-lowest border border-md-outline-variant text-sm text-md-on-surface outline-none focus:border-md-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-md-on-surface-variant mb-1">
                    Owner Work Email
                  </label>
                  <input
                    type="email"
                    required
                    value={ownerEmailInput}
                    onChange={(e) => setOwnerEmailInput(e.target.value)}
                    placeholder="owner@company.com"
                    className="w-full h-10 px-3 rounded-[10px] bg-md-surface-container-lowest border border-md-outline-variant text-sm text-md-on-surface outline-none focus:border-md-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-md-on-surface-variant mb-1">
                    Password (min 8 chars)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={ownerPasswordInput}
                    onChange={(e) => setOwnerPasswordInput(e.target.value)}
                    placeholder="Create strong password"
                    className="w-full h-10 px-3 rounded-[10px] bg-md-surface-container-lowest border border-md-outline-variant text-sm text-md-on-surface outline-none focus:border-md-primary"
                  />
                </div>

                <Button
                  type="submit"
                  variant="filled"
                  size="lg"
                  disabled={loading}
                  className="w-full"
                >
                  {loading
                    ? "Provisioning Workspace…"
                    : `Launch ${SAAS_PLANS[orgPlanId].name} Workspace`}
                </Button>
              </div>
            ) : authMode === "SUPER_ADMIN" ? (
              <div className="space-y-3.5">
                <div className="space-y-1">
                  <label
                    htmlFor="workspace-slug"
                    className="block text-xs font-medium text-md-on-surface-variant"
                  >
                    Workspace Slug (optional if using email)
                  </label>
                  <input
                    id="workspace-slug"
                    type="text"
                    value={workspaceSlugInput}
                    onChange={(e) => {
                      setError("");
                      setWorkspaceSlugInput(
                        e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")
                      );
                    }}
                    placeholder="stacklyra"
                    className="w-full h-11 px-3.5 rounded-[10px] bg-md-surface-container-lowest border border-md-outline-variant/85 focus:border-md-primary text-xs font-mono text-md-on-surface outline-none transition-all"
                  />
                </div>

                <div className="space-y-1">
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
                    placeholder="Enter username or email"
                    className="w-full h-12 px-3.5 rounded-[10px] bg-md-surface-container-lowest border border-md-outline-variant/85 focus:border-md-primary focus:ring-3 focus:ring-md-primary/12 text-sm text-md-on-surface placeholder:text-md-on-surface-variant/60 outline-none transition-all"
                  />
                </div>

                <div className="space-y-1">
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
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
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
                  {loading ? "Verifying…" : "Sign In to Workspace"}
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
                    disabled={
                      loading || pinInput.length < 4 || !selectedStaffUser
                    }
                    className="h-12 rounded-full border-0 bg-md-primary hover:bg-md-primary-strong disabled:opacity-45 text-md-on-primary shadow-sm font-medium text-sm transition-all duration-150 hover:-translate-y-px hover:scale-[1.02] active:scale-[0.97]"
                  >
                    {loading ? "..." : "Sign In"}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
