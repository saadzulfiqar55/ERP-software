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
    name: "Saad",
    username: "saad",
    role: "ADMIN",
    title: "Owner & Super Admin",
    email: "saad@albarkarestaurant.pk",
    pin: "",
    authType: "PASSWORD",
    isDemoAccount: false,
    // Salted scrypt hash for the default Super Admin password (overridable via ADMIN_PASSWORD env var)
    passwordHash:
      "scrypt$cf29d13218fd4a8a717131b2ea5846ee$a6c00c5fec6ca8a0839e9445047ca2c1d369f536e2dfd54235b54c41fda8b4db7b917df880bfc5f155bf43dba150ad5df50c3a8d79fc61f085e5acac8e54cfc7",
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
  branchName: "",
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
