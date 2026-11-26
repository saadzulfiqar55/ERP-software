/**
 * Centralized StackLyra ERP SaaS Domain, Cookie & CORS Configuration
 * Supports seamless transition between `app.stacklyra.com`, `erp.stacklyra.com`,
 * vanity workspace subdomains (`<slug>.erp.stacklyra.com`), and `stacklyra.com`.
 */

export const STACKLYRA_CONFIG = {
  productName: "StackLyra ERP",
  appUrl:
    process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://erp.stacklyra.com",
  legacyAppUrl: "https://app.stacklyra.com",
  marketingUrl:
    process.env.NEXT_PUBLIC_MARKETING_URL?.trim() || "https://stacklyra.com",
  cookieName: "stacklyra_session_jwt",
  legacyCookieName: "albarka_session_jwt",
  cookieDomain: process.env.COOKIE_DOMAIN?.trim() || undefined,
  // No fallback: the billing webhook refuses every request until a real secret is configured.
  billingWebhookSecret: process.env.BILLING_WEBHOOK_SECRET?.trim() || "",
  allowedCorsOrigins: (
    process.env.ALLOWED_CORS_ORIGINS ||
    "https://stacklyra.com,https://www.stacklyra.com,https://app.stacklyra.com,https://erp.stacklyra.com,http://localhost:3000"
  )
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
};

export function buildSessionCookieOptions(maxAgeSeconds: number = 8 * 60 * 60) {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    path: "/",
    sameSite: "lax" as const,
    maxAge: maxAgeSeconds,
    ...(isProd && STACKLYRA_CONFIG.cookieDomain
      ? { domain: STACKLYRA_CONFIG.cookieDomain }
      : {}),
  };
}

export function getCorsHeaders(requestOrigin?: string | null): Record<string, string> {
  const origin = requestOrigin?.trim() || "";
  const isAllowed =
    STACKLYRA_CONFIG.allowedCorsOrigins.includes(origin) ||
    /^https:\/\/([a-z0-9-]+\.)?stacklyra\.com$/i.test(origin);

  const allowOrigin = isAllowed
    ? origin
    : STACKLYRA_CONFIG.allowedCorsOrigins[0] || "https://stacklyra.com";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-StackLyra-Signature, X-StackLyra-Timestamp, X-Tenant-Slug",
    "Access-Control-Allow-Credentials": "true",
  };
}
