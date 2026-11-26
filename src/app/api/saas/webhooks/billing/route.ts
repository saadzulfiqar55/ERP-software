import crypto from "crypto";
import { NextResponse } from "next/server";
import { mapDataLayerError, withTransaction } from "@/core/db";
import {
  buildTenantSubscription,
  SAAS_PLANS,
} from "@/core/saas/entitlements";
import { sanitizeNoSqlPayload } from "@/core/validation";
import { getCorsHeaders, STACKLYRA_CONFIG } from "@/lib/config";
import { findTenantStrict } from "@/lib/db";
import { SubscriptionPlanId, TenantStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request.headers.get("origin")),
  });
}

/**
 * POST /api/saas/webhooks/billing
 * Receives subscription lifecycle events from `stacklyra.com` checkout or payment gateways
 * (Stripe, Paddle, PayFast, or Manual IBFT verification).
 *
 * Authentication (all required):
 * - `BILLING_WEBHOOK_SECRET` must be configured on the server; otherwise every call is rejected.
 * - Header `X-StackLyra-Timestamp`: Unix time in seconds, within ±5 minutes of server time.
 * - Header `X-StackLyra-Signature`: lowercase hex HMAC-SHA256 of `${timestamp}.${rawBody}`
 *   keyed with `BILLING_WEBHOOK_SECRET`. The raw secret itself is never accepted.
 */
const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;
const VALID_TENANT_STATUSES: TenantStatus[] = [
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "SUSPENDED",
];

export async function POST(request: Request) {
  const cors = getCorsHeaders(request.headers.get("origin"));
  try {
    const secret = STACKLYRA_CONFIG.billingWebhookSecret;
    if (!secret) {
      return NextResponse.json(
        { error: "Billing webhook is not configured on this server." },
        { status: 503, headers: cors }
      );
    }

    const rawText = await request.text();
    const signature = (
      request.headers.get("x-stacklyra-signature")?.trim() || ""
    ).toLowerCase();
    const timestampHeader =
      request.headers.get("x-stacklyra-timestamp")?.trim() || "";
    const timestamp = Number(timestampHeader);
    const nowSeconds = Math.floor(Date.now() / 1000);

    if (
      !/^\d+$/.test(timestampHeader) ||
      Math.abs(nowSeconds - timestamp) > WEBHOOK_TOLERANCE_SECONDS
    ) {
      return NextResponse.json(
        { error: "Missing or expired billing webhook timestamp." },
        { status: 401, headers: cors }
      );
    }

    const expectedHmac = crypto
      .createHmac("sha256", secret)
      .update(`${timestampHeader}.${rawText}`)
      .digest("hex");

    const isAuthorized =
      /^[0-9a-f]{64}$/.test(signature) &&
      crypto.timingSafeEqual(
        Buffer.from(signature, "hex"),
        Buffer.from(expectedHmac, "hex")
      );

    if (!isAuthorized) {
      return NextResponse.json(
        { error: "Invalid billing webhook signature." },
        { status: 401, headers: cors }
      );
    }

    const body = sanitizeNoSqlPayload(JSON.parse(rawText));
    const tenantIdentifier = String(
      body.tenantId || body.tenantSlug || ""
    ).trim();
    const tenant = await findTenantStrict(tenantIdentifier);

    if (!tenant) {
      return NextResponse.json(
        { error: `Tenant "${tenantIdentifier}" not found.` },
        { status: 404, headers: cors }
      );
    }

    const eventType = String(
      body.event || "subscription.activated"
    ).toLowerCase();

    // Read the current plan/status and write the new one under the tenant lock.
    const { db } = await withTransaction(
      (txDb) => {
        const current = txDb.tenant;
        const planId = (
          SAAS_PLANS[body.planId as SubscriptionPlanId]
            ? body.planId
            : current.planId
        ) as SubscriptionPlanId;

        let nextStatus: TenantStatus = current.status;
        if (
          eventType === "subscription.activated" ||
          eventType === "checkout.completed" ||
          eventType === "invoice.paid"
        ) {
          nextStatus = "ACTIVE";
        } else if (eventType === "invoice.payment_failed") {
          nextStatus = "PAST_DUE";
        } else if (
          eventType === "subscription.suspended" ||
          eventType === "subscription.canceled"
        ) {
          nextStatus = "SUSPENDED";
        } else if (
          VALID_TENANT_STATUSES.includes(String(body.status) as TenantStatus)
        ) {
          nextStatus = body.status as TenantStatus;
        }

        const updatedSub = buildTenantSubscription(
          planId,
          nextStatus,
          body.billingCycle === "ANNUAL" ? "ANNUAL" : "MONTHLY",
          body.provider || "STRIPE"
        );
        if (body.externalSubscriptionId) {
          updatedSub.externalSubscriptionId = String(body.externalSubscriptionId);
        }

        txDb.tenant = {
          ...current,
          planId,
          status: nextStatus,
          subscription: updatedSub,
          updatedAt: new Date().toISOString(),
        };
      },
      undefined,
      tenant.id,
      { readBack: false }
    );

    return NextResponse.json(
      {
        received: true,
        event: eventType,
        tenantId: db.tenant.id,
        slug: db.tenant.slug,
        planId: db.tenant.planId,
        status: db.tenant.status,
      },
      { headers: cors }
    );
  } catch (err) {
    const dataLayer = mapDataLayerError(err);
    if (dataLayer) {
      return NextResponse.json(dataLayer.body, { status: dataLayer.status, headers: cors });
    }
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Webhook processing failed",
      },
      { status: 400, headers: cors }
    );
  }
}
