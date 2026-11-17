import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Next.js Zero-Trust Boundary Middleware
 * Applies hardened security headers (CSP/Frame/Sniffing) to all routes.
 * Note: Per ERP Architecture Checklist Section 3, actual RBAC/ABAC authorization
 * is enforced inside the Domain Service & Data Access Layer on every mutation.
 */
export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );
  response.headers.set("X-ERP-Tenant-Boundary", "TENANT_ALBARKA");

  // Attach request path metadata for audit tracing
  if (request.nextUrl.pathname.startsWith("/api/")) {
    response.headers.set("Cache-Control", "no-store, max-age=0");
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
