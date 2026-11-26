import {
  LedgerEntry,
  Order,
  PartyAccount,
  PRAConfig,
  Product,
  UserProfile,
} from "./types";

export const INITIAL_USERS: UserProfile[] = [
  {
    id: "user-admin-1",
    tenantId: "ten-stacklyra",
    tenantSlug: "stacklyra",
    branchId: "BRANCH_MAIN",
    name: "Saad",
    username: "saad",
    role: "ADMIN",
    membershipRole: "OWNER",
    isPlatformAdmin: true,
    title: "Platform Owner & Super Admin",
    email: "saad@stacklyra.com",
    pin: "",
    authType: "PASSWORD",
    isDemoAccount: false,
    // No password is shipped in source. On a fresh install the Super Admin signs in with the
    // ADMIN_USERNAME / ADMIN_PASSWORD environment variables, then rotates to a stored hash
    // from Settings (which disables the env override).
    passwordHash: undefined,
    avatarInitials: "SA",
    badgeColor: "crimson",
    permissions: {
      canEditPraSettings: true,
      canManageMenuPricing: true,
      canApproveDiscounts: true,
      canManageKhata: true,
      canViewFinancialReports: true,
    },
  },
];

export const INITIAL_PRA_CONFIG: PRAConfig = {
  restaurantName: "StackLyra Workspace",
  branchName: "Main Branch",
  ntn: "",
  strn: "",
  posId: "",
  imsEndpointUrl: "",
  apiToken: "",
  cashTaxRate: 16,
  cardTaxRate: 5,
  retailTaxRate: 18,
  serviceChargePercent: 5,
  praLiveMode: false,
};

export const INITIAL_PRODUCTS: Product[] = [];

export const INITIAL_PARTIES: PartyAccount[] = [];

export const INITIAL_ORDERS: Order[] = [];

export const INITIAL_LEDGER: LedgerEntry[] = [];
