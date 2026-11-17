import { ERPPermission } from "./types";

export const ERP_BRAND_CONFIG = {
  productName: "Albarka ERP",
  workspaceSubtitle: "Enterprise & POS Workspace",
  logoLetter: "A",
};

export type ERPNavKey =
  | "dashboard"
  | "pos"
  | "sales"
  | "purchasing"
  | "inventory"
  | "invoices"
  | "accounting"
  | "hr"
  | "reports"
  | "settings";

export interface NavItemConfig {
  key: ERPNavKey;
  label: string;
  href: string;
  iconName:
    | "LayoutDashboard"
    | "Store"
    | "ShoppingBag"
    | "Truck"
    | "Package"
    | "FileText"
    | "BookOpen"
    | "Users"
    | "BarChart3"
    | "Settings";
  permission: ERPPermission;
  badgeCount?: number;
  section: "PRIMARY" | "SYSTEM";
}

export const ERP_NAVIGATION_ITEMS: NavItemConfig[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    href: "/dashboard",
    iconName: "LayoutDashboard",
    permission: "inventory:view",
    section: "PRIMARY",
  },
  {
    key: "pos",
    label: "POS Terminal",
    href: "/pos",
    iconName: "Store",
    permission: "pos:sale:create",
    section: "PRIMARY",
  },
  {
    key: "sales",
    label: "Sales",
    href: "/sales",
    iconName: "ShoppingBag",
    permission: "pos:sale:create",
    section: "PRIMARY",
  },
  {
    key: "purchasing",
    label: "Purchasing",
    href: "/purchasing",
    iconName: "Truck",
    permission: "accounting:ledger:view",
    section: "PRIMARY",
  },
  {
    key: "inventory",
    label: "Inventory",
    href: "/inventory",
    iconName: "Package",
    permission: "inventory:view",
    section: "PRIMARY",
  },
  {
    key: "invoices",
    label: "Invoices",
    href: "/invoices",
    iconName: "FileText",
    permission: "pos:sale:create",
    section: "PRIMARY",
  },
  {
    key: "accounting",
    label: "Accounting",
    href: "/accounting",
    iconName: "BookOpen",
    permission: "accounting:ledger:view",
    section: "PRIMARY",
  },
  {
    key: "hr",
    label: "People & HR",
    href: "/hr",
    iconName: "Users",
    permission: "accounting:ledger:view",
    section: "PRIMARY",
  },
  {
    key: "reports",
    label: "Reports",
    href: "/reports",
    iconName: "BarChart3",
    permission: "inventory:view",
    section: "PRIMARY",
  },
  {
    key: "settings",
    label: "Settings",
    href: "/settings",
    iconName: "Settings",
    permission: "inventory:view",
    section: "SYSTEM",
  },
];
