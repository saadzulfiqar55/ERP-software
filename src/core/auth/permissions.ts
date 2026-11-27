import { ERPPermission, UserProfile, UserRole } from "@/lib/types";

export const ROLE_HIERARCHY_RANK: Record<UserRole, number> = {
  ADMIN: 3,
  MANAGER: 2,
  CASHIER: 1,
};

/**
 * Strict 3-Tier ERP Hierarchy:
 * - ADMIN (Owner / Super Admin): Full control over profiles, ledger/Khata, item archival, invoice deletion, PRA & MongoDB settings.
 * - MANAGER: Operations lead — POS, discounts, sales/invoices (non-destructive), inventory adjustments/pricing. Cannot access ledger, delete items/invoices, or manage profiles.
 * - CASHIER: Frontline POS & read-only catalog / non-destructive invoice creation.
 */
export const ROLE_PERMISSION_MATRIX: Record<UserRole, ERPPermission[]> = {
  ADMIN: [
    "pos:sale:create",
    "pos:sale:void",
    "pos:discount:override",
    "inventory:view",
    "inventory:adjust",
    "inventory:archive",
    "invoices:delete",
    "accounting:ledger:view",
    "accounting:journal:post",
    "accounting:journal:reverse",
    "accounting:period:close",
    "settings:pra:manage",
    "users:manage",
    "purchasing:manage",
    "purchasing:receive",
  ],
  MANAGER: [
    "pos:sale:create",
    "pos:discount:override",
    "inventory:view",
    "inventory:adjust",
    "purchasing:manage",
    "purchasing:receive",
  ],
  CASHIER: ["pos:sale:create", "inventory:view"],
};

export function hasGranularPermission(
  role: UserRole,
  permission: ERPPermission
): boolean {
  return ROLE_PERMISSION_MATRIX[role]?.includes(permission) ?? false;
}

export function isSuperAdminRole(role: UserRole): boolean {
  return role === "ADMIN";
}

export function buildRoleLegacyPermissions(
  role: UserRole
): UserProfile["permissions"] {
  if (role === "ADMIN") {
    return {
      canEditPraSettings: true,
      canManageMenuPricing: true,
      canApproveDiscounts: true,
      canManageKhata: true,
      canViewFinancialReports: true,
    };
  }
  if (role === "MANAGER") {
    return {
      canEditPraSettings: false,
      canManageMenuPricing: true,
      canApproveDiscounts: true,
      canManageKhata: false,
      canViewFinancialReports: true,
    };
  }
  return {
    canEditPraSettings: false,
    canManageMenuPricing: false,
    canApproveDiscounts: false,
    canManageKhata: false,
    canViewFinancialReports: false,
  };
}
