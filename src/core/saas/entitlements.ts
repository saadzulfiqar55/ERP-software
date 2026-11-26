import {
  PlanEntitlements,
  SaaSFeatureKey,
  SubscriptionPlanId,
  TenantOrganization,
  TenantStatus,
  TenantSubscription,
} from "@/lib/types";

export const SAAS_PLANS: Record<SubscriptionPlanId, PlanEntitlements> = {
  starter: {
    planId: "starter",
    name: "Starter",
    tagline: "Single-counter POS, catalog & invoicing for growing shops and cafes",
    monthlyPricePkr: 4500,
    monthlyPriceUsd: 19,
    maxSeats: 3,
    maxBranches: 1,
    maxProducts: 150,
    features: [
      "pos_terminal",
      "invoices",
      "inventory_catalog",
      "material_stock",
      "shift_reconciliation",
    ],
  },
  growth: {
    planId: "growth",
    name: "Growth",
    tagline: "Full double-entry Khata ledger, PRA e-IMS fiscalization & multi-staff control",
    monthlyPricePkr: 9500,
    monthlyPriceUsd: 39,
    maxSeats: 15,
    maxBranches: 3,
    maxProducts: 2000,
    features: [
      "pos_terminal",
      "invoices",
      "inventory_catalog",
      "material_stock",
      "khata_ledger",
      "pra_fiscalization",
      "shift_reconciliation",
      "audit_trail",
    ],
  },
  enterprise: {
    planId: "enterprise",
    name: "Enterprise",
    tagline: "Unlimited staff, multi-branch operations, fiscal period locks & priority SLA",
    monthlyPricePkr: 24000,
    monthlyPriceUsd: 99,
    maxSeats: 9999,
    maxBranches: 50,
    maxProducts: 99999,
    features: [
      "pos_terminal",
      "invoices",
      "inventory_catalog",
      "material_stock",
      "khata_ledger",
      "pra_fiscalization",
      "shift_reconciliation",
      "fiscal_period_locks",
      "audit_trail",
      "multi_branch",
    ],
  },
};

export function buildTenantSubscription(
  planId: SubscriptionPlanId = "growth",
  status: TenantStatus = "TRIALING",
  billingCycle: "MONTHLY" | "ANNUAL" = "MONTHLY",
  provider: TenantSubscription["provider"] = "TRIAL"
): TenantSubscription {
  const plan = SAAS_PLANS[planId] || SAAS_PLANS.growth;
  const now = Date.now();
  const trialEndsAt =
    status === "TRIALING"
      ? new Date(now + 14 * 24 * 60 * 60 * 1000).toISOString()
      : undefined;
  const periodDays = billingCycle === "ANNUAL" ? 365 : 30;
  const currentPeriodEnd =
    trialEndsAt ||
    new Date(now + periodDays * 24 * 60 * 60 * 1000).toISOString();

  return {
    planId: plan.planId,
    status,
    billingCycle,
    provider,
    trialEndsAt,
    currentPeriodEnd,
    maxSeats: plan.maxSeats,
    maxBranches: plan.maxBranches,
    maxProducts: plan.maxProducts,
    features: [...plan.features],
  };
}

export class SaaSEntitlementError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, code: string = "PLAN_LIMIT_REACHED", statusCode: number = 402) {
    super(message);
    this.name = "SaaSEntitlementError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Verifies the tenant subscription is allowed to perform write operations.
 * Suspended tenants are placed in a safe read-only lock (data is never deleted).
 */
export function assertTenantWriteActive(tenant: TenantOrganization): void {
  if (tenant.status === "SUSPENDED" || tenant.subscription.status === "SUSPENDED") {
    throw new SaaSEntitlementError(
      `Subscription Suspended: Workspace "${tenant.name}" is currently in read-only mode. Renew your StackLyra ERP plan to resume creating transactions.`,
      "SUBSCRIPTION_SUSPENDED",
      402
    );
  }
}

export function hasTenantFeature(
  tenant: TenantOrganization,
  feature: SaaSFeatureKey
): boolean {
  const features =
    tenant.subscription?.features ||
    SAAS_PLANS[tenant.planId]?.features ||
    SAAS_PLANS.growth.features;
  return features.includes(feature);
}

export function assertTenantFeature(
  tenant: TenantOrganization,
  feature: SaaSFeatureKey,
  featureLabel: string
): void {
  assertTenantWriteActive(tenant);
  if (!hasTenantFeature(tenant, feature)) {
    const planName = SAAS_PLANS[tenant.planId]?.name || tenant.planId;
    throw new SaaSEntitlementError(
      `Plan Upgrade Required: "${featureLabel}" is not included in the ${planName} plan. Upgrade to Growth or Enterprise to unlock this module.`,
      "FEATURE_NOT_IN_PLAN",
      402
    );
  }
}

export function assertTenantSeatQuota(
  tenant: TenantOrganization,
  currentActiveStaffCount: number
): void {
  assertTenantWriteActive(tenant);
  const maxSeats =
    tenant.subscription?.maxSeats ??
    SAAS_PLANS[tenant.planId]?.maxSeats ??
    3;
  if (currentActiveStaffCount >= maxSeats) {
    const planName = SAAS_PLANS[tenant.planId]?.name || tenant.planId;
    throw new SaaSEntitlementError(
      `Seat Quota Reached: Your ${planName} plan allows up to ${maxSeats} staff profiles (currently ${currentActiveStaffCount}). Upgrade your plan to add more staff.`,
      "SEAT_LIMIT_REACHED",
      402
    );
  }
}

export function assertTenantProductQuota(
  tenant: TenantOrganization,
  currentActiveProductCount: number
): void {
  assertTenantWriteActive(tenant);
  const maxProducts =
    tenant.subscription?.maxProducts ??
    SAAS_PLANS[tenant.planId]?.maxProducts ??
    150;
  if (currentActiveProductCount >= maxProducts) {
    const planName = SAAS_PLANS[tenant.planId]?.name || tenant.planId;
    throw new SaaSEntitlementError(
      `Catalog Quota Reached: Your ${planName} plan allows up to ${maxProducts} active catalog items. Upgrade your plan for higher capacity.`,
      "PRODUCT_LIMIT_REACHED",
      402
    );
  }
}
