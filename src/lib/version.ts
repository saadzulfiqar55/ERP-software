import packageJson from "../../package.json";

export interface SocialLinkItem {
  id: "github" | "linkedin" | "x" | "instagram";
  label: string;
  handle: string;
  href: string;
  isConfigured: boolean;
}

export interface ReleaseNoteItem {
  version: string;
  stage: string;
  summary: string;
  highlights: string[];
}

/** Single source of truth derived from package.json ("0.5.0" pre-production baseline). */
export const ERP_VERSION = packageJson.version;
export const ERP_VERSION_TAG = `v${ERP_VERSION}`;
export const ERP_RELEASE_STAGE = "Pre-Production Beta";

export const ERP_AUTHOR = {
  name: "Saad",
  role: "Owner, Creator & Lead Engineer",
  tagline: "Designed & Engineered by Saad",
};

export const ERP_SOCIAL_LINKS: SocialLinkItem[] = [
  {
    id: "github",
    label: "GitHub",
    handle: "@saadzulfiqar55",
    href: "https://github.com/saadzulfiqar55",
    isConfigured: true,
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    handle: "LinkedIn Home",
    href: "https://www.linkedin.com",
    isConfigured: false,
  },
  {
    id: "x",
    label: "X (Twitter)",
    handle: "X Home",
    href: "https://x.com",
    isConfigured: false,
  },
  {
    id: "instagram",
    label: "Instagram",
    handle: "Instagram Home",
    href: "https://www.instagram.com",
    isConfigured: false,
  },
];

export const ERP_VERSION_POLICY = {
  minorStep: "+0.0.1",
  majorStep: "+0.1.0",
  baseline: "v0.5.0",
  note: "Pre-1.0 versioning while undergoing real-world validation: +0.0.1 for patches/minor updates (0.5.0 → 0.5.1), +0.1.0 for major milestones (0.5.x → 0.6.0), reserving v1.0.0 for verified live production.",
};

export const ERP_RELEASES: ReleaseNoteItem[] = [
  {
    version: "v0.5.3",
    stage: ERP_RELEASE_STAGE,
    summary:
      "Instant optimistic CRUD, offline queue resilience, clean POS cart, separated Menu vs Material Stock, and dynamic Tables/Servers & Staff management.",
    highlights: [
      "Emptied default POS cart & added live Add/Remove controls for dining tables and servers",
      "Separated Restaurant Menu (stock-free) from Material Stock CRUD in Inventory",
      "Added People, Staff & Floor Team workspace for Manager/Cashier PIN profiles and servers",
      "Added 15s server warm-cache, minimal Mongo sync sections, localStorage cache & offline sync queue",
    ],
  },
  {
    version: "v0.5.2",
    stage: ERP_RELEASE_STAGE,
    summary:
      "Production clean slate: removed single-session lock, removed all demo entries, and unified brand icon with stacklyra.com.",
    highlights: [
      "Removed single-session terminal lock for concurrent multi-terminal JWT sign-ins",
      "Purged all demo accounts, mock dashboard revenue, and seed business entries",
      "Integrated the StackLyra origami bird mark from stacklyra.com inside the M3 squircle",
    ],
  },
  {
    version: "v0.5.1",
    stage: ERP_RELEASE_STAGE,
    summary:
      "Rebranded platform to StackLyra ERP with the squircle-enclosed Spark Crest identity.",
    highlights: [
      "Renamed workspace titles, shell branding, metadata, and docs to StackLyra ERP",
      "Retained the squircle-enclosed S Spark Crest favicon and StackLyraLogo component",
    ],
  },
  {
    version: "v0.5.0",
    stage: ERP_RELEASE_STAGE,
    summary:
      "Initial pre-production ERP identity refresh, Spark Crest branding, hardened Super Admin auth, and modular system architecture.",
    highlights: [
      "Rebranded workspace & metadata with custom squircle Spark Crest SVG icon",
      "Added shared pre-hydration splash (WorkspaceSplash + src/app/loading.tsx)",
      "Salted scrypt Super Admin auth, HS256 JWT single-session lock, and 13-permission RBAC",
      "Isolated MongoDB Atlas adapter (albarka_erp) with atomic transactional rollback",
      "Dedicated About hub with live version badge and creator social links",
    ],
  },
];
