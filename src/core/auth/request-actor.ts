import { NextResponse } from "next/server";
import { mapDataLayerError } from "@/core/db";
import { getTenantUser } from "@/lib/db";
import { ERPPermission, TenantOrganization, UserProfile } from "@/lib/types";
import { readVerifiedJwtCookie } from "./index";
import { hasGranularPermission } from "./permissions";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

/**
 * Resolves the signed-in user for a read endpoint with a single-row lookup
 * (the full tenant state is not loaded). Throws HttpError 401/403.
 */
export async function requireRequestActor(
  permission?: ERPPermission
): Promise<{ tenant: TenantOrganization; actor: UserProfile }> {
  const verified = await readVerifiedJwtCookie();
  if (!verified) {
    throw new HttpError(401, "Authentication required: Sign in with an active workspace profile.");
  }
  const found = await getTenantUser(verified.decoded.tid, verified.decoded.sub);
  if (!found) {
    throw new HttpError(401, "Your session is no longer valid. Sign in again.");
  }
  if (permission && !hasGranularPermission(found.user.role, permission)) {
    throw new HttpError(
      403,
      `RBAC Access Denied: "${found.user.role}" lacks required permission "${permission}".`
    );
  }
  return { tenant: found.tenant, actor: found.user };
}

/** Error → JSON response for read endpoints. */
export function readErrorResponse(err: unknown): NextResponse {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  const dataLayer = mapDataLayerError(err);
  if (dataLayer) {
    return NextResponse.json(dataLayer.body, { status: dataLayer.status });
  }
  console.error("[api] read failed:", err);
  return NextResponse.json({ error: "Request failed." }, { status: 500 });
}

/** Parses an ISO date/time query parameter; undefined when absent or invalid. */
export function isoParam(value: string | null): string | undefined {
  if (!value) return undefined;
  const t = Date.parse(value);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
}
