import { ERPPermission, UserRole } from "@/lib/types";

export const ROLE_PERMISSION_MATRIX: Record<UserRole, ERPPermission[]> = {
  ADMIN: [
    "pos:sale:create",
    "pos:sale:void",
    "pos:discount:override",
    "inventory:view",
    "inventory:adjust",
    "inventory:archive",
    "accounting:journal:post",
    "accounting:journal:reverse",
    "accounting:period:close",
    "settings:pra:manage",
  ],
  MANAGER: [
    "pos:sale:create",
    "pos:sale:void",
    "pos:discount:override",
    "inventory:view",
    "inventory:adjust",
    "inventory:archive",
    "accounting:journal:post",
    "accounting:journal:reverse",
  ],
  CASHIER: ["pos:sale:create", "inventory:view"],
};

export function hasGranularPermission(
  role: UserRole,
  permission: ERPPermission
): boolean {
  return ROLE_PERMISSION_MATRIX[role]?.includes(permission) ?? false;
}
